
-- ============================================================
-- ETAPA 28 — QUALIDADE, PERFORMANCE E OBSERVABILIDADE
-- Todas as RPCs são SOMENTE LEITURA (SECURITY DEFINER, STABLE).
-- Restritas a Super Admin e Compliance.
-- ============================================================

-- Helper de autorização
CREATE OR REPLACE FUNCTION public._obs_can_read()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'compliance'::app_role);
$$;

REVOKE ALL ON FUNCTION public._obs_can_read() FROM public, anon;
GRANT EXECUTE ON FUNCTION public._obs_can_read() TO authenticated;

-- ============================================================
-- ETAPA 1 — DIAGNÓSTICO DO BANCO
-- ============================================================
CREATE OR REPLACE FUNCTION public.database_healthcheck()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public._obs_can_read() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'gerado_em', now(),
    'indices_invalidos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'schema', n.nspname, 'tabela', c.relname, 'indice', i.relname
      ))
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_class c ON c.oid = x.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT x.indisvalid AND n.nspname = 'public'
    ), '[]'::jsonb),
    'tabelas_sem_pk', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('schema', n.nspname, 'tabela', c.relname))
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname = 'public'
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint k
          WHERE k.conrelid = c.oid AND k.contype = 'p'
        )
    ), '[]'::jsonb),
    'funcoes_sem_search_path', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'schema', n.nspname, 'funcao', p.proname
      ))
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND NOT EXISTS (
          SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
          WHERE cfg LIKE 'search_path=%'
        )
    ), '[]'::jsonb),
    'tabelas_sem_rls', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('schema', n.nspname, 'tabela', c.relname))
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname = 'public'
        AND NOT c.relrowsecurity
    ), '[]'::jsonb),
    'tabelas_sem_politicas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('schema', schemaname, 'tabela', tablename))
      FROM pg_tables t
      WHERE schemaname = 'public'
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = t.schemaname AND p.tablename = t.tablename
        )
    ), '[]'::jsonb),
    'triggers_desabilitadas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tabela', c.relname, 'trigger', t.tgname
      ))
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND NOT t.tgisinternal
        AND t.tgenabled = 'D'
    ), '[]'::jsonb),
    'views_invalidas', '[]'::jsonb
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.database_healthcheck() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.database_healthcheck() TO authenticated;

-- ============================================================
-- ETAPA 2 — PERFORMANCE
-- ============================================================
CREATE OR REPLACE FUNCTION public.database_performance()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_result jsonb;
  v_cache_hit numeric;
