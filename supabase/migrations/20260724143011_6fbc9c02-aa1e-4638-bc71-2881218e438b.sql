
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS matricula text NULL;
COMMENT ON COLUMN public.profiles.matricula IS
  'Matrícula do usuário. Fonte canônica; preserva zeros à esquerda.';

CREATE INDEX IF NOT EXISTS idx_profiles_matricula_ci
  ON public.profiles (lower(btrim(matricula)))
  WHERE matricula IS NOT NULL AND btrim(matricula) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_matricula_ci
  ON public.profiles (lower(btrim(matricula)))
  WHERE matricula IS NOT NULL AND btrim(matricula) <> '';

-- Backfill seguro (email único + uma matrícula distinta)
WITH candidatos AS (
  SELECT lower(btrim(c.email)) AS email_n,
         min(btrim(c.matricula)) AS mat
  FROM public.colaboradores c
  WHERE c.email IS NOT NULL AND btrim(c.email) <> ''
    AND c.matricula IS NOT NULL AND btrim(c.matricula) <> ''
  GROUP BY lower(btrim(c.email))
  HAVING count(DISTINCT btrim(c.matricula)) = 1
)
UPDATE public.profiles p
   SET matricula = c.mat
  FROM candidatos c
 WHERE lower(p.email) = c.email_n
   AND (p.matricula IS NULL OR btrim(p.matricula) = '')
   AND NOT EXISTS (
     SELECT 1 FROM public.profiles p2
      WHERE lower(btrim(p2.matricula)) = lower(c.mat)
        AND p2.id <> p.id
   );

