
-- =====================================================================
-- ETAPA 26 · BI EXECUTIVO DE ABSENTEÍSMO
-- =====================================================================

-- ------------------------------------------------------------------
-- 1) TABELA AGREGADA HISTÓRICA
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bi_absenteismo_diario (
  id                          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_referencia             date NOT NULL,
  empresa_id                  uuid NULL,
  projeto_id                  uuid NULL,
  categoria_id                uuid NULL,
  tipo_ausencia_id            uuid NULL,
  status                      text NOT NULL,
  total_registros             integer NOT NULL DEFAULT 0,
  total_colaboradores_afetados integer NOT NULL DEFAULT 0,
  total_dias_ausencia         numeric NOT NULL DEFAULT 0,
  total_horas_estimadas       numeric NOT NULL DEFAULT 0,
  atestados                   integer NOT NULL DEFAULT 0,
  faltas                      integer NOT NULL DEFAULT 0,
  licencas                    integer NOT NULL DEFAULT 0,
  afastamentos                integer NOT NULL DEFAULT 0,
  medidas_administrativas     integer NOT NULL DEFAULT 0,
  outros                      integer NOT NULL DEFAULT 0,
  sem_duracao                 integer NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_bi_absent_dim
  ON public.bi_absenteismo_diario (
    data_referencia,
    COALESCE(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(projeto_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(categoria_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(tipo_ausencia_id, '00000000-0000-0000-0000-000000000000'::uuid),
    status
  );

CREATE INDEX IF NOT EXISTS ix_bi_absent_data ON public.bi_absenteismo_diario (data_referencia);
CREATE INDEX IF NOT EXISTS ix_bi_absent_empresa ON public.bi_absenteismo_diario (empresa_id);
CREATE INDEX IF NOT EXISTS ix_bi_absent_projeto ON public.bi_absenteismo_diario (projeto_id);
CREATE INDEX IF NOT EXISTS ix_bi_absent_cat ON public.bi_absenteismo_diario (categoria_id);

GRANT SELECT ON public.bi_absenteismo_diario TO authenticated;
GRANT ALL ON public.bi_absenteismo_diario TO service_role;
ALTER TABLE public.bi_absenteismo_diario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bi_absent_read"
ON public.bi_absenteismo_diario FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'compliance')
  OR public.has_role(auth.uid(), 'rh')
);

-- ------------------------------------------------------------------
-- 2) HISTÓRICO DE REFRESH (append-only)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bi_refresh_execucoes (
  id                    uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  execution_id          uuid NOT NULL DEFAULT gen_random_uuid(),
  status                text NOT NULL,
  origem                text NOT NULL DEFAULT 'MANUAL',
  iniciado_em           timestamptz NOT NULL DEFAULT now(),
  finalizado_em         timestamptz NULL,
  duracao_ms            integer NULL,
  linhas_processadas    integer NULL,
  mensagem_resumida     text NULL,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_bi_refresh_status CHECK (status IN ('INICIADO','CONCLUIDO','FALHOU','IGNORADO_POR_LOCK')),
  CONSTRAINT ck_bi_refresh_origem CHECK (origem IN ('MANUAL','CRON','DEPLOY'))
);

GRANT SELECT ON public.bi_refresh_execucoes TO authenticated;
GRANT ALL ON public.bi_refresh_execucoes TO service_role;
ALTER TABLE public.bi_refresh_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bi_refresh_read"
ON public.bi_refresh_execucoes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));

CREATE OR REPLACE FUNCTION public.tg_bi_refresh_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'bi_refresh_execucoes é append-only';
END $$;

DROP TRIGGER IF EXISTS trg_bi_refresh_no_update ON public.bi_refresh_execucoes;
CREATE TRIGGER trg_bi_refresh_no_update
BEFORE UPDATE OR DELETE ON public.bi_refresh_execucoes
FOR EACH ROW EXECUTE FUNCTION public.tg_bi_refresh_immutable();

-- Permitir UPDATE apenas via SECURITY DEFINER (bypass do trigger não é possível diretamente)
-- Reformulamos: mantemos append-only inserindo linhas de INICIO e depois CONCLUSAO/FALHA como novas linhas ligadas por execution_id.

