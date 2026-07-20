
-- =========================================================
-- Constantes: permissões críticas que o super_admin não pode
-- perder pela matriz (proteção contra bloqueio administrativo).
-- =========================================================
CREATE OR REPLACE FUNCTION public.rbac_critical_super_admin_perms()
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'permissao.visualizar',
    'permissao.editar',
    'usuario.visualizar',
    'usuario.editar',
    'auditoria.visualizar',
    'configuracao.visualizar'
  ]::text[];
$$;

-- =========================================================
-- Trigger: proteger permissões críticas do super_admin
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_protect_super_admin_critical_perms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _crit TEXT[] := public.rbac_critical_super_admin_perms();
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'super_admin'::public.app_role
       AND OLD.permission_code = ANY(_crit) THEN
      RAISE EXCEPTION 'Não é permitido remover a permissão % do perfil Super Admin (permissão crítica).', OLD.permission_code
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_super_admin_critical_perms ON public.role_permissions;
CREATE TRIGGER trg_protect_super_admin_critical_perms
BEFORE DELETE ON public.role_permissions
FOR EACH ROW EXECUTE FUNCTION public.tg_protect_super_admin_critical_perms();

-- =========================================================
-- Trigger: bloquear edição das próprias permissões individuais
-- (super_admin não pode dar deny/allow em si mesmo pela UI)
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_prevent_self_user_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target UUID;
BEGIN
  _target := COALESCE(NEW.user_id, OLD.user_id);
  IF _target = auth.uid() THEN
    RAISE EXCEPTION 'Não é permitido alterar as próprias permissões individuais.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_user_permission ON public.user_permissions;
CREATE TRIGGER trg_prevent_self_user_permission
BEFORE INSERT OR UPDATE OR DELETE ON public.user_permissions
FOR EACH ROW EXECUTE FUNCTION public.tg_prevent_self_user_permission();

-- =========================================================
-- Função: matriz completa role x permission
-- =========================================================
CREATE OR REPLACE FUNCTION public.rbac_matrix()
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'permissao.visualizar') THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: permissao.visualizar' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'permissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', code, 'module', module, 'action', action, 'description', description
      ) ORDER BY module, action) FROM public.permissions
    ), '[]'::jsonb),
    'role_permissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('role', role, 'permission_code', permission_code))
      FROM public.role_permissions
    ), '[]'::jsonb),
    'critical_super_admin', to_jsonb(public.rbac_critical_super_admin_perms())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rbac_matrix() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_matrix() TO authenticated, service_role;

-- =========================================================
-- Função: atualiza matriz em lote (grant/revoke por role/code)
-- =========================================================
CREATE OR REPLACE FUNCTION public.rbac_apply_role_matrix(_changes JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rec JSONB;
  _role public.app_role;
  _code TEXT;
  _action TEXT;
  _crit TEXT[] := public.rbac_critical_super_admin_perms();
  _applied INT := 0;
  _correlation UUID := gen_random_uuid();
  _existed BOOLEAN;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'permissao.editar') THEN
    PERFORM public.log_permission_denied('permissao.editar', '/administracao/permissoes', NULL, NULL,
      'Tentativa de alterar matriz sem permissão.');
    RAISE EXCEPTION 'PERMISSAO_NEGADA: permissao.editar' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF jsonb_typeof(_changes) <> 'array' THEN
    RAISE EXCEPTION 'Payload inválido: esperado array.';
  END IF;

  FOR _rec IN SELECT * FROM jsonb_array_elements(_changes) LOOP
    _role := (_rec->>'role')::public.app_role;
    _code := _rec->>'permission_code';
    _action := _rec->>'action';

    IF _code IS NULL OR _action IS NULL OR _role IS NULL THEN
      RAISE EXCEPTION 'Item inválido: %', _rec;
    END IF;

    IF _role = 'super_admin' AND _action = 'revoke' AND _code = ANY(_crit) THEN
      RAISE EXCEPTION 'Não é permitido remover a permissão % do Super Admin (crítica).', _code
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.role_permissions
      WHERE role = _role AND permission_code = _code
    ) INTO _existed;

    IF _action = 'grant' THEN
      INSERT INTO public.role_permissions (role, permission_code)
      VALUES (_role, _code)
      ON CONFLICT (role, permission_code) DO NOTHING;

      INSERT INTO public.audit_logs (user_id, modulo, acao, entidade, entidade_id, dados_novos, correlation_id, origem)
      VALUES (auth.uid(), 'rbac',
        CASE WHEN _existed THEN 'ROLE_PERMISSION_UPDATED' ELSE 'ROLE_PERMISSION_CREATED' END::public.audit_action,
        'RolePermission', NULL,
        jsonb_build_object('role', _role, 'permission_code', _code, 'effect', 'grant'),
        _correlation, 'web');
    ELSIF _action = 'revoke' THEN
      DELETE FROM public.role_permissions
      WHERE role = _role AND permission_code = _code;

      IF _existed THEN
        INSERT INTO public.audit_logs (user_id, modulo, acao, entidade, entidade_id, dados_antigos, correlation_id, origem)
        VALUES (auth.uid(), 'rbac', 'ROLE_PERMISSION_REMOVED'::public.audit_action,
          'RolePermission', NULL,
          jsonb_build_object('role', _role, 'permission_code', _code),
          _correlation, 'web');
      END IF;
    ELSE
      RAISE EXCEPTION 'Ação inválida: %', _action;
    END IF;

    _applied := _applied + 1;
  END LOOP;

  IF _applied > 1 THEN
    INSERT INTO public.audit_logs (user_id, modulo, acao, entidade, dados_novos, correlation_id, origem)
    VALUES (auth.uid(), 'rbac', 'ROLE_PERMISSION_BULK_UPDATED'::public.audit_action,
      'RolePermission',
      jsonb_build_object('total', _applied),
      _correlation, 'web');
  END IF;

  RETURN jsonb_build_object('applied', _applied, 'correlation_id', _correlation);
