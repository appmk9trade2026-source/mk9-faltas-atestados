-- 1) Snapshot passa a ser tabela física renomeada; nome antigo vira visão viva
ALTER TABLE public.bi_absenteismo_diario RENAME TO bi_absenteismo_diario_snapshot;

CREATE VIEW public.bi_absenteismo_diario
WITH (security_invoker = on) AS
SELECT
  COALESCE(a.data_inicio::date, a.created_at::date) AS data_referencia,
  c.empresa_id,
  c.projeto_id,
  t.categoria_ausencia_id AS categoria_id,
  a.tipo_ausencia_id,
  COALESCE(a.status::text, 'PENDENTE') AS status,
  COUNT(*)::int AS total_registros,
  COUNT(DISTINCT a.colaborador_id)::int AS total_colaboradores_afetados,
  COALESCE(SUM(NULLIF(COALESCE(a.dias, a.quantidade_dias_calculada), 0)), 0)::numeric AS total_dias_ausencia,
  COALESCE(SUM(NULLIF(COALESCE(a.dias, a.quantidade_dias_calculada), 0) * 8), 0)::numeric AS total_horas_estimadas,
  COUNT(*) FILTER (WHERE cat.codigo = 'ATESTADOS')::int AS atestados,
  COUNT(*) FILTER (WHERE cat.codigo = 'FALTAS')::int AS faltas,
  COUNT(*) FILTER (WHERE cat.codigo = 'LICENCAS')::int AS licencas,
  COUNT(*) FILTER (WHERE cat.codigo = 'AFASTAMENTOS')::int AS afastamentos,
  COUNT(*) FILTER (WHERE cat.codigo = 'MEDIDAS_ADMINISTRATIVAS')::int AS medidas_administrativas,
  COUNT(*) FILTER (WHERE cat.codigo = 'OUTROS' OR cat.codigo IS NULL)::int AS outros,
  COUNT(*) FILTER (WHERE COALESCE(a.dias, a.quantidade_dias_calculada) IS NULL
                      OR COALESCE(a.dias, a.quantidade_dias_calculada) = 0)::int AS sem_duracao
FROM public.ausencias a
LEFT JOIN public.colaboradores c ON c.id = a.colaborador_id
LEFT JOIN public.tipos_ausencia t ON t.id = a.tipo_ausencia_id
LEFT JOIN public.categorias_ausencia cat ON cat.id = t.categoria_ausencia_id
WHERE COALESCE(a.data_inicio::date, a.created_at::date) IS NOT NULL
GROUP BY 1,2,3,4,5,6;

REVOKE ALL ON public.bi_absenteismo_diario FROM PUBLIC;
REVOKE ALL ON public.bi_absenteismo_diario FROM anon, authenticated;

-- 2) Refresh do snapshot aponta para a tabela renomeada
CREATE OR REPLACE FUNCTION public.refresh_bi_absenteismo(p_origem text DEFAULT 'MANUAL')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_exec_id uuid := gen_random_uuid();
  v_start timestamptz := clock_timestamp();
  v_rows int := 0;
  v_locked boolean;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR p_origem <> 'MANUAL') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  v_locked := pg_try_advisory_lock(hashtext('refresh_bi_absenteismo'));
  IF NOT v_locked THEN
    INSERT INTO public.bi_refresh_execucoes(execution_id,status,origem,finalizado_em,duracao_ms,mensagem_resumida)
    VALUES (v_exec_id,'IGNORADO_POR_LOCK',p_origem,now(),0,'Outra execução em andamento');
    RETURN jsonb_build_object('status','IGNORADO_POR_LOCK','execution_id',v_exec_id);
  END IF;
  BEGIN
    INSERT INTO public.bi_refresh_execucoes(execution_id,status,origem,mensagem_resumida)
    VALUES (v_exec_id,'INICIADO',p_origem,'Refresh iniciado');
    TRUNCATE public.bi_absenteismo_diario_snapshot;
    INSERT INTO public.bi_absenteismo_diario_snapshot (
      data_referencia, empresa_id, projeto_id, categoria_id, tipo_ausencia_id, status,
      total_registros, total_colaboradores_afetados, total_dias_ausencia, total_horas_estimadas,
      atestados, faltas, licencas, afastamentos, medidas_administrativas, outros, sem_duracao
    )
    SELECT data_referencia, empresa_id, projeto_id, categoria_id, tipo_ausencia_id, status,
           total_registros, total_colaboradores_afetados, total_dias_ausencia, total_horas_estimadas,
           atestados, faltas, licencas, afastamentos, medidas_administrativas, outros, sem_duracao
    FROM public.bi_absenteismo_diario;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    INSERT INTO public.bi_refresh_execucoes(execution_id,status,origem,finalizado_em,duracao_ms,linhas_processadas,mensagem_resumida)
    VALUES (v_exec_id,'CONCLUIDO',p_origem,now(),EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::int,v_rows,'Refresh concluído');
    PERFORM pg_advisory_unlock(hashtext('refresh_bi_absenteismo'));
    RETURN jsonb_build_object('status','CONCLUIDO','execution_id',v_exec_id,'linhas',v_rows);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(hashtext('refresh_bi_absenteismo'));
    INSERT INTO public.bi_refresh_execucoes(execution_id,status,origem,finalizado_em,duracao_ms,mensagem_resumida)
    VALUES (v_exec_id,'FALHOU',p_origem,now(),EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::int,left(SQLERRM,500));
    RETURN jsonb_build_object('status','FALHOU','execution_id',v_exec_id,'erro',SQLERRM);
  END;
