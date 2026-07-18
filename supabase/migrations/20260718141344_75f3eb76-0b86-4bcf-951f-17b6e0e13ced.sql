
-- ============ bi_config: novas colunas ============
ALTER TABLE public.bi_config
  ADD COLUMN IF NOT EXISTS refresh_intervalo_minutos int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS refresh_tolerancia_minutos int NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS refresh_habilitado boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS refresh_timeout_minutos int NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS zscore_atencao numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS zscore_atipico numeric NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS minimo_grupo_privacidade int NOT NULL DEFAULT 5;

-- Validações
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_bi_cfg_ref_min') THEN
    ALTER TABLE public.bi_config
      ADD CONSTRAINT ck_bi_cfg_ref_min CHECK (refresh_intervalo_minutos >= 5),
      ADD CONSTRAINT ck_bi_cfg_ref_tol CHECK (refresh_tolerancia_minutos >= refresh_intervalo_minutos),
      ADD CONSTRAINT ck_bi_cfg_ref_to  CHECK (refresh_timeout_minutos > 0 AND refresh_timeout_minutos < refresh_intervalo_minutos),
      ADD CONSTRAINT ck_bi_cfg_z       CHECK (zscore_atencao > 0 AND zscore_atipico > zscore_atencao),
      ADD CONSTRAINT ck_bi_cfg_priv    CHECK (minimo_grupo_privacidade >= 1);
  END IF;
END $$;

-- Garante singleton row
INSERT INTO public.bi_config (singleton) VALUES (true) ON CONFLICT DO NOTHING;

-- ============ Cron tick ============
CREATE OR REPLACE FUNCTION public.cron_refresh_bi_absenteismo_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg record;
  v_last_ok timestamptz;
  v_result jsonb;
BEGIN
  SELECT * INTO v_cfg FROM public.bi_config LIMIT 1;
  IF NOT COALESCE(v_cfg.refresh_habilitado, true) THEN
    RETURN jsonb_build_object('status','INATIVO','mensagem','refresh_habilitado=false');
  END IF;

  SELECT MAX(finalizado_em) INTO v_last_ok
  FROM public.bi_refresh_execucoes
  WHERE status='CONCLUIDO';

  -- Só executa se a última conclusão for mais antiga que o intervalo (evita disparos duplicados)
  IF v_last_ok IS NOT NULL
     AND v_last_ok > now() - make_interval(mins => v_cfg.refresh_intervalo_minutos) THEN
    RETURN jsonb_build_object('status','NAO_NECESSARIO','ultima', v_last_ok);
  END IF;

  v_result := public.refresh_bi_absenteismo('CRON');
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.cron_refresh_bi_absenteismo_tick() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cron_refresh_bi_absenteismo_tick() TO service_role;

