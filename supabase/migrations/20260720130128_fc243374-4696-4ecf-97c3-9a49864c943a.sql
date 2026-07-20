
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_CONVITE_REENVIADO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_CRIACAO_REVERTIDA';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_ULTIMO_SUPER_ADMIN_BLOQUEADO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_SESSOES_ENCERRADAS';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_AUTOALTERACAO_BLOQUEADA';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_PROJETO_EMPRESA_INCONSISTENTE';

CREATE OR REPLACE FUNCTION public.count_active_super_admins()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(DISTINCT ur.user_id)::int
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'super_admin'::app_role AND p.ativo = true
$$;
REVOKE ALL ON FUNCTION public.count_active_super_admins() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.count_active_super_admins() TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_user_roles_bloquear_ultimo_super_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ativo boolean; v_restantes int;
BEGIN
  IF OLD.role <> 'super_admin'::app_role THEN RETURN OLD; END IF;
  SELECT ativo INTO v_ativo FROM public.profiles WHERE id = OLD.user_id;
  IF v_ativo IS NOT TRUE THEN RETURN OLD; END IF;
  SELECT count(DISTINCT ur.user_id) INTO v_restantes
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'super_admin'::app_role AND p.ativo = true AND ur.user_id <> OLD.user_id;
  IF v_restantes < 1 THEN
    RAISE EXCEPTION 'É necessário manter pelo menos um Super Admin ativo.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS user_roles_bloquear_ultimo_super_admin ON public.user_roles;
CREATE TRIGGER user_roles_bloquear_ultimo_super_admin
BEFORE DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_user_roles_bloquear_ultimo_super_admin();

CREATE OR REPLACE FUNCTION public.tg_profiles_bloquear_ultimo_super_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_restantes int;
BEGIN
  IF NEW.ativo IS DISTINCT FROM OLD.ativo AND NEW.ativo = false THEN
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = OLD.id AND role = 'super_admin'::app_role) THEN
      SELECT count(DISTINCT ur.user_id) INTO v_restantes
        FROM public.user_roles ur
        JOIN public.profiles p ON p.id = ur.user_id
        WHERE ur.role = 'super_admin'::app_role AND p.ativo = true AND ur.user_id <> OLD.id;
      IF v_restantes < 1 THEN
        RAISE EXCEPTION 'É necessário manter pelo menos um Super Admin ativo.' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_bloquear_ultimo_super_admin ON public.profiles;
CREATE TRIGGER profiles_bloquear_ultimo_super_admin
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_bloquear_ultimo_super_admin();

CREATE OR REPLACE FUNCTION public.tg_usuario_projetos_valida_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_empresa uuid;
BEGIN
  SELECT empresa_id INTO v_empresa FROM public.projetos WHERE id = NEW.projeto_id;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Projeto inexistente.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuario_empresas WHERE user_id = NEW.user_id AND empresa_id = v_empresa) THEN
    RAISE EXCEPTION 'Projeto pertence a uma empresa não vinculada ao usuário.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS usuario_projetos_valida_empresa ON public.usuario_projetos;
CREATE TRIGGER usuario_projetos_valida_empresa
BEFORE INSERT OR UPDATE ON public.usuario_projetos
FOR EACH ROW EXECUTE FUNCTION public.tg_usuario_projetos_valida_empresa();

CREATE OR REPLACE FUNCTION public.tg_usuario_empresas_cascata_projetos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.usuario_projetos up
  USING public.projetos p
  WHERE up.user_id = OLD.user_id
    AND up.projeto_id = p.id
    AND p.empresa_id = OLD.empresa_id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS usuario_empresas_cascata_projetos ON public.usuario_empresas;
CREATE TRIGGER usuario_empresas_cascata_projetos
AFTER DELETE ON public.usuario_empresas
FOR EACH ROW EXECUTE FUNCTION public.tg_usuario_empresas_cascata_projetos();

DROP FUNCTION IF EXISTS public.admin_list_users(text, app_role, uuid, uuid, boolean, int, int);
CREATE OR REPLACE FUNCTION public.admin_list_users(
  _search text DEFAULT NULL,
  _role app_role DEFAULT NULL,
  _empresa_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _ativo boolean DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
) RETURNS TABLE (
  id uuid, nome text, email text, telefone_whatsapp text, cargo text, avatar_url text,
  ativo boolean, created_at timestamptz, last_sign_in_at timestamptz,
  banned_until timestamptz, invited_at timestamptz, email_confirmed_at timestamptz,
  roles app_role[], empresa_ids uuid[], empresa_nomes text[],
  projeto_ids uuid[], projeto_nomes text[], total_count bigint
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
    AND (_search IS NULL OR _search = '' OR p.nome ILIKE '%' || _search || '%' OR p.email ILIKE '%' || _search || '%')
    AND (_role IS NULL OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = _role))
    AND (_empresa_id IS NULL OR EXISTS (SELECT 1 FROM public.usuario_empresas ue WHERE ue.user_id = p.id AND ue.empresa_id = _empresa_id))
    AND (_projeto_id IS NULL OR EXISTS (SELECT 1 FROM public.usuario_projetos up WHERE up.user_id = p.id AND up.projeto_id = _projeto_id))
  ),
  counted AS (SELECT count(*)::bigint AS total FROM base)
  SELECT
    b.id, b.nome, b.email, b.telefone_whatsapp, b.cargo, b.avatar_url, b.ativo, b.created_at,
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
REVOKE ALL ON FUNCTION public.admin_list_users(text, app_role, uuid, uuid, boolean, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, app_role, uuid, uuid, boolean, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_user_sessions(_user_id uuid)
RETURNS TABLE (
  id uuid, device text, browser text, os text, cidade text, pais text,
  created_at timestamptz, last_activity timestamptz, expires_at timestamptz,
  status session_status, encerrada_em timestamptz, motivo_encerramento text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'compliance')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.id, s.device, s.browser, s.os, s.cidade, s.pais,
         s.created_at, s.last_activity, s.expires_at, s.status,
         s.encerrada_em, s.motivo_encerramento
  FROM public.user_sessions s
  WHERE s.user_id = _user_id
  ORDER BY (s.status = 'ATIVA') DESC, s.last_activity DESC
  LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_user_sessions(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_user_sessions(uuid) TO authenticated;