-- Drop antes de recriar (mudança de RETURNS TABLE)
DROP FUNCTION IF EXISTS public.admin_list_users(text, app_role, uuid, uuid, boolean, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_users(
  _search text DEFAULT NULL,
  _role app_role DEFAULT NULL,
  _empresa_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _ativo boolean DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, nome text, email text, telefone_whatsapp text, cargo text, avatar_url text,
  matricula text, ativo boolean, created_at timestamptz,
  last_sign_in_at timestamptz, banned_until timestamptz, invited_at timestamptz, email_confirmed_at timestamptz,
  roles app_role[], empresa_ids uuid[], empresa_nomes text[], projeto_ids uuid[], projeto_nomes text[],
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_is_admin boolean := public.has_role(auth.uid(), 'super_admin');
  v_is_compliance boolean := public.has_role(auth.uid(), 'compliance');
  v_is_rh boolean := public.has_role(auth.uid(), 'rh');
BEGIN
  IF NOT (v_is_admin OR v_is_compliance OR v_is_rh) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH rh_empresas AS (
    SELECT empresa_id FROM public.usuario_empresas WHERE user_id = auth.uid()
  ),
  base AS (
    SELECT p.*
    FROM public.profiles p
    WHERE (
      v_is_admin OR v_is_compliance
      OR (v_is_rh AND EXISTS (
        SELECT 1 FROM public.usuario_empresas ue
        WHERE ue.user_id = p.id AND ue.empresa_id IN (SELECT empresa_id FROM rh_empresas)
      ))
    )
    AND (_ativo IS NULL OR p.ativo = _ativo)
    AND (
      _search IS NULL OR _search = ''
      OR p.nome ILIKE '%' || _search || '%'
      OR p.email ILIKE '%' || _search || '%'
      OR COALESCE(p.matricula,'') ILIKE '%' || _search || '%'
    )
    AND (_role IS NULL OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = _role))
    AND (_empresa_id IS NULL OR EXISTS (SELECT 1 FROM public.usuario_empresas ue WHERE ue.user_id = p.id AND ue.empresa_id = _empresa_id))
    AND (_projeto_id IS NULL OR EXISTS (SELECT 1 FROM public.usuario_projetos up WHERE up.user_id = p.id AND up.projeto_id = _projeto_id))
  ),
  counted AS (SELECT count(*)::bigint AS total FROM base)
  SELECT
    b.id, b.nome, b.email, b.telefone_whatsapp, b.cargo, b.avatar_url,
    b.matricula, b.ativo, b.created_at,
    u.last_sign_in_at, u.banned_until, u.invited_at, u.email_confirmed_at,
    COALESCE((SELECT array_agg(ur.role ORDER BY ur.role) FROM public.user_roles ur WHERE ur.user_id = b.id), ARRAY[]::app_role[]),
    COALESCE((SELECT array_agg(ue.empresa_id) FROM public.usuario_empresas ue WHERE ue.user_id = b.id), ARRAY[]::uuid[]),
    COALESCE((SELECT array_agg(e.nome ORDER BY e.nome) FROM public.usuario_empresas ue JOIN public.empresas e ON e.id = ue.empresa_id WHERE ue.user_id = b.id), ARRAY[]::text[]),
    COALESCE((SELECT array_agg(up.projeto_id) FROM public.usuario_projetos up WHERE up.user_id = b.id), ARRAY[]::uuid[]),
    COALESCE((SELECT array_agg(pr.nome ORDER BY pr.nome) FROM public.usuario_projetos up JOIN public.projetos pr ON pr.id = up.projeto_id WHERE up.user_id = b.id), ARRAY[]::text[]),
    (SELECT total FROM counted)
  FROM base b
  LEFT JOIN auth.users u ON u.id = b.id
  ORDER BY b.created_at DESC
  LIMIT GREATEST(_limit, 1)
  OFFSET GREATEST(_offset, 0);
END; $$;

REVOKE ALL ON FUNCTION public.admin_list_users(text, app_role, uuid, uuid, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, app_role, uuid, uuid, boolean, integer, integer) TO authenticated;

-- coordenacao_listar_supervisores: profiles.matricula como fonte, fallback colaboradores
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
  supervisor_id uuid, nome text, email text, ativo boolean,
  coordenador_id uuid, coordenador_nome text, coordenador_email text,
  colaboradores_count bigint,
  empresa_principal_id uuid, empresa_principal_nome text,
  projeto_principal_id uuid, projeto_principal_nome text,
  matricula text, created_at timestamptz, total_registros bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
      (SELECT up.projeto_id FROM public.usuario_projetos up
        WHERE up.user_id = ps.id
        ORDER BY up.created_at DESC NULLS LAST LIMIT 1) AS proj_id,
      COALESCE(
        NULLIF(btrim(ps.matricula), ''),
        (SELECT c.matricula FROM public.colaboradores c
          WHERE c.email IS NOT NULL AND lower(c.email) = lower(ps.email)
          ORDER BY c.ativo DESC, c.created_at DESC LIMIT 1)
      ) AS sup_matricula
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
  enriched AS (
    SELECT
      b.*,
      pr.nome        AS proj_nome,
      pr.empresa_id  AS proj_empresa_id,
      COALESCE(
        pr.empresa_id,
        (SELECT ue.empresa_id FROM public.usuario_empresas ue
          WHERE ue.user_id = b.sup_id
          ORDER BY ue.created_at DESC NULLS LAST LIMIT 1)
      ) AS emp_id
    FROM base b
    LEFT JOIN public.projetos pr ON pr.id = b.proj_id
  ),
  filtered AS (
    SELECT e.*, emp.nome AS emp_nome
    FROM enriched e
    LEFT JOIN public.empresas emp ON emp.id = e.emp_id
    WHERE
      (_empresa_id IS NULL OR EXISTS (
        SELECT 1 FROM public.usuario_empresas ue
        WHERE ue.user_id = e.sup_id AND ue.empresa_id = _empresa_id
      ) OR EXISTS (
        SELECT 1 FROM public.usuario_projetos up2 JOIN public.projetos pr2 ON pr2.id=up2.projeto_id
        WHERE up2.user_id = e.sup_id AND pr2.empresa_id = _empresa_id
      ))
      AND (_projeto_id IS NULL OR EXISTS (
        SELECT 1 FROM public.usuario_projetos up3
        WHERE up3.user_id = e.sup_id AND up3.projeto_id = _projeto_id
      ))
      AND (
        v_busca IS NULL
        OR e.sup_nome ILIKE '%' || v_busca || '%'
        OR e.sup_email ILIKE '%' || v_busca || '%'
        OR COALESCE(e.sup_matricula, '') ILIKE '%' || v_busca || '%'
      )
  ),
  counted AS (SELECT f.*, count(*) OVER () AS total_reg FROM filtered f)
  SELECT
    cc.sup_id, cc.sup_nome, cc.sup_email, cc.sup_ativo,
    cc.coord_id, cc.coord_nome, cc.coord_email,
    cc.colab_count,
    cc.emp_id, cc.emp_nome,
    cc.proj_id, cc.proj_nome,
    cc.sup_matricula, cc.sup_created_at, cc.total_reg
  FROM counted cc
  ORDER BY cc.sup_nome NULLS LAST
  LIMIT v_limit OFFSET v_offset;
END;
$$;
