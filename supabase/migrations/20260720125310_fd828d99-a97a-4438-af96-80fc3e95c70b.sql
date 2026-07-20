
-- 1) Expand app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operacao';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'visualizador';

-- 2) Expand audit_action enum
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_CRIADO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_EDITADO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_ATIVADO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_DESATIVADO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_ROLE_ADICIONADA';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_ROLE_REMOVIDA';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_EMPRESA_VINCULADA';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_EMPRESA_REMOVIDA';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_PROJETO_VINCULADO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_PROJETO_REMOVIDO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_RESET_SENHA';

-- 3) Profile extra columns (do not touch id/email)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- 4) usuario_empresas
CREATE TABLE IF NOT EXISTS public.usuario_empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, empresa_id)
);
GRANT SELECT ON public.usuario_empresas TO authenticated;
GRANT ALL ON public.usuario_empresas TO service_role;
ALTER TABLE public.usuario_empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin gerencia vínculos empresa" ON public.usuario_empresas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Compliance vê vínculos empresa" ON public.usuario_empresas
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'compliance'::app_role));
CREATE POLICY "Usuário vê próprios vínculos empresa" ON public.usuario_empresas
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_usuario_empresas_user ON public.usuario_empresas(user_id);
CREATE INDEX IF NOT EXISTS idx_usuario_empresas_empresa ON public.usuario_empresas(empresa_id);

-- 5) usuario_projetos
CREATE TABLE IF NOT EXISTS public.usuario_projetos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, projeto_id)
);
GRANT SELECT ON public.usuario_projetos TO authenticated;
GRANT ALL ON public.usuario_projetos TO service_role;
ALTER TABLE public.usuario_projetos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin gerencia vínculos projeto" ON public.usuario_projetos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Compliance vê vínculos projeto" ON public.usuario_projetos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'compliance'::app_role));
CREATE POLICY "Usuário vê próprios vínculos projeto" ON public.usuario_projetos
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_usuario_projetos_user ON public.usuario_projetos(user_id);
CREATE INDEX IF NOT EXISTS idx_usuario_projetos_projeto ON public.usuario_projetos(projeto_id);

-- 6) RH policy: read profiles/roles/links for users linked to same empresas as the RH user
CREATE OR REPLACE FUNCTION public.rh_pode_ver_usuario(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'rh'::app_role) AND EXISTS (
    SELECT 1
    FROM public.usuario_empresas ue1
    JOIN public.usuario_empresas ue2 ON ue1.empresa_id = ue2.empresa_id
    WHERE ue1.user_id = auth.uid()
      AND ue2.user_id = _user_id
  )
$$;
REVOKE ALL ON FUNCTION public.rh_pode_ver_usuario(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_pode_ver_usuario(uuid) TO authenticated;

DROP POLICY IF EXISTS "RH vê perfis vinculados às suas empresas" ON public.profiles;
CREATE POLICY "RH vê perfis vinculados às suas empresas" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.rh_pode_ver_usuario(id));

DROP POLICY IF EXISTS "Compliance vê perfis" ON public.profiles;
CREATE POLICY "Compliance vê perfis" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'compliance'::app_role));

DROP POLICY IF EXISTS "Compliance vê papéis" ON public.user_roles;
CREATE POLICY "Compliance vê papéis" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'compliance'::app_role));

-- 7) admin_list_users RPC
CREATE OR REPLACE FUNCTION public.admin_list_users(
  _search text DEFAULT NULL,
  _role app_role DEFAULT NULL,
  _empresa_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _ativo boolean DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
) RETURNS TABLE (
  id uuid,
  nome text,
  email text,
  telefone_whatsapp text,
  cargo text,
  avatar_url text,
  ativo boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  roles app_role[],
  empresa_ids uuid[],
  empresa_nomes text[],
  projeto_ids uuid[],
  projeto_nomes text[],
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
        WHERE ue.user_id = p.id
          AND ue.empresa_id IN (SELECT empresa_id FROM rh_empresas)
      ))
    )
    AND (_ativo IS NULL OR p.ativo = _ativo)
    AND (_search IS NULL OR _search = ''
         OR p.nome ILIKE '%' || _search || '%'
         OR p.email ILIKE '%' || _search || '%')
    AND (_role IS NULL OR EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = _role
    ))
    AND (_empresa_id IS NULL OR EXISTS (
      SELECT 1 FROM public.usuario_empresas ue WHERE ue.user_id = p.id AND ue.empresa_id = _empresa_id
    ))
    AND (_projeto_id IS NULL OR EXISTS (
      SELECT 1 FROM public.usuario_projetos up WHERE up.user_id = p.id AND up.projeto_id = _projeto_id
    ))
  ),
  counted AS (SELECT count(*)::bigint AS total FROM base)
  SELECT
    b.id, b.nome, b.email, b.telefone_whatsapp, b.cargo, b.avatar_url, b.ativo, b.created_at,
    u.last_sign_in_at,
    COALESCE((SELECT array_agg(ur.role ORDER BY ur.role) FROM public.user_roles ur WHERE ur.user_id = b.id), ARRAY[]::app_role[]) AS roles,
    COALESCE((SELECT array_agg(ue.empresa_id) FROM public.usuario_empresas ue WHERE ue.user_id = b.id), ARRAY[]::uuid[]) AS empresa_ids,
    COALESCE((SELECT array_agg(e.nome ORDER BY e.nome) FROM public.usuario_empresas ue JOIN public.empresas e ON e.id = ue.empresa_id WHERE ue.user_id = b.id), ARRAY[]::text[]) AS empresa_nomes,
    COALESCE((SELECT array_agg(up.projeto_id) FROM public.usuario_projetos up WHERE up.user_id = b.id), ARRAY[]::uuid[]) AS projeto_ids,
    COALESCE((SELECT array_agg(pr.nome ORDER BY pr.nome) FROM public.usuario_projetos up JOIN public.projetos pr ON pr.id = up.projeto_id WHERE up.user_id = b.id), ARRAY[]::text[]) AS projeto_nomes,
    (SELECT total FROM counted) AS total_count
  FROM base b
  LEFT JOIN auth.users u ON u.id = b.id
  ORDER BY b.created_at DESC
  LIMIT GREATEST(_limit, 1)
  OFFSET GREATEST(_offset, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_users(text, app_role, uuid, uuid, boolean, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, app_role, uuid, uuid, boolean, int, int) TO authenticated;

-- 8) admin_get_user_history — reads audit_logs for a given user id
CREATE OR REPLACE FUNCTION public.admin_get_user_history(_user_id uuid, _limit int DEFAULT 100)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  acao audit_action,
  modulo text,
  entidade text,
  usuario_nome text,
  observacoes text,
  antes jsonb,
  depois jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, a.created_at, a.acao, a.modulo, a.entidade, a.usuario_nome, a.observacoes, a.antes, a.depois
  FROM public.audit_logs a
  WHERE (a.registro_id = _user_id OR a.usuario_id = _user_id)
    AND a.modulo IN ('usuarios','auth')
    AND (
      public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'compliance')
      OR (public.has_role(auth.uid(), 'rh') AND public.rh_pode_ver_usuario(_user_id))
    )
  ORDER BY a.created_at DESC
  LIMIT GREATEST(_limit, 1)
$$;
REVOKE ALL ON FUNCTION public.admin_get_user_history(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_history(uuid, int) TO authenticated;