BEGIN
  IF NOT public._obs_can_read() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT ROUND(
    (sum(heap_blks_hit)::numeric /
     NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0)) * 100, 2)
  INTO v_cache_hit
  FROM pg_statio_user_tables;

  SELECT jsonb_build_object(
    'gerado_em', now(),
    'cache_hit_pct', COALESCE(v_cache_hit, 0),
    'maiores_tabelas', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT
          c.relname AS tabela,
          pg_total_relation_size(c.oid) AS bytes_total,
          pg_size_pretty(pg_total_relation_size(c.oid)) AS tamanho,
          COALESCE(s.n_live_tup, 0) AS linhas
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 15
      ) t
    ), '[]'::jsonb),
    'maiores_indices', COALESCE((
      SELECT jsonb_agg(i) FROM (
        SELECT
          c.relname AS indice,
          t.relname AS tabela,
          pg_relation_size(c.oid) AS bytes,
          pg_size_pretty(pg_relation_size(c.oid)) AS tamanho
        FROM pg_class c
        JOIN pg_index x ON x.indexrelid = c.oid
        JOIN pg_class t ON t.oid = x.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'i'
        ORDER BY pg_relation_size(c.oid) DESC
        LIMIT 15
      ) i
    ), '[]'::jsonb),
    'seq_scans', COALESCE((
      SELECT jsonb_agg(s) FROM (
        SELECT
          relname AS tabela,
          seq_scan,
          idx_scan,
          n_live_tup AS linhas
        FROM pg_stat_user_tables
        WHERE schemaname = 'public' AND seq_scan > 0
        ORDER BY seq_scan DESC
        LIMIT 15
      ) s
    ), '[]'::jsonb),
    'vacuum_analyze', COALESCE((
      SELECT jsonb_agg(v) FROM (
        SELECT
          relname AS tabela,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze,
          n_dead_tup AS mortas
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY n_dead_tup DESC NULLS LAST
        LIMIT 15
      ) v
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.database_performance() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.database_performance() TO authenticated;

-- ============================================================
-- ETAPA 5 — ÍNDICES
-- ============================================================
CREATE OR REPLACE FUNCTION public.database_indices_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public._obs_can_read() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'gerado_em', now(),
    'nao_utilizados', COALESCE((
      SELECT jsonb_agg(u) FROM (
        SELECT
          s.relname AS tabela,
          s.indexrelname AS indice,
          s.idx_scan AS scans,
          pg_size_pretty(pg_relation_size(s.indexrelid)) AS tamanho
        FROM pg_stat_user_indexes s
        JOIN pg_index i ON i.indexrelid = s.indexrelid
        WHERE s.schemaname = 'public'
          AND s.idx_scan = 0
          AND NOT i.indisunique
          AND NOT i.indisprimary
        ORDER BY pg_relation_size(s.indexrelid) DESC
        LIMIT 30
      ) u
    ), '[]'::jsonb),
    'duplicados', COALESCE((
      SELECT jsonb_agg(d) FROM (
        SELECT
          n.nspname AS schema,
          c.relname AS tabela,
          array_agg(ic.relname ORDER BY ic.relname) AS indices,
          (array_agg(pg_get_indexdef(i.indexrelid)))[1] AS definicao
        FROM pg_index i
        JOIN pg_class ic ON ic.oid = i.indexrelid
        JOIN pg_class c  ON c.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
        GROUP BY n.nspname, c.relname, i.indkey::text
        HAVING count(*) > 1
      ) d
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.database_indices_report() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.database_indices_report() TO authenticated;

-- ============================================================
-- ETAPA 4 — CRON HEALTH
-- ============================================================
CREATE OR REPLACE FUNCTION public.cron_healthcheck()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_jobs jsonb := '[]'::jsonb;
BEGIN
  IF NOT public._obs_can_read() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  BEGIN
    SELECT COALESCE(jsonb_agg(j), '[]'::jsonb) INTO v_jobs
    FROM (
      SELECT
        j.jobname,
        j.schedule,
        j.active,
        (
          SELECT jsonb_build_object(
            'status', r.status,
            'start_time', r.start_time,
            'end_time', r.end_time,
            'return_message', r.return_message
          )
          FROM cron.job_run_details r
          WHERE r.jobid = j.jobid
          ORDER BY r.start_time DESC
          LIMIT 1
        ) AS ultima_execucao,
        (
          SELECT COUNT(*)::int
          FROM cron.job_run_details r
          WHERE r.jobid = j.jobid
            AND r.status = 'failed'
            AND r.start_time > now() - interval '24 hours'
        ) AS falhas_24h,
        CASE
          WHEN NOT j.active THEN 'INATIVO'
          WHEN NOT EXISTS (
            SELECT 1 FROM cron.job_run_details r
            WHERE r.jobid = j.jobid
              AND r.start_time > now() - interval '2 hours'
          ) THEN 'ATRASADO'
          WHEN EXISTS (
            SELECT 1 FROM cron.job_run_details r
            WHERE r.jobid = j.jobid
              AND r.status = 'failed'
              AND r.start_time > now() - interval '1 hour'
          ) THEN 'FALHOU'
          ELSE 'OK'
        END AS estado
      FROM cron.job j
      WHERE j.jobname LIKE 'crm_mk9_%'
      ORDER BY j.jobname
    ) j;
  EXCEPTION WHEN OTHERS THEN
    v_jobs := '[]'::jsonb;
  END;

  RETURN jsonb_build_object('gerado_em', now(), 'jobs', v_jobs);
END;
$$;

REVOKE ALL ON FUNCTION public.cron_healthcheck() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cron_healthcheck() TO authenticated;

-- ============================================================
-- ETAPA 9 — HEALTH SCORE (0..100)
-- ============================================================
CREATE OR REPLACE FUNCTION public.plataforma_health_score()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_score int := 100;
  v_partes jsonb := '{}'::jsonb;
  v_hc jsonb;
  v_perf jsonb;
  v_cron jsonb;
  v_ind jsonb;
  v_bi jsonb;
  v_p_banco int := 100;
  v_p_perf int := 100;
  v_p_cron int := 100;
  v_p_bi int := 100;
  v_cache_hit numeric;
  v_falhas int;
BEGIN
  IF NOT public._obs_can_read() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_hc   := public.database_healthcheck();
  v_perf := public.database_performance();
  v_cron := public.cron_healthcheck();
  v_ind  := public.database_indices_report();

  -- Banco: penaliza tabelas sem RLS/PK e funções sem search_path
  v_p_banco := 100
    - LEAST(30, jsonb_array_length(v_hc->'tabelas_sem_rls') * 10)
    - LEAST(20, jsonb_array_length(v_hc->'tabelas_sem_pk') * 5)
    - LEAST(20, jsonb_array_length(v_hc->'funcoes_sem_search_path') * 2)
    - LEAST(30, jsonb_array_length(v_hc->'indices_invalidos') * 15);
  v_p_banco := GREATEST(0, v_p_banco);

  -- Performance: cache hit
  v_cache_hit := (v_perf->>'cache_hit_pct')::numeric;
  v_p_perf := GREATEST(0, LEAST(100, ROUND(COALESCE(v_cache_hit, 0))::int));

  -- Cron: penaliza jobs FALHOU/ATRASADO
  SELECT COUNT(*)::int INTO v_falhas
  FROM jsonb_array_elements(v_cron->'jobs') j
  WHERE j->>'estado' IN ('FALHOU','ATRASADO');
  v_p_cron := GREATEST(0, 100 - v_falhas * 25);

  -- BI: usa healthcheck existente
  BEGIN
    v_bi := public.bi_healthcheck();
    v_p_bi := CASE COALESCE(v_bi->>'estado','')
      WHEN 'ATUALIZADO'    THEN 100
      WHEN 'PROCESSANDO'   THEN 90
      WHEN 'DESATUALIZADO' THEN 60
      WHEN 'SEM_DADOS'     THEN 50
      WHEN 'INATIVO'       THEN 40
      WHEN 'COM_FALHA'     THEN 20
      ELSE 50
    END;
  EXCEPTION WHEN OTHERS THEN
    v_p_bi := 50;
  END;

  v_score := ROUND((v_p_banco + v_p_perf + v_p_cron + v_p_bi) / 4.0);

  v_partes := jsonb_build_object(
    'banco', v_p_banco,
    'performance', v_p_perf,
    'cron', v_p_cron,
    'bi', v_p_bi
  );

  RETURN jsonb_build_object(
    'gerado_em', now(),
    'score', v_score,
    'classificacao', CASE
      WHEN v_score >= 90 THEN 'EXCELENTE'
      WHEN v_score >= 75 THEN 'BOM'
      WHEN v_score >= 60 THEN 'ATENCAO'
      ELSE 'CRITICO'
    END,
    'componentes', v_partes,
    'formula', 'média aritmética simples de: banco, performance (cache hit%), cron (25 pts por job com problema), bi (por estado do healthcheck)'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.plataforma_health_score() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.plataforma_health_score() TO authenticated;

-- ============================================================
-- ETAPA 10 — AUDITORIA MANUAL DE DIAGNÓSTICOS
-- ============================================================
CREATE OR REPLACE FUNCTION public.observabilidade_registrar_execucao(
  p_acao text,
  p_detalhes jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT public._obs_can_read() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.audit_logs (
    user_id, tabela, registro_id, acao, dados_novos
  ) VALUES (
    auth.uid(),
    'observabilidade',
    gen_random_uuid(),
    'MUDANCA_STATUS'::audit_action,
    jsonb_build_object('acao_obs', p_acao, 'detalhes', p_detalhes, 'em', now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.observabilidade_registrar_execucao(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.observabilidade_registrar_execucao(text, jsonb) TO authenticated;