-- ------------------------------------------------------------------
-- 3) CONFIG DO BI
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bi_config (
  id                             uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  limite_recorrencia             integer NOT NULL DEFAULT 3 CHECK (limite_recorrencia BETWEEN 2 AND 50),
  janela_recorrencia_dias        integer NOT NULL DEFAULT 90 CHECK (janela_recorrencia_dias BETWEEN 7 AND 730),
  minimo_pontos_tendencia        integer NOT NULL DEFAULT 6 CHECK (minimo_pontos_tendencia BETWEEN 3 AND 60),
  minimo_periodos_sazonalidade   integer NOT NULL DEFAULT 12 CHECK (minimo_periodos_sazonalidade BETWEEN 3 AND 60),
  singleton                      boolean NOT NULL DEFAULT true UNIQUE,
  updated_by                     uuid NULL,
  updated_at                     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.bi_config (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

GRANT SELECT ON public.bi_config TO authenticated;
GRANT ALL ON public.bi_config TO service_role;
ALTER TABLE public.bi_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bi_config_read"
ON public.bi_config FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance') OR public.has_role(auth.uid(),'rh'));

CREATE POLICY "bi_config_update"
ON public.bi_config FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'super_admin'))
WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- ------------------------------------------------------------------
-- 4) VISÕES SALVAS
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bi_visoes_salvas (
  id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id   uuid NOT NULL,
  nome         text NOT NULL CHECK (length(nome) BETWEEN 1 AND 80),
  descricao    text NULL CHECK (descricao IS NULL OR length(descricao) <= 500),
  filtros      jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_padrao    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_bi_visoes_padrao
  ON public.bi_visoes_salvas(usuario_id) WHERE is_padrao;

CREATE INDEX IF NOT EXISTS ix_bi_visoes_user ON public.bi_visoes_salvas(usuario_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_visoes_salvas TO authenticated;
GRANT ALL ON public.bi_visoes_salvas TO service_role;
ALTER TABLE public.bi_visoes_salvas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bi_visoes_own_read"
ON public.bi_visoes_salvas FOR SELECT TO authenticated USING (usuario_id = auth.uid());
CREATE POLICY "bi_visoes_own_insert"
ON public.bi_visoes_salvas FOR INSERT TO authenticated WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "bi_visoes_own_update"
ON public.bi_visoes_salvas FOR UPDATE TO authenticated USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "bi_visoes_own_delete"
ON public.bi_visoes_salvas FOR DELETE TO authenticated USING (usuario_id = auth.uid());

-- ------------------------------------------------------------------
-- 5) FUNÇÃO DE REFRESH SERVER-SIDE, IDEMPOTENTE
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_bi_absenteismo(p_origem text DEFAULT 'MANUAL')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    -- Rebuild atômico: TRUNCATE e reagrega.
    -- Fonte: ausencias válidas (excluindo status inválidos). Usa data_inicio como data_referencia.
    TRUNCATE public.bi_absenteismo_diario;

    INSERT INTO public.bi_absenteismo_diario (
      data_referencia, empresa_id, projeto_id, categoria_id, tipo_ausencia_id, status,
      total_registros, total_colaboradores_afetados, total_dias_ausencia, total_horas_estimadas,
      atestados, faltas, licencas, afastamentos, medidas_administrativas, outros, sem_duracao
    )
    SELECT
      COALESCE(a.data_inicio::date, a.created_at::date) AS data_referencia,
      c.empresa_id,
      c.projeto_id,
      t.categoria_ausencia_id,
      a.tipo_ausencia_oficial_id,
      COALESCE(a.status::text,'PENDENTE') AS status,
      COUNT(*)::int AS total_registros,
      COUNT(DISTINCT a.colaborador_id)::int AS total_colaboradores_afetados,
      COALESCE(SUM(NULLIF(a.quantidade_dias,0)),0)::numeric AS total_dias_ausencia,
      COALESCE(SUM(NULLIF(a.quantidade_dias,0) * 8),0)::numeric AS total_horas_estimadas,
      COUNT(*) FILTER (WHERE cat.codigo = 'ATESTADOS')::int,
      COUNT(*) FILTER (WHERE cat.codigo = 'FALTAS')::int,
      COUNT(*) FILTER (WHERE cat.codigo = 'LICENCAS')::int,
      COUNT(*) FILTER (WHERE cat.codigo = 'AFASTAMENTOS')::int,
      COUNT(*) FILTER (WHERE cat.codigo = 'MEDIDAS_ADMINISTRATIVAS')::int,
      COUNT(*) FILTER (WHERE cat.codigo = 'OUTROS' OR cat.codigo IS NULL)::int,
      COUNT(*) FILTER (WHERE a.quantidade_dias IS NULL OR a.quantidade_dias = 0)::int
    FROM public.ausencias a
    LEFT JOIN public.colaboradores c ON c.id = a.colaborador_id
    LEFT JOIN public.tipos_ausencia t ON t.id = a.tipo_ausencia_oficial_id
    LEFT JOIN public.categorias_ausencia cat ON cat.id = t.categoria_ausencia_id
    WHERE a.data_inicio IS NOT NULL OR a.created_at IS NOT NULL
    GROUP BY 1,2,3,4,5,6;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    INSERT INTO public.bi_refresh_execucoes(execution_id,status,origem,finalizado_em,duracao_ms,linhas_processadas,mensagem_resumida)
    VALUES (v_exec_id,'CONCLUIDO',p_origem,now(),
            EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::int,
            v_rows,'Refresh concluído');

    PERFORM pg_advisory_unlock(hashtext('refresh_bi_absenteismo'));
    RETURN jsonb_build_object('status','CONCLUIDO','execution_id',v_exec_id,'linhas',v_rows);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(hashtext('refresh_bi_absenteismo'));
    INSERT INTO public.bi_refresh_execucoes(execution_id,status,origem,finalizado_em,duracao_ms,mensagem_resumida)
    VALUES (v_exec_id,'FALHOU',p_origem,now(),
            EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::int,
            left(SQLERRM,500));
    RETURN jsonb_build_object('status','FALHOU','execution_id',v_exec_id,'erro',SQLERRM);
  END;
END $$;

REVOKE ALL ON FUNCTION public.refresh_bi_absenteismo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_bi_absenteismo(text) TO authenticated;

-- ------------------------------------------------------------------
-- 6) RPC ANALÍTICA PRINCIPAL
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bi_executivo_consultar(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ini date; v_fim date; v_gran text; v_comp boolean;
  v_empresas uuid[]; v_projetos uuid[]; v_cats uuid[]; v_tipos uuid[]; v_status text[];
  v_dias int;
  v_result jsonb;
  v_kpis jsonb; v_serie jsonb; v_comp_prev jsonb;
  v_por_emp jsonb; v_por_proj jsonb; v_por_cat jsonb; v_por_tipo jsonb;
  v_por_dow jsonb; v_por_mes jsonb; v_concentr jsonb; v_qual jsonb;
  v_prev_ini date; v_prev_fim date;
  v_tot int; v_col int; v_dias_reg numeric; v_horas numeric;
  v_prev_tot int; v_prev_col int; v_prev_dias numeric; v_prev_horas numeric;
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

  -- Base filtrada (CTE-like via temp)
  CREATE TEMP TABLE IF NOT EXISTS _bi_base ON COMMIT DROP AS
    SELECT * FROM public.bi_absenteismo_diario WHERE false;
  TRUNCATE _bi_base;
  INSERT INTO _bi_base
  SELECT * FROM public.bi_absenteismo_diario b
  WHERE b.data_referencia BETWEEN v_ini AND v_fim
    AND (v_empresas IS NULL OR b.empresa_id = ANY(v_empresas))
    AND (v_projetos IS NULL OR b.projeto_id = ANY(v_projetos))
    AND (v_cats     IS NULL OR b.categoria_id = ANY(v_cats))
    AND (v_tipos    IS NULL OR b.tipo_ausencia_id = ANY(v_tipos))
    AND (v_status   IS NULL OR b.status = ANY(v_status));

  -- KPIs
  SELECT
    COALESCE(SUM(total_registros),0)::int,
    COALESCE(SUM(total_colaboradores_afetados),0)::int,
    COALESCE(SUM(total_dias_ausencia),0)::numeric,
    COALESCE(SUM(total_horas_estimadas),0)::numeric,
    COALESCE(SUM(total_registros) FILTER (WHERE status='PENDENTE'),0)::int,
    COALESCE(SUM(total_registros) FILTER (WHERE status='LANCADO'),0)::int
  INTO v_tot, v_col, v_dias_reg, v_horas, v_pend, v_lanc
  FROM _bi_base;

  -- Comparativo
  SELECT
    COALESCE(SUM(total_registros),0)::int,
    COALESCE(SUM(total_colaboradores_afetados),0)::int,
    COALESCE(SUM(total_dias_ausencia),0)::numeric,
    COALESCE(SUM(total_horas_estimadas),0)::numeric
  INTO v_prev_tot, v_prev_col, v_prev_dias, v_prev_horas
  FROM public.bi_absenteismo_diario b
  WHERE v_comp
    AND b.data_referencia BETWEEN v_prev_ini AND v_prev_fim
    AND (v_empresas IS NULL OR b.empresa_id = ANY(v_empresas))
    AND (v_projetos IS NULL OR b.projeto_id = ANY(v_projetos))
    AND (v_cats     IS NULL OR b.categoria_id = ANY(v_cats))
    AND (v_tipos    IS NULL OR b.tipo_ausencia_id = ANY(v_tipos))
    AND (v_status   IS NULL OR b.status = ANY(v_status));

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

  -- Série temporal
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.bucket),'[]'::jsonb) INTO v_serie
  FROM (
    SELECT date_trunc(v_bucket, data_referencia)::date AS bucket,
           SUM(total_registros)::int AS ausencias,
           SUM(total_colaboradores_afetados)::int AS colaboradores,
           SUM(total_dias_ausencia)::numeric AS dias
    FROM _bi_base GROUP BY 1
  ) x;

  -- Por empresa
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.ausencias DESC),'[]'::jsonb) INTO v_por_emp
  FROM (
    SELECT b.empresa_id, e.nome AS empresa_nome,
           SUM(b.total_registros)::int AS ausencias,
           SUM(b.total_dias_ausencia)::numeric AS dias,
           SUM(b.total_colaboradores_afetados)::int AS colaboradores
    FROM _bi_base b LEFT JOIN public.empresas e ON e.id = b.empresa_id
    GROUP BY 1,2
  ) x;

  -- Por projeto
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.ausencias DESC),'[]'::jsonb) INTO v_por_proj
  FROM (
    SELECT b.projeto_id, p.nome AS projeto_nome, b.empresa_id,
           SUM(b.total_registros)::int AS ausencias,
           SUM(b.total_dias_ausencia)::numeric AS dias
    FROM _bi_base b LEFT JOIN public.projetos p ON p.id = b.projeto_id
    GROUP BY 1,2,3
  ) x;

  -- Por categoria
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.ausencias DESC),'[]'::jsonb) INTO v_por_cat
  FROM (
    SELECT b.categoria_id, c.codigo AS categoria_codigo, c.nome AS categoria_nome, c.cor,
           SUM(b.total_registros)::int AS ausencias,
           SUM(b.total_dias_ausencia)::numeric AS dias
    FROM _bi_base b LEFT JOIN public.categorias_ausencia c ON c.id = b.categoria_id
    GROUP BY 1,2,3,4
  ) x;

  -- Por tipo
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.ausencias DESC),'[]'::jsonb) INTO v_por_tipo
  FROM (
    SELECT b.tipo_ausencia_id, t.nome AS tipo_nome,
           SUM(b.total_registros)::int AS ausencias,
           SUM(b.total_dias_ausencia)::numeric AS dias
    FROM _bi_base b LEFT JOIN public.tipos_ausencia t ON t.id = b.tipo_ausencia_id
    GROUP BY 1,2
  ) x;

  -- Por dia da semana (0=Dom)
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.dow),'[]'::jsonb) INTO v_por_dow
  FROM (
    SELECT EXTRACT(DOW FROM data_referencia)::int AS dow, SUM(total_registros)::int AS ausencias
    FROM _bi_base GROUP BY 1
  ) x;

  -- Por mês
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.ano, x.mes),'[]'::jsonb) INTO v_por_mes
  FROM (
    SELECT EXTRACT(YEAR FROM data_referencia)::int AS ano,
           EXTRACT(MONTH FROM data_referencia)::int AS mes,
           SUM(total_registros)::int AS ausencias,
           SUM(total_dias_ausencia)::numeric AS dias
    FROM _bi_base GROUP BY 1,2
  ) x;

  -- Concentração (top 5 projetos e tipos)
  v_concentr := jsonb_build_object(
    'top5_projetos', COALESCE((
      SELECT jsonb_agg(row_to_json(y) ORDER BY y.ausencias DESC)
      FROM (
        SELECT projeto_id, projeto_nome, ausencias,
               CASE WHEN v_tot > 0 THEN ROUND((ausencias::numeric / v_tot) * 100, 2) ELSE 0 END AS participacao_pct
        FROM (
          SELECT b.projeto_id, p.nome AS projeto_nome, SUM(b.total_registros)::int AS ausencias
          FROM _bi_base b LEFT JOIN public.projetos p ON p.id = b.projeto_id
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
          FROM _bi_base b LEFT JOIN public.tipos_ausencia t ON t.id = b.tipo_ausencia_id
          GROUP BY 1,2 ORDER BY 3 DESC LIMIT 5
        ) z
      ) y
    ), '[]'::jsonb)
  );

  -- Qualidade dos dados (contagens)
  SELECT jsonb_build_object(
    'sem_projeto',       (SELECT COALESCE(SUM(total_registros),0)::int FROM _bi_base WHERE projeto_id IS NULL),
    'sem_tipo',          (SELECT COALESCE(SUM(total_registros),0)::int FROM _bi_base WHERE tipo_ausencia_id IS NULL),
    'sem_duracao',       (SELECT COALESCE(SUM(sem_duracao),0)::int FROM _bi_base),
    'pendentes_totais',  v_pend
  ) INTO v_qual;

  v_result := jsonb_build_object(
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
      'fonte','bi_absenteismo_diario (agregado a partir de ausencias)',
      'data_referencia','data_inicio da ausência (fallback: created_at)',
      'horas_estimadas','quantidade_dias × 8h (estimativa)',
      'taxa_lancamento','LANCADO / total × 100',
      'recorrencia','Ver bi_config para limite/janela',
      'aviso','Volume de ausências não é taxa de absenteísmo (sem denominador de jornada).'
    )
  );

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.bi_executivo_consultar(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bi_executivo_consultar(jsonb) TO authenticated;

-- ------------------------------------------------------------------
-- 7) HEALTHCHECK
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bi_healthcheck()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_ok timestamptz;
  v_last_any timestamptz;
  v_last_status text;
  v_max_data date;
  v_rows int;
  v_idade int;
  v_status text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT MAX(finalizado_em) INTO v_last_ok FROM public.bi_refresh_execucoes WHERE status='CONCLUIDO';
  SELECT status, finalizado_em INTO v_last_status, v_last_any
    FROM public.bi_refresh_execucoes ORDER BY created_at DESC LIMIT 1;
  SELECT COUNT(*), MAX(data_referencia) INTO v_rows, v_max_data FROM public.bi_absenteismo_diario;

  v_idade := CASE WHEN v_last_ok IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (now()-v_last_ok))/60 END;

  v_status := CASE
    WHEN v_rows = 0 AND v_last_ok IS NULL THEN 'NAO_CONFIGURADO'
    WHEN v_last_status = 'INICIADO' THEN 'PROCESSANDO'
    WHEN v_last_status = 'FALHOU' THEN 'COM_FALHA'
    WHEN v_rows = 0 THEN 'SEM_DADOS'
    WHEN v_idade IS NULL OR v_idade > 1440 THEN 'DESATUALIZADO'
    ELSE 'ATUALIZADO'
  END;

  RETURN jsonb_build_object(
    'status', v_status,
    'ultima_atualizacao', v_last_ok,
    'idade_minutos', v_idade,
    'linhas_agregadas', v_rows,
    'max_data_referencia', v_max_data,
    'ultima_execucao_status', v_last_status,
    'mensagem', CASE v_status
      WHEN 'ATUALIZADO' THEN 'BI atualizado'
      WHEN 'DESATUALIZADO' THEN 'Refresh não roda há mais de 24h'
      WHEN 'COM_FALHA' THEN 'Última execução falhou'
      WHEN 'PROCESSANDO' THEN 'Refresh em execução'
      WHEN 'SEM_DADOS' THEN 'Camada vazia'
      ELSE 'BI ainda não configurado'
    END
  );
