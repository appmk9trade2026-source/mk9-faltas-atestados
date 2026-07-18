
-- ============================================================
-- ETAPA 29 · FASE A · Diagnóstico de segurança (somente leitura)
-- ============================================================

-- 1) Inventário de funções ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.security_functions_inventory()
RETURNS TABLE(
  schema_name text,
  function_name text,
  signature text,
  security_definer boolean,
  search_path_configurado boolean,
  search_path_valor text,
  execute_public boolean,
  execute_anon boolean,
  execute_authenticated boolean,
  execute_service_role boolean,
  owner_name text,
  volatility text,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'compliance')) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      n.nspname::text AS sname,
      p.proname::text AS fname,
      pg_get_function_identity_arguments(p.oid) AS args,
      p.prosecdef AS secdef,
      p.proconfig,
      pg_get_userbyid(p.proowner)::text AS owner,
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END AS vol,
      has_function_privilege('public', p.oid, 'EXECUTE') AS x_pub,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS x_anon,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS x_auth,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS x_srv
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  ),
  enriched AS (
    SELECT
      b.*,
      COALESCE((
        SELECT string_agg(c, ',') FROM unnest(b.proconfig) c WHERE c LIKE 'search_path=%'
      ), '') AS sp_raw
    FROM base b
  )
  SELECT
    e.sname,
    e.fname,
    (e.fname || '(' || e.args || ')')::text,
    e.secdef,
    (e.sp_raw <> '')::boolean,
    NULLIF(e.sp_raw, '')::text,
    e.x_pub, e.x_anon, e.x_auth, e.x_srv,
    e.owner,
    e.vol,
    CASE
      WHEN e.secdef AND e.sp_raw = '' THEN 'SEARCH_PATH_AUSENTE'
      WHEN e.secdef AND e.x_pub THEN 'SECURITY_DEFINER_EXPOSTA'
      WHEN e.x_anon THEN 'ANON_EXECUTE'
      WHEN e.x_pub THEN 'PUBLIC_EXECUTE'
      WHEN e.secdef AND e.owner NOT IN ('postgres','supabase_admin') THEN 'OWNER_INESPERADO'
      WHEN e.secdef AND NOT e.x_auth AND NOT e.x_srv THEN 'GRANT_INCONSISTENTE'
      ELSE 'OK'
    END::text
  FROM enriched e
  ORDER BY
    CASE
      WHEN e.secdef AND e.sp_raw = '' THEN 0
      WHEN e.secdef AND e.x_pub THEN 1
      WHEN e.x_anon THEN 2
      WHEN e.x_pub THEN 3
      ELSE 9
    END,
    e.fname;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.security_functions_inventory() FROM public;
REVOKE EXECUTE ON FUNCTION public.security_functions_inventory() FROM anon;
GRANT EXECUTE ON FUNCTION public.security_functions_inventory() TO authenticated;

-- 2) Slow queries via pg_stat_statements -------------------------------------
CREATE OR REPLACE FUNCTION public.database_slow_queries(
  p_limit integer DEFAULT 20,
  p_min_calls integer DEFAULT 5
)
RETURNS TABLE(
  query_fingerprint text,
  calls bigint,
  total_exec_time_ms double precision,
  mean_exec_time_ms double precision,
  max_exec_time_ms double precision,
  rows_ bigint,
  shared_blks_hit bigint,
  shared_blks_read bigint,
  temp_blks_written bigint,
  classificacao text,
  disponivel text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_ext boolean;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'compliance')) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') INTO v_has_ext;

  IF NOT v_has_ext THEN
    RETURN QUERY SELECT NULL::text, NULL::bigint, NULL::double precision, NULL::double precision,
      NULL::double precision, NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint,
      'NAO_DISPONIVEL'::text, 'NAO_DISPONIVEL'::text
    WHERE false;
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format($q$
    WITH s AS (
      SELECT
        -- sanitiza literais / IN-lists / uuids / e-mails
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(query, '''[^'']*''', '?', 'g'),
              '\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b', '?', 'g'
            ),
            '\b\d+\b', '?', 'g'
          ),
          '\s+', ' ', 'g'
        ) AS fp,
        calls, total_exec_time, mean_exec_time, max_exec_time, rows,
        shared_blks_hit, shared_blks_read, temp_blks_written
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND calls >= %L
        AND query NOT ILIKE 'SET %%'
        AND query NOT ILIKE 'BEGIN%%'
        AND query NOT ILIKE 'COMMIT%%'
        AND query NOT ILIKE 'RESET %%'
    )
    SELECT
      substr(fp, 1, 240) AS query_fingerprint,
      sum(calls)::bigint,
      sum(total_exec_time),
      avg(mean_exec_time),
      max(max_exec_time),
      sum(rows)::bigint,
      sum(shared_blks_hit)::bigint,
      sum(shared_blks_read)::bigint,
      sum(temp_blks_written)::bigint,
      CASE
        WHEN max(max_exec_time) > 1000 OR avg(mean_exec_time) > 250 THEN 'LENTA'
        WHEN max(max_exec_time) > 250  OR avg(mean_exec_time) > 50  THEN 'ATENCAO'
        ELSE 'NORMAL'
      END,
      'OK'
    FROM s
    GROUP BY fp
    ORDER BY sum(total_exec_time) DESC
    LIMIT %L
  $q$, p_min_calls, p_limit);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.database_slow_queries(integer, integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.database_slow_queries(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.database_slow_queries(integer, integer) TO authenticated;