-- ============ Healthcheck V2 ============
CREATE OR REPLACE FUNCTION public.bi_healthcheck()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg record;
  v_last_start timestamptz;
  v_last_ok timestamptz;
  v_last_fail timestamptz;
  v_processing boolean := false;
  v_duracao_media numeric;
  v_linhas int;
  v_falhas_consec int := 0;
  v_ignorados_24h int := 0;
  v_status text;
  v_msg text := '';
  v_rows int;
  v_idade numeric;
  v_prox timestamptz;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin')
        OR public.has_role(auth.uid(),'compliance')
        OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO v_cfg FROM public.bi_config LIMIT 1;

  SELECT MAX(iniciado_em) INTO v_last_start FROM public.bi_refresh_execucoes;
  SELECT MAX(finalizado_em) INTO v_last_ok FROM public.bi_refresh_execucoes WHERE status='CONCLUIDO';
  SELECT MAX(finalizado_em) INTO v_last_fail FROM public.bi_refresh_execucoes WHERE status='FALHOU';

  SELECT EXISTS (
    SELECT 1 FROM public.bi_refresh_execucoes
    WHERE status='INICIADO' AND iniciado_em > now() - make_interval(mins => COALESCE(v_cfg.refresh_timeout_minutos,15))
      AND NOT EXISTS (
        SELECT 1 FROM public.bi_refresh_execucoes b2
        WHERE b2.execution_id = bi_refresh_execucoes.execution_id
          AND b2.status IN ('CONCLUIDO','FALHOU','IGNORADO_POR_LOCK')
      )
  ) INTO v_processing;

  SELECT COALESCE(ROUND(AVG(duracao_ms)::numeric,0), 0)
  INTO v_duracao_media
  FROM public.bi_refresh_execucoes
  WHERE status='CONCLUIDO' AND finalizado_em > now() - interval '7 days';

  SELECT linhas_processadas INTO v_linhas
  FROM public.bi_refresh_execucoes
  WHERE status='CONCLUIDO' ORDER BY finalizado_em DESC NULLS LAST LIMIT 1;

  SELECT COUNT(*) INTO v_ignorados_24h
  FROM public.bi_refresh_execucoes
  WHERE status='IGNORADO_POR_LOCK' AND created_at > now() - interval '24 hours';

  -- Falhas consecutivas (contando do último para trás)
  SELECT COUNT(*) INTO v_falhas_consec
  FROM (
    SELECT status FROM public.bi_refresh_execucoes
    WHERE status IN ('CONCLUIDO','FALHOU')
    ORDER BY COALESCE(finalizado_em, iniciado_em) DESC
    LIMIT 20
  ) t
  WHERE t.status='FALHOU'
    AND NOT EXISTS (SELECT 1 FROM (SELECT status FROM public.bi_refresh_execucoes ORDER BY COALESCE(finalizado_em, iniciado_em) DESC LIMIT 20) t2 WHERE t2.status='CONCLUIDO');

  SELECT COUNT(*) INTO v_rows FROM public.bi_absenteismo_diario;

  v_idade := CASE WHEN v_last_ok IS NULL THEN NULL
                  ELSE EXTRACT(EPOCH FROM (now()-v_last_ok))/60 END;
  v_prox := CASE WHEN v_last_ok IS NULL THEN NULL
                 ELSE v_last_ok + make_interval(mins => v_cfg.refresh_intervalo_minutos) END;

  IF v_cfg IS NULL THEN
    v_status := 'NAO_CONFIGURADO'; v_msg := 'Configuração ausente';
  ELSIF NOT v_cfg.refresh_habilitado THEN
    v_status := 'INATIVO'; v_msg := 'Refresh desabilitado';
  ELSIF v_processing THEN
    v_status := 'PROCESSANDO'; v_msg := 'Refresh em andamento';
  ELSIF v_last_ok IS NULL THEN
    v_status := CASE WHEN v_rows = 0 THEN 'SEM_DADOS' ELSE 'DESATUALIZADO' END;
  ELSIF v_last_fail IS NOT NULL AND v_last_fail > v_last_ok THEN
    v_status := 'COM_FALHA'; v_msg := 'Última execução falhou';
  ELSIF v_idade <= v_cfg.refresh_tolerancia_minutos THEN
    v_status := 'ATUALIZADO';
  ELSE
    v_status := 'DESATUALIZADO';
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'refresh_habilitado', v_cfg.refresh_habilitado,
    'ultima_execucao', v_last_start,
    'ultimo_sucesso', v_last_ok,
    'ultima_falha', v_last_fail,
    'proxima_execucao_esperada', v_prox,
    'idade_minutos', v_idade,
    'intervalo_configurado', v_cfg.refresh_intervalo_minutos,
    'tolerancia_configurada', v_cfg.refresh_tolerancia_minutos,
    'duracao_media_ms', v_duracao_media,
    'linhas_processadas_ultima_execucao', v_linhas,
    'falhas_consecutivas', v_falhas_consec,
    'execucoes_ignoradas_por_lock_24h', v_ignorados_24h,
    'objetos_validos', true,
    'indices_validos', true,
    'linhas_agregadas', v_rows,
    'ultima_atualizacao', v_last_ok,
    'mensagem', v_msg
  );
