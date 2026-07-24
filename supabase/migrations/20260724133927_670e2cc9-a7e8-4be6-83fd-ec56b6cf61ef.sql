
CREATE OR REPLACE FUNCTION public.coordenacao_listar_supervisores(
  _vinculo text DEFAULT 'todos'::text,
  _empresa_id uuid DEFAULT NULL::uuid,
  _projeto_id uuid DEFAULT NULL::uuid,
  _coordenador_id uuid DEFAULT NULL::uuid,
  _busca text DEFAULT NULL::text,
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
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH perm AS (
    SELECT CASE
      WHEN auth.uid() IS NULL OR NOT public.coordenacao_pode_gerenciar(auth.uid())
      THEN (1/0)::int
      ELSE 1
    END AS ok
  ),
  params AS (
    SELECT NULLIF(btrim(COALESCE(_busca, '')), '') AS v_busca
  ),
  base AS (
    SELECT
      ps.id                                       AS sup_id,
      ps.nome                                     AS sup_nome,
      ps.email                                    AS sup_email,
      ps.ativo                                    AS sup_ativo,
      ps.coordenador_usuario_id                   AS coord_id,
      pc.nome                                     AS coord_nome,
      pc.email                                    AS coord_email,
      ps.created_at                               AS sup_created_at,
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
    WHERE (SELECT ok FROM perm) = 1
      AND (
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
    CROSS JOIN params p
    WHERE
      (_empresa_id IS NULL OR EXISTS (
        SELECT 1 FROM public.colaboradores c
        WHERE c.supervisor_usuario_id = b.sup_id AND c.empresa_id = _empresa_id AND c.ativo = true))
      AND (_projeto_id IS NULL OR EXISTS (
        SELECT 1 FROM public.colaboradores c
        WHERE c.supervisor_usuario_id = b.sup_id AND c.projeto_id = _projeto_id AND c.ativo = true))
      AND (
        p.v_busca IS NULL
        OR b.sup_nome ILIKE '%' || p.v_busca || '%'
        OR b.sup_email ILIKE '%' || p.v_busca || '%'
        OR COALESCE(b.sup_matricula, '') ILIKE '%' || p.v_busca || '%'
      )
  ),
  counted AS (
    SELECT f.*, count(*) OVER () AS total_reg FROM filtered f
  )
  SELECT
    c.sup_id            AS supervisor_id,
    c.sup_nome          AS nome,
    c.sup_email         AS email,
    c.sup_ativo         AS ativo,
    c.coord_id          AS coordenador_id,
    c.coord_nome        AS coordenador_nome,
    c.coord_email       AS coordenador_email,
    c.colab_count       AS colaboradores_count,
    c.emp_id            AS empresa_principal_id,
    c.emp_nome          AS empresa_principal_nome,
    c.proj_id           AS projeto_principal_id,
    c.proj_nome         AS projeto_principal_nome,
    c.sup_matricula     AS matricula,
    c.sup_created_at    AS created_at,
    c.total_reg         AS total_registros
  FROM counted c
  ORDER BY c.sup_nome NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 500))
  OFFSET GREATEST(0, _offset);
$function$;