END
$fn$;

-- 3) Base filtrada reutilizável (sem tabela temporária)
CREATE OR REPLACE FUNCTION public.bi_base_filtrada(
  p_ini date, p_fim date,
  p_empresas uuid[] DEFAULT NULL, p_projetos uuid[] DEFAULT NULL,
  p_cats uuid[] DEFAULT NULL, p_tipos uuid[] DEFAULT NULL, p_status text[] DEFAULT NULL
)
RETURNS TABLE (
  data_referencia date, empresa_id uuid, projeto_id uuid, categoria_id uuid,
  tipo_ausencia_id uuid, status text, total_registros int,
  total_colaboradores_afetados int, total_dias_ausencia numeric,
  total_horas_estimadas numeric, sem_duracao int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT b.data_referencia, b.empresa_id, b.projeto_id, b.categoria_id, b.tipo_ausencia_id,
         b.status, b.total_registros, b.total_colaboradores_afetados, b.total_dias_ausencia,
         b.total_horas_estimadas, b.sem_duracao
  FROM public.bi_absenteismo_diario b
  WHERE b.data_referencia BETWEEN p_ini AND p_fim
    AND (p_empresas IS NULL OR b.empresa_id = ANY(p_empresas))
    AND (p_projetos IS NULL OR b.projeto_id = ANY(p_projetos))
    AND (p_cats     IS NULL OR b.categoria_id = ANY(p_cats))
    AND (p_tipos    IS NULL OR b.tipo_ausencia_id = ANY(p_tipos))
    AND (p_status   IS NULL OR b.status = ANY(p_status));
$fn$;

REVOKE ALL ON FUNCTION public.bi_base_filtrada(date,date,uuid[],uuid[],uuid[],uuid[],text[]) FROM PUBLIC, anon, authenticated;

-- Contagem real de colaboradores distintos no período
CREATE OR REPLACE FUNCTION public.bi_colaboradores_distintos(
  p_ini date, p_fim date,
  p_empresas uuid[] DEFAULT NULL, p_projetos uuid[] DEFAULT NULL,
  p_cats uuid[] DEFAULT NULL, p_tipos uuid[] DEFAULT NULL, p_status text[] DEFAULT NULL
)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COUNT(DISTINCT a.colaborador_id)::int
  FROM public.ausencias a
  LEFT JOIN public.colaboradores c ON c.id = a.colaborador_id
  LEFT JOIN public.tipos_ausencia t ON t.id = a.tipo_ausencia_id
  WHERE COALESCE(a.data_inicio::date, a.created_at::date) BETWEEN p_ini AND p_fim
    AND a.colaborador_id IS NOT NULL
    AND (p_empresas IS NULL OR c.empresa_id = ANY(p_empresas))
    AND (p_projetos IS NULL OR c.projeto_id = ANY(p_projetos))
    AND (p_cats     IS NULL OR t.categoria_ausencia_id = ANY(p_cats))
    AND (p_tipos    IS NULL OR a.tipo_ausencia_id = ANY(p_tipos))
    AND (p_status   IS NULL OR COALESCE(a.status::text,'PENDENTE') = ANY(p_status));
$fn$;

REVOKE ALL ON FUNCTION public.bi_colaboradores_distintos(date,date,uuid[],uuid[],uuid[],uuid[],text[]) FROM PUBLIC, anon, authenticated;

-- 4) Consulta principal sem tabela temporária
CREATE OR REPLACE FUNCTION public.bi_executivo_consultar(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ini date; v_fim date; v_gran text; v_comp boolean;
  v_empresas uuid[]; v_projetos uuid[]; v_cats uuid[]; v_tipos uuid[]; v_status text[];
  v_dias int;
  v_kpis jsonb; v_serie jsonb; v_comp_prev jsonb;
  v_por_emp jsonb; v_por_proj jsonb; v_por_cat jsonb; v_por_tipo jsonb;
  v_por_dow jsonb; v_por_mes jsonb; v_concentr jsonb; v_qual jsonb;
  v_prev_ini date; v_prev_fim date;
  v_tot int; v_col int; v_dias_reg numeric; v_horas numeric;
  v_prev_tot int; v_prev_dias numeric;
  v_prev_col int;
  v_pend int; v_lanc int;
  v_bucket text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin')
          OR public.has_role(auth.uid(),'compliance')
          OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_ini  := COALESCE((p_filtros->>'data_inicio')::date, (CURRENT_DATE - INTERVAL '30 day')::date);
  v_fim  := COALESCE((p_filtros->>'data_fim')::date, CURRENT_DATE);
  v_gran := UPPER(COALESCE(p_filtros->>'granularidade','MES'));
  v_comp := COALESCE((p_filtros->>'comparar_periodo_anterior')::boolean, true);

  IF v_fim < v_ini THEN RAISE EXCEPTION 'Período inválido'; END IF;
  IF (v_fim - v_ini) > 1830 THEN RAISE EXCEPTION 'Período máximo: 5 anos'; END IF;

  IF jsonb_typeof(p_filtros->'empresa_ids') = 'array' THEN
    SELECT array_agg((v)::uuid) INTO v_empresas FROM jsonb_array_elements_text(p_filtros->'empresa_ids') v;
  END IF;
  IF jsonb_typeof(p_filtros->'projeto_ids') = 'array' THEN
    SELECT array_agg((v)::uuid) INTO v_projetos FROM jsonb_array_elements_text(p_filtros->'projeto_ids') v;
  END IF;
  IF jsonb_typeof(p_filtros->'categoria_ids') = 'array' THEN
    SELECT array_agg((v)::uuid) INTO v_cats FROM jsonb_array_elements_text(p_filtros->'categoria_ids') v;
  END IF;
  IF jsonb_typeof(p_filtros->'tipo_ausencia_ids') = 'array' THEN
    SELECT array_agg((v)::uuid) INTO v_tipos FROM jsonb_array_elements_text(p_filtros->'tipo_ausencia_ids') v;
  END IF;
  IF jsonb_typeof(p_filtros->'status') = 'array' THEN
    SELECT array_agg(v) INTO v_status FROM jsonb_array_elements_text(p_filtros->'status') v;
  END IF;

  v_dias := (v_fim - v_ini) + 1;
  v_prev_ini := v_ini - v_dias;
  v_prev_fim := v_ini - 1;

  v_bucket := CASE v_gran
    WHEN 'DIA' THEN 'day'
    WHEN 'SEMANA' THEN 'week'
    WHEN 'TRIMESTRE' THEN 'quarter'
    WHEN 'ANO' THEN 'year'
    ELSE 'month'
  END;

  SELECT
    COALESCE(SUM(total_registros),0)::int,
    COALESCE(SUM(total_dias_ausencia),0)::numeric,
    COALESCE(SUM(total_horas_estimadas),0)::numeric,
    COALESCE(SUM(total_registros) FILTER (WHERE status='PENDENTE'),0)::int,
    COALESCE(SUM(total_registros) FILTER (WHERE status='LANCADO'),0)::int
  INTO v_tot, v_dias_reg, v_horas, v_pend, v_lanc
  FROM public.bi_base_filtrada(v_ini, v_fim, v_empresas, v_projetos, v_cats, v_tipos, v_status);

  v_col := public.bi_colaboradores_distintos(v_ini, v_fim, v_empresas, v_projetos, v_cats, v_tipos, v_status);

  IF v_comp THEN
    SELECT COALESCE(SUM(total_registros),0)::int, COALESCE(SUM(total_dias_ausencia),0)::numeric
    INTO v_prev_tot, v_prev_dias
    FROM public.bi_base_filtrada(v_prev_ini, v_prev_fim, v_empresas, v_projetos, v_cats, v_tipos, v_status);
    v_prev_col := public.bi_colaboradores_distintos(v_prev_ini, v_prev_fim, v_empresas, v_projetos, v_cats, v_tipos, v_status);
  ELSE
    v_prev_tot := 0; v_prev_dias := 0; v_prev_col := 0;
  END IF;

  v_kpis := jsonb_build_object(
    'total_ausencias', v_tot,
    'colaboradores_afetados', v_col,
    'dias_registrados', v_dias_reg,
    'horas_estimadas', v_horas,
    'pendentes', v_pend,
    'lancados', v_lanc,
    'media_dias_por_registro', CASE WHEN v_tot > 0 THEN ROUND(v_dias_reg / v_tot, 2) ELSE NULL END,
    'taxa_lancamento', CASE WHEN v_tot > 0 THEN ROUND((v_lanc::numeric / v_tot) * 100, 2) ELSE NULL END
  );

  v_comp_prev := jsonb_build_object(
    'habilitado', v_comp,
    'periodo_anterior', jsonb_build_object('inicio', v_prev_ini, 'fim', v_prev_fim),
    'total_ausencias_anterior', v_prev_tot,
    'colaboradores_anteriores', v_prev_col,
    'dias_anteriores', v_prev_dias,
    'variacao_total_pct', CASE WHEN v_prev_tot > 0 THEN ROUND(((v_tot - v_prev_tot)::numeric / v_prev_tot) * 100, 2) ELSE NULL END,
    'variacao_dias_pct',  CASE WHEN v_prev_dias > 0 THEN ROUND(((v_dias_reg - v_prev_dias) / v_prev_dias) * 100, 2) ELSE NULL END,
    'base_anterior_zero', v_prev_tot = 0
  );

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.bucket),'[]'::jsonb) INTO v_serie
  FROM (
    SELECT date_trunc(v_bucket, data_referencia)::date AS bucket,
           SUM(total_registros)::int AS ausencias,
           SUM(total_colaboradores_afetados)::int AS colaboradores,
           SUM(total_dias_ausencia)::numeric AS dias
    FROM public.bi_base_filtrada(v_ini, v_fim, v_empresas, v_projetos, v_cats, v_tipos, v_status)
    GROUP BY 1
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.ausencias DESC),'[]'::jsonb) INTO v_por_emp
  FROM (
    SELECT b.empresa_id, e.nome AS empresa_nome,
           SUM(b.total_registros)::int AS ausencias,
           SUM(b.total_dias_ausencia)::numeric AS dias,
           SUM(b.total_colaboradores_afetados)::int AS colaboradores
    FROM public.bi_base_filtrada(v_ini, v_fim, v_empresas, v_projetos, v_cats, v_tipos, v_status) b
    LEFT JOIN public.empresas e ON e.id = b.empresa_id
    GROUP BY 1,2
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.ausencias DESC),'[]'::jsonb) INTO v_por_proj
  FROM (
    SELECT b.projeto_id, p.nome AS projeto_nome, b.empresa_id,
           SUM(b.total_registros)::int AS ausencias,
           SUM(b.total_dias_ausencia)::numeric AS dias
    FROM public.bi_base_filtrada(v_ini, v_fim, v_empresas, v_projetos, v_cats, v_tipos, v_status) b
    LEFT JOIN public.projetos p ON p.id = b.projeto_id
    GROUP BY 1,2,3
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.ausencias DESC),'[]'::jsonb) INTO v_por_cat
  FROM (
    SELECT b.categoria_id, c.codigo AS categoria_codigo, c.nome AS categoria_nome, c.cor,
           SUM(b.total_registros)::int AS ausencias,
           SUM(b.total_dias_ausencia)::numeric AS dias
    FROM public.bi_base_filtrada(v_ini, v_fim, v_empresas, v_projetos, v_cats, v_tipos, v_status) b
    LEFT JOIN public.categorias_ausencia c ON c.id = b.categoria_id
    GROUP BY 1,2,3,4
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.ausencias DESC),'[]'::jsonb) INTO v_por_tipo
  FROM (
    SELECT b.tipo_ausencia_id, t.nome AS tipo_nome,
           SUM(b.total_registros)::int AS ausencias,
           SUM(b.total_dias_ausencia)::numeric AS dias
    FROM public.bi_base_filtrada(v_ini, v_fim, v_empresas, v_projetos, v_cats, v_tipos, v_status) b
    LEFT JOIN public.tipos_ausencia t ON t.id = b.tipo_ausencia_id
    GROUP BY 1,2
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.dow),'[]'::jsonb) INTO v_por_dow
  FROM (
    SELECT EXTRACT(DOW FROM data_referencia)::int AS dow, SUM(total_registros)::int AS ausencias
    FROM public.bi_base_filtrada(v_ini, v_fim, v_empresas, v_projetos, v_cats, v_tipos, v_status)
    GROUP BY 1
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.ano, x.mes),'[]'::jsonb) INTO v_por_mes
  FROM (
    SELECT EXTRACT(YEAR FROM data_referencia)::int AS ano,
           EXTRACT(MONTH FROM data_referencia)::int AS mes,
           SUM(total_registros)::int AS ausencias,
           SUM(total_dias_ausencia)::numeric AS dias
    FROM public.bi_base_filtrada(v_ini, v_fim, v_empresas, v_projetos, v_cats, v_tipos, v_status)
    GROUP BY 1,2
  ) x;

  v_concentr := jsonb_build_object(
    'top5_projetos', COALESCE((
      SELECT jsonb_agg(row_to_json(y) ORDER BY y.ausencias DESC)
      FROM (
        SELECT projeto_id, projeto_nome, ausencias,
               CASE WHEN v_tot > 0 THEN ROUND((ausencias::numeric / v_tot) * 100, 2) ELSE 0 END AS participacao_pct
        FROM (
          SELECT b.projeto_id, p.nome AS projeto_nome, SUM(b.total_registros)::int AS ausencias
          FROM public.bi_base_filtrada(v_ini, v_fim, v_empresas, v_projetos, v_cats, v_tipos, v_status) b
          LEFT JOIN public.projetos p ON p.id = b.projeto_id
          GROUP BY 1,2 ORDER BY 3 DESC LIMIT 5
        ) z
      ) y
    ), '[]'::jsonb),
    'top5_tipos', COALESCE((
      SELECT jsonb_agg(row_to_json(y) ORDER BY y.ausencias DESC)
      FROM (
        SELECT tipo_ausencia_id, tipo_nome, ausencias,
               CASE WHEN v_tot > 0 THEN ROUND((ausencias::numeric / v_tot) * 100, 2) ELSE 0 END AS participacao_pct
        FROM (
          SELECT b.tipo_ausencia_id, t.nome AS tipo_nome, SUM(b.total_registros)::int AS ausencias
          FROM public.bi_base_filtrada(v_ini, v_fim, v_empresas, v_projetos, v_cats, v_tipos, v_status) b
          LEFT JOIN public.tipos_ausencia t ON t.id = b.tipo_ausencia_id
          GROUP BY 1,2 ORDER BY 3 DESC LIMIT 5
        ) z
      ) y
    ), '[]'::jsonb)
  );

  SELECT jsonb_build_object(
    'sem_projeto', COALESCE(SUM(total_registros) FILTER (WHERE projeto_id IS NULL),0)::int,
    'sem_tipo',    COALESCE(SUM(total_registros) FILTER (WHERE tipo_ausencia_id IS NULL),0)::int,
    'sem_duracao', COALESCE(SUM(sem_duracao),0)::int,
    'pendentes_totais', v_pend
  ) INTO v_qual
  FROM public.bi_base_filtrada(v_ini, v_fim, v_empresas, v_projetos, v_cats, v_tipos, v_status);

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('inicio', v_ini, 'fim', v_fim, 'granularidade', v_gran, 'dias', v_dias),
    'kpis', v_kpis,
    'serie_temporal', v_serie,
    'comparativo_periodo_anterior', v_comp_prev,
    'por_empresa', v_por_emp,
    'por_projeto', v_por_proj,
    'por_categoria', v_por_cat,
    'por_tipo', v_por_tipo,
    'por_dia_semana', v_por_dow,
    'por_mes', v_por_mes,
    'concentracao', v_concentr,
    'qualidade_dados', v_qual,
    'metodologia', jsonb_build_object(
      'fonte','agregação viva de public.ausencias (view bi_absenteismo_diario)',
      'data_referencia','data_inicio da ausência (fallback: created_at)',
      'horas_estimadas','quantidade_dias × 8h (estimativa)',
      'taxa_lancamento','LANCADO / total × 100',
      'recorrencia','Ver bi_config para limite/janela',
      'aviso','Volume de ausências não é taxa de absenteísmo (sem denominador de jornada).'
    )
  );
