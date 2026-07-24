
CREATE OR REPLACE FUNCTION public.coordenacao_listar_supervisores(
  _vinculo text DEFAULT 'todos',
  _empresa_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _coordenador_id uuid DEFAULT NULL,
  _busca text DEFAULT NULL,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  supervisor_id uuid,
  nome text,
  email text,
  ativo boolean,
  coordenador_id uuid,
  coordenador_nome text,
  coordenador_email text,
  colaboradores_count bigint,
  empresa_principal_id uuid,
  empresa_principal_nome text,
  projeto_principal_id uuid,
  projeto_principal_nome text,
  matricula text,
  created_at timestamp with time zone,
  total_registros bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_busca text := NULLIF(btrim(COALESCE(_busca, '')), '');
  v_limit int := GREATEST(1, LEAST(COALESCE(_limit, 100), 500));
  v_offset int := GREATEST(0, COALESCE(_offset, 0));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT public.coordenacao_pode_gerenciar(v_uid) THEN
    RAISE EXCEPTION 'Permissão negada para gerenciar Coordenação' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      ps.id                        AS sup_id,
      ps.nome                      AS sup_nome,
      ps.email                     AS sup_email,
      ps.ativo                     AS sup_ativo,
      ps.coordenador_usuario_id    AS coord_id,
      pc.nome                      AS coord_nome,
      pc.email                     AS coord_email,
      ps.created_at                AS sup_created_at,
      (SELECT count(*) FROM public.colaboradores c
        WHERE c.supervisor_usuario_id = ps.id AND c.ativo = true) AS colab_count,
      (SELECT c.empresa_id FROM public.colaboradores c
        WHERE c.supervisor_usuario_id = ps.id AND c.ativo = true
        GROUP BY c.empresa_id ORDER BY count(*) DESC NULLS LAST LIMIT 1) AS emp_id,
      (SELECT c.projeto_id FROM public.colaboradores c
        WHERE c.supervisor_usuario_id = ps.id AND c.ativo = true
        GROUP BY c.projeto_id ORDER BY count(*) DESC NULLS LAST LIMIT 1) AS proj_id,
      (SELECT c.matricula FROM public.colaboradores c
        WHERE c.email IS NOT NULL AND lower(c.email) = lower(ps.email)
        LIMIT 1) AS sup_matricula
    FROM public.profiles ps
    JOIN public.user_roles ur ON ur.user_id = ps.id AND ur.role = 'supervisor'::app_role
    LEFT JOIN public.profiles pc ON pc.id = ps.coordenador_usuario_id
    WHERE (
        _vinculo = 'todos'
        OR (_vinculo = 'com' AND ps.coordenador_usuario_id IS NOT NULL)
        OR (_vinculo = 'sem' AND ps.coordenador_usuario_id IS NULL)
      )
      AND (_coordenador_id IS NULL OR ps.coordenador_usuario_id = _coordenador_id)
  ),
  filtered AS (
    SELECT
      b.*,
      e.nome  AS emp_nome,
      pr.nome AS proj_nome
    FROM base b
    LEFT JOIN public.empresas e  ON e.id  = b.emp_id
    LEFT JOIN public.projetos pr ON pr.id = b.proj_id
    WHERE
      (_empresa_id IS NULL OR EXISTS (
        SELECT 1 FROM public.colaboradores c
        WHERE c.supervisor_usuario_id = b.sup_id AND c.empresa_id = _empresa_id AND c.ativo = true))
      AND (_projeto_id IS NULL OR EXISTS (
        SELECT 1 FROM public.colaboradores c
        WHERE c.supervisor_usuario_id = b.sup_id AND c.projeto_id = _projeto_id AND c.ativo = true))
      AND (
        v_busca IS NULL
        OR b.sup_nome ILIKE '%' || v_busca || '%'
        OR b.sup_email ILIKE '%' || v_busca || '%'
        OR COALESCE(b.sup_matricula, '') ILIKE '%' || v_busca || '%'
      )
  ),
  counted AS (
    SELECT f.*, count(*) OVER () AS total_reg FROM filtered f
  )
  SELECT
    cc.sup_id,
    cc.sup_nome,
    cc.sup_email,
    cc.sup_ativo,
    cc.coord_id,
    cc.coord_nome,
    cc.coord_email,
    cc.colab_count,
    cc.emp_id,
    cc.emp_nome,
    cc.proj_id,
    cc.proj_nome,
    cc.sup_matricula,
    cc.sup_created_at,
    cc.total_reg
  FROM counted cc
  ORDER BY cc.sup_nome NULLS LAST
  LIMIT v_limit
  OFFSET v_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.coordenacao_listar_supervisores(text, uuid, uuid, uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coordenacao_listar_supervisores(text, uuid, uuid, uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordenacao_listar_supervisores(text, uuid, uuid, uuid, text, integer, integer) TO service_role;