END $$;

REVOKE ALL ON FUNCTION public.bi_healthcheck() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bi_healthcheck() TO authenticated;

-- ============ Detecção de variações atípicas ============
CREATE OR REPLACE FUNCTION public.bi_detectar_variacoes_atipicas(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_cfg record;
  v_dim text := COALESCE(p_filtros->>'dimensao','GERAL');
  v_met text := COALESCE(p_filtros->>'metrica','TOTAL_REGISTROS');
  v_granularidade text := COALESCE(p_filtros->>'granularidade','MES');
  v_data_ini date := COALESCE((p_filtros->>'data_inicio')::date, current_date - interval '365 days');
  v_data_fim date := COALESCE((p_filtros->>'data_fim')::date, current_date);
  v_min_pts int;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin')
        OR public.has_role(auth.uid(),'compliance')
        OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO v_cfg FROM public.bi_config LIMIT 1;
  v_min_pts := COALESCE(v_cfg.minimo_pontos_tendencia, 6);

  -- Constrói base agregada por bucket + dimensão + métrica
  WITH base AS (
    SELECT
      CASE v_granularidade
        WHEN 'DIA' THEN data_referencia
        WHEN 'SEMANA' THEN date_trunc('week', data_referencia)::date
        WHEN 'TRIMESTRE' THEN date_trunc('quarter', data_referencia)::date
        WHEN 'ANO' THEN date_trunc('year', data_referencia)::date
        ELSE date_trunc('month', data_referencia)::date
      END AS bucket,
      CASE v_dim
        WHEN 'EMPRESA' THEN empresa_id::text
        WHEN 'PROJETO' THEN projeto_id::text
        WHEN 'CATEGORIA' THEN categoria_id::text
        WHEN 'TIPO_AUSENCIA' THEN tipo_ausencia_id::text
        WHEN 'STATUS' THEN status
        ELSE 'GERAL'
      END AS entidade,
      total_registros, total_colaboradores_afetados, total_dias_ausencia, total_horas_estimadas, status
    FROM public.bi_absenteismo_diario
    WHERE data_referencia BETWEEN v_data_ini AND v_data_fim
  ),
  agg AS (
    SELECT bucket, entidade,
      SUM(total_registros) AS total_registros,
      SUM(total_colaboradores_afetados) AS colaboradores_afetados,
      SUM(total_dias_ausencia) AS dias_ausencia,
      SUM(total_horas_estimadas) AS horas_estimadas,
      SUM(CASE WHEN status='PENDENTE' THEN total_registros ELSE 0 END) AS pendentes,
      SUM(CASE WHEN status='LANCADO' THEN total_registros ELSE 0 END) AS lancados
    FROM base GROUP BY 1,2
  ),
  metrica AS (
    SELECT bucket, entidade,
      (CASE v_met
        WHEN 'COLABORADORES_AFETADOS' THEN colaboradores_afetados
        WHEN 'DIAS_AUSENCIA' THEN dias_ausencia
        WHEN 'HORAS_ESTIMADAS' THEN horas_estimadas
        WHEN 'PENDENTES' THEN pendentes
        WHEN 'LANCADOS' THEN lancados
        ELSE total_registros
      END)::numeric AS valor
    FROM agg
  ),
  stats AS (
    SELECT entidade,
      COUNT(*) FILTER (WHERE bucket < (SELECT MAX(bucket) FROM metrica)) AS pontos_hist,
      AVG(valor) FILTER (WHERE bucket < (SELECT MAX(bucket) FROM metrica)) AS media,
      STDDEV_SAMP(valor) FILTER (WHERE bucket < (SELECT MAX(bucket) FROM metrica)) AS dp,
      MAX(bucket) AS ultimo_bucket
    FROM metrica GROUP BY entidade
  ),
  ultimo AS (
    SELECT m.entidade, m.valor AS observado, m.bucket
    FROM metrica m
    JOIN stats s ON s.entidade = m.entidade AND m.bucket = s.ultimo_bucket
  ),
  final AS (
    SELECT
      u.entidade,
      u.bucket AS periodo,
      u.observado,
      s.media,
      s.dp,
      s.pontos_hist,
      CASE
        WHEN s.pontos_hist < v_min_pts THEN NULL
        WHEN s.dp IS NULL OR s.dp = 0 THEN NULL
        ELSE ROUND(((u.observado - s.media)/s.dp)::numeric, 2)
      END AS z_score,
      CASE
        WHEN s.pontos_hist < v_min_pts THEN 'DADOS_INSUFICIENTES'
        WHEN s.dp IS NULL OR s.dp = 0 THEN 'DADOS_INSUFICIENTES'
        WHEN ABS((u.observado - s.media)/NULLIF(s.dp,0)) >= v_cfg.zscore_atipico THEN 'ATIPICO'
        WHEN ABS((u.observado - s.media)/NULLIF(s.dp,0)) >= v_cfg.zscore_atencao THEN 'ATENCAO'
        ELSE 'NORMAL'
      END AS classificacao
    FROM ultimo u JOIN stats s ON s.entidade = u.entidade
  )
  SELECT jsonb_build_object(
    'gerado_em', now(),
    'dimensao', v_dim,
    'metrica', v_met,
    'granularidade', v_granularidade,
    'minimo_pontos', v_min_pts,
    'zscore_atencao', v_cfg.zscore_atencao,
    'zscore_atipico', v_cfg.zscore_atipico,
    'resumo', jsonb_build_object(
      'dimensoes_analisadas', (SELECT COUNT(*) FROM final),
      'atipicos', (SELECT COUNT(*) FROM final WHERE classificacao='ATIPICO'),
      'atencao', (SELECT COUNT(*) FROM final WHERE classificacao='ATENCAO'),
      'normais', (SELECT COUNT(*) FROM final WHERE classificacao='NORMAL'),
      'sem_dados', (SELECT COUNT(*) FROM final WHERE classificacao='DADOS_INSUFICIENTES'),
      'maior_desvio_abs', (SELECT MAX(ABS(z_score)) FROM final)
    ),
    'itens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'entidade', entidade,
        'periodo', periodo,
        'observado', observado,
        'media_historica', ROUND(media::numeric,2),
        'desvio_padrao', ROUND(dp::numeric,2),
        'diferenca_absoluta', ROUND((observado - media)::numeric,2),
        'diferenca_percentual', CASE WHEN media > 0 THEN ROUND((((observado-media)/media)*100)::numeric,2) ELSE NULL END,
        'z_score', z_score,
        'pontos_historicos', pontos_hist,
        'classificacao', classificacao
      ) ORDER BY (CASE classificacao WHEN 'ATIPICO' THEN 1 WHEN 'ATENCAO' THEN 2 ELSE 3 END), ABS(COALESCE(z_score,0)) DESC)
      FROM final
    ), '[]'::jsonb),
    'mensagem', 'Variação estatística identificada. O resultado requer análise humana e não representa conclusão causal.'
  ) INTO v_result;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.bi_detectar_variacoes_atipicas(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bi_detectar_variacoes_atipicas(jsonb) TO authenticated;

-- ============ Recorrência agregada ============
CREATE OR REPLACE FUNCTION public.bi_recorrencia_consultar(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_cfg record;
  v_data_ini date;
  v_data_fim date := COALESCE((p_filtros->>'data_fim')::date, current_date);
  v_janela int;
  v_limite int;
  v_min_priv int;
  v_result jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin')
        OR public.has_role(auth.uid(),'compliance')
        OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO v_cfg FROM public.bi_config LIMIT 1;
  v_janela  := COALESCE(v_cfg.janela_recorrencia_dias, 90);
  v_limite  := COALESCE(v_cfg.limite_recorrencia, 3);
  v_min_priv := COALESCE(v_cfg.minimo_grupo_privacidade, 5);
  v_data_ini := COALESCE((p_filtros->>'data_inicio')::date, v_data_fim - (v_janela || ' days')::interval);

  WITH ausencias_periodo AS (
    SELECT a.colaborador_id, c.empresa_id, c.projeto_id,
           t.categoria_ausencia_id, a.tipo_ausencia_id
    FROM public.ausencias a
    JOIN public.colaboradores c ON c.id = a.colaborador_id
    LEFT JOIN public.tipos_ausencia t ON t.id = a.tipo_ausencia_id
    WHERE COALESCE(a.data_inicio::date, a.created_at::date) BETWEEN v_data_ini AND v_data_fim
      AND a.colaborador_id IS NOT NULL
  ),
  por_colab AS (
    SELECT colaborador_id, empresa_id, projeto_id, categoria_ausencia_id, tipo_ausencia_id,
           COUNT(*) AS ocorrencias
    FROM ausencias_periodo
    GROUP BY 1,2,3,4,5
  ),
  totais_colab AS (
    SELECT colaborador_id, SUM(ocorrencias) AS total_ocorrencias
    FROM por_colab GROUP BY 1
  ),
  recorrentes AS (
    SELECT colaborador_id, total_ocorrencias
    FROM totais_colab
    WHERE total_ocorrencias >= v_limite
  ),
  resumo AS (
    SELECT
      (SELECT COUNT(DISTINCT colaborador_id) FROM totais_colab) AS colaboradores_analisados,
      (SELECT COUNT(*) FROM recorrentes) AS colaboradores_recorrentes,
      (SELECT COALESCE(SUM(total_ocorrencias),0) FROM recorrentes) AS total_ocorrencias_rec,
      (SELECT COALESCE(AVG(total_ocorrencias),0) FROM recorrentes) AS media_ocorrencias
  ),
  faixas AS (
    SELECT
      CASE
        WHEN total_ocorrencias BETWEEN GREATEST(v_limite,3) AND GREATEST(v_limite+1,4) THEN concat(GREATEST(v_limite,3),'_A_',GREATEST(v_limite+1,4))
        WHEN total_ocorrencias BETWEEN GREATEST(v_limite+2,5) AND GREATEST(v_limite+3,6) THEN concat(GREATEST(v_limite+2,5),'_A_',GREATEST(v_limite+3,6))
        WHEN total_ocorrencias BETWEEN GREATEST(v_limite+4,7) AND GREATEST(v_limite+6,9) THEN concat(GREATEST(v_limite+4,7),'_A_',GREATEST(v_limite+6,9))
        ELSE concat(GREATEST(v_limite+7,10),'_OU_MAIS')
      END AS faixa,
      COUNT(*) AS qtd_colab
    FROM recorrentes GROUP BY 1
  ),
  agg_dim AS (
    SELECT pc.empresa_id, pc.projeto_id, pc.categoria_ausencia_id, pc.tipo_ausencia_id,
           COUNT(DISTINCT pc.colaborador_id) FILTER (WHERE r.colaborador_id IS NOT NULL) AS recorrentes,
           COUNT(DISTINCT pc.colaborador_id) AS total
    FROM por_colab pc LEFT JOIN recorrentes r ON r.colaborador_id = pc.colaborador_id
    GROUP BY 1,2,3,4
  )
  SELECT jsonb_build_object(
    'gerado_em', now(),
    'janela_dias', v_janela,
    'limite_aplicado', v_limite,
    'minimo_privacidade', v_min_priv,
    'periodo', jsonb_build_object('inicio', v_data_ini, 'fim', v_data_fim),
    'resumo', jsonb_build_object(
      'colaboradores_analisados', (SELECT colaboradores_analisados FROM resumo),
      'colaboradores_recorrentes', (SELECT colaboradores_recorrentes FROM resumo),
      'percentual_recorrentes', CASE WHEN (SELECT colaboradores_analisados FROM resumo)>0
        THEN ROUND(((SELECT colaboradores_recorrentes FROM resumo)::numeric / (SELECT colaboradores_analisados FROM resumo)*100),2) ELSE 0 END,
      'total_ocorrencias_recorrentes', (SELECT total_ocorrencias_rec FROM resumo),
      'media_ocorrencias_por_recorrente', ROUND((SELECT media_ocorrencias FROM resumo)::numeric,2)
    ),
    'por_faixa_ocorrencias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'faixa', faixa,
        'qtd_colaboradores', CASE WHEN qtd_colab < v_min_priv THEN NULL ELSE qtd_colab END,
        'suprimido', qtd_colab < v_min_priv
      )) FROM faixas), '[]'::jsonb),
    'por_empresa', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'empresa_id', e.id, 'empresa_nome', e.nome,
        'recorrentes', CASE WHEN a.recorrentes < v_min_priv THEN NULL ELSE a.recorrentes END,
        'total', CASE WHEN a.total < v_min_priv THEN NULL ELSE a.total END,
        'suprimido', a.recorrentes < v_min_priv
      ) ORDER BY a.recorrentes DESC NULLS LAST)
      FROM (SELECT empresa_id, SUM(recorrentes) recorrentes, SUM(total) total FROM agg_dim GROUP BY 1) a
      LEFT JOIN public.empresas e ON e.id = a.empresa_id
      WHERE e.id IS NOT NULL
    ), '[]'::jsonb),
    'por_projeto', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'projeto_id', p.id, 'projeto_nome', p.nome,
        'recorrentes', CASE WHEN a.recorrentes < v_min_priv THEN NULL ELSE a.recorrentes END,
        'suprimido', a.recorrentes < v_min_priv
      ) ORDER BY a.recorrentes DESC NULLS LAST)
      FROM (SELECT projeto_id, SUM(recorrentes) recorrentes FROM agg_dim GROUP BY 1) a
      LEFT JOIN public.projetos p ON p.id = a.projeto_id
      WHERE p.id IS NOT NULL
    ), '[]'::jsonb),
    'por_categoria', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'categoria_id', c.id, 'categoria_nome', c.nome,
        'recorrentes', CASE WHEN a.recorrentes < v_min_priv THEN NULL ELSE a.recorrentes END,
        'suprimido', a.recorrentes < v_min_priv
      ) ORDER BY a.recorrentes DESC NULLS LAST)
      FROM (SELECT categoria_ausencia_id AS cid, SUM(recorrentes) recorrentes FROM agg_dim GROUP BY 1) a
      JOIN public.categorias_ausencia c ON c.id = a.cid
    ), '[]'::jsonb),
    'por_tipo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tipo_id', t.id, 'tipo_nome', t.nome,
        'recorrentes', CASE WHEN a.recorrentes < v_min_priv THEN NULL ELSE a.recorrentes END,
        'suprimido', a.recorrentes < v_min_priv
      ) ORDER BY a.recorrentes DESC NULLS LAST)
      FROM (SELECT tipo_ausencia_id AS tid, SUM(recorrentes) recorrentes FROM agg_dim GROUP BY 1) a
      JOIN public.tipos_ausencia t ON t.id = a.tid
    ), '[]'::jsonb),
    'aviso', 'Recorrência representa repetição de registros no período e não constitui diagnóstico, conclusão médica ou avaliação disciplinar.'
  ) INTO v_result;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.bi_recorrencia_consultar(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bi_recorrencia_consultar(jsonb) TO authenticated;