END
$fn$;

-- 5) Tendência sem tabela temporária
CREATE OR REPLACE FUNCTION public.bi_analisar_tendencias(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ini date; v_fim date;
  v_min_pontos int;
  v_pontos int;
  v_media numeric; v_desvio numeric;
  v_primeiro numeric; v_ultimo numeric;
  v_var_pct numeric;
  v_direcao text; v_qualidade text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin')
          OR public.has_role(auth.uid(),'compliance')
          OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_ini := COALESCE((p_filtros->>'data_inicio')::date, (CURRENT_DATE - INTERVAL '180 day')::date);
  v_fim := COALESCE((p_filtros->>'data_fim')::date, CURRENT_DATE);

  SELECT COALESCE(minimo_pontos_tendencia,6) INTO v_min_pontos FROM public.bi_config LIMIT 1;

  WITH tend AS (
    SELECT date_trunc('month', data_referencia)::date AS bucket,
           SUM(total_registros)::numeric AS ausencias
    FROM public.bi_base_filtrada(v_ini, v_fim)
    GROUP BY 1
  )
  SELECT COUNT(*), AVG(ausencias), COALESCE(STDDEV_POP(ausencias),0),
         (SELECT ausencias FROM tend ORDER BY bucket ASC LIMIT 1),
         (SELECT ausencias FROM tend ORDER BY bucket DESC LIMIT 1)
  INTO v_pontos, v_media, v_desvio, v_primeiro, v_ultimo
  FROM tend;

  IF v_pontos < 3 THEN
    v_qualidade := 'INSUFICIENTE'; v_direcao := 'INDETERMINADA';
  ELSIF v_pontos < v_min_pontos THEN
    v_qualidade := 'LIMITADA';
  ELSE
    v_qualidade := 'SUFICIENTE';
  END IF;

  IF v_primeiro IS NULL OR v_primeiro = 0 THEN
    v_var_pct := NULL;
    IF v_direcao IS NULL THEN v_direcao := 'INDETERMINADA'; END IF;
  ELSE
    v_var_pct := ROUND(((v_ultimo - v_primeiro) / v_primeiro) * 100, 2);
    IF v_direcao IS NULL THEN
      v_direcao := CASE
        WHEN v_var_pct > 10 THEN 'ALTA'
        WHEN v_var_pct < -10 THEN 'QUEDA'
        ELSE 'ESTAVEL'
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'direcao', v_direcao,
    'intensidade', CASE WHEN v_var_pct IS NULL THEN NULL WHEN abs(v_var_pct) > 30 THEN 'FORTE' WHEN abs(v_var_pct) > 10 THEN 'MODERADA' ELSE 'LEVE' END,
    'variacao_percentual', v_var_pct,
    'media_movel', ROUND(v_media,2),
    'desvio_padrao', ROUND(v_desvio,2),
    'pontos_utilizados', v_pontos,
    'qualidade_amostra', v_qualidade,
    'metodo','regressão descritiva simples entre primeiro e último bucket mensal',
    'observacao','Análise descritiva. Não constitui previsão futura.'
  );
END
$fn$;