END;
$$;

REVOKE ALL ON FUNCTION public.rbac_apply_role_matrix(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_apply_role_matrix(JSONB) TO authenticated, service_role;

-- =========================================================
-- Função: aplica override individual (inherit / allow / deny)
-- =========================================================
CREATE OR REPLACE FUNCTION public.rbac_apply_user_permission(
  _user_id UUID, _code TEXT, _mode TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev public.permission_effect;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'permissao.editar') THEN
    PERFORM public.log_permission_denied('permissao.editar', '/usuarios', NULL, NULL,
      'Tentativa de override sem permissão.');
    RAISE EXCEPTION 'PERMISSAO_NEGADA: permissao.editar' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Não é permitido alterar as próprias permissões.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE code = _code) THEN
    RAISE EXCEPTION 'Permissão desconhecida: %', _code;
  END IF;

  SELECT effect INTO _prev FROM public.user_permissions
  WHERE user_id = _user_id AND permission_code = _code;

  IF _mode = 'inherit' THEN
    DELETE FROM public.user_permissions WHERE user_id = _user_id AND permission_code = _code;
    IF _prev IS NOT NULL THEN
      INSERT INTO public.audit_logs (user_id, modulo, acao, entidade, entidade_id, dados_antigos, dados_novos, origem)
      VALUES (auth.uid(), 'rbac', 'USER_PERMISSION_REMOVED'::public.audit_action,
        'UserPermission', _user_id,
        jsonb_build_object('permission_code', _code, 'effect', _prev),
        jsonb_build_object('permission_code', _code, 'effect', 'inherit'),
        'web');
    END IF;
  ELSIF _mode IN ('allow','deny') THEN
    INSERT INTO public.user_permissions (user_id, permission_code, effect, created_by)
    VALUES (_user_id, _code, _mode::public.permission_effect, auth.uid())
    ON CONFLICT (user_id, permission_code)
    DO UPDATE SET effect = EXCLUDED.effect, created_by = EXCLUDED.created_by;

    INSERT INTO public.audit_logs (user_id, modulo, acao, entidade, entidade_id, dados_antigos, dados_novos, origem)
    VALUES (auth.uid(), 'rbac', 'USER_PERMISSION_UPDATED'::public.audit_action,
      'UserPermission', _user_id,
      CASE WHEN _prev IS NULL THEN NULL ELSE jsonb_build_object('effect', _prev) END,
      jsonb_build_object('permission_code', _code, 'effect', _mode),
      'web');
  ELSE
    RAISE EXCEPTION 'Modo inválido: % (esperado inherit/allow/deny)', _mode;
  END IF;

  RETURN jsonb_build_object('user_id', _user_id, 'permission_code', _code, 'mode', _mode);
END;
$$;

REVOKE ALL ON FUNCTION public.rbac_apply_user_permission(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_apply_user_permission(UUID, TEXT, TEXT) TO authenticated, service_role;

-- =========================================================
-- Função: resumo efetivo por usuário (para tela de overrides)
-- =========================================================
CREATE OR REPLACE FUNCTION public.rbac_user_summary(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _roles public.app_role[];
  _from_role TEXT[];
  _allows TEXT[];
  _denies TEXT[];
  _effective TEXT[];
BEGIN
  IF NOT public.has_permission(auth.uid(), 'permissao.visualizar') THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: permissao.visualizar' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT array_agg(role) INTO _roles FROM public.user_roles WHERE user_id = _user_id;

  SELECT array_agg(DISTINCT rp.permission_code) INTO _from_role
  FROM public.user_roles ur JOIN public.role_permissions rp ON rp.role = ur.role
  WHERE ur.user_id = _user_id;

  SELECT array_agg(permission_code) INTO _allows FROM public.user_permissions
  WHERE user_id = _user_id AND effect = 'allow';

  SELECT array_agg(permission_code) INTO _denies FROM public.user_permissions
  WHERE user_id = _user_id AND effect = 'deny';

  SELECT array_agg(permission_code) INTO _effective FROM (
    SELECT unnest(COALESCE(_from_role,'{}'::text[])) AS permission_code
    UNION
    SELECT unnest(COALESCE(_allows,'{}'::text[]))
    EXCEPT
    SELECT unnest(COALESCE(_denies,'{}'::text[]))
  ) x;

  RETURN jsonb_build_object(
    'user_id', _user_id,
    'roles', COALESCE(to_jsonb(_roles), '[]'::jsonb),
    'from_role', COALESCE(to_jsonb(_from_role), '[]'::jsonb),
    'allows', COALESCE(to_jsonb(_allows), '[]'::jsonb),
    'denies', COALESCE(to_jsonb(_denies), '[]'::jsonb),
    'effective', COALESCE(to_jsonb(_effective), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rbac_user_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rbac_user_summary(UUID) TO authenticated, service_role;