END $$;

REVOKE ALL ON FUNCTION public.bi_healthcheck() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bi_healthcheck() TO authenticated;

-- ------------------------------------------------------------------
-- 8) TENDÊNCIAS
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bi_analisar_tendencias(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  CREATE TEMP TABLE IF NOT EXISTS _bi_tend ON COMMIT DROP AS
    SELECT bucket, ausencias FROM (VALUES (NULL::date, NULL::numeric)) AS t(bucket,ausencias) WHERE false;
  TRUNCATE _bi_tend;
  INSERT INTO _bi_tend
  SELECT date_trunc('month', data_referencia)::date AS bucket, SUM(total_registros)::numeric AS ausencias
  FROM public.bi_absenteismo_diario
  WHERE data_referencia BETWEEN v_ini AND v_fim
  GROUP BY 1 ORDER BY 1;

  SELECT COUNT(*), AVG(ausencias), COALESCE(STDDEV_POP(ausencias),0) INTO v_pontos, v_media, v_desvio FROM _bi_tend;
  SELECT ausencias INTO v_primeiro FROM _bi_tend ORDER BY bucket ASC LIMIT 1;
  SELECT ausencias INTO v_ultimo FROM _bi_tend ORDER BY bucket DESC LIMIT 1;

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
END $$;

REVOKE ALL ON FUNCTION public.bi_analisar_tendencias(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bi_analisar_tendencias(jsonb) TO authenticated;
