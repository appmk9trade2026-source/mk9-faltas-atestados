-- CRM MK9 — CORREÇÃO CIRÚRGICA E HARDENING DA MATRIZ DE PERMISSÕES
-- MODO: IMPLEMENTAÇÃO CONTROLADA DE SEGURANÇA
-- SEVERIDADE: ALTA — MÓDULO RBAC

-- 1. HARDENING DA RPC rbac_apply_role_matrix
-- Transforma em SECURITY DEFINER para permitir acesso controlado às tabelas sem expor DML direto ao authenticated.
-- Implementa validação server-side rigorosa de papel (super_admin).

CREATE OR REPLACE FUNCTION public.rbac_apply_role_matrix(_changes JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  _user_id UUID := auth.uid();
BEGIN
  -- ETAPA 2 & 3: Validação server-side de autorização (Super Admin)
  IF NOT public.has_role(_user_id, 'super_admin') THEN
    PERFORM public.log_permission_denied('permissao.editar', '/administracao/permissoes', NULL, NULL,
      'Tentativa de alteração da matriz RBAC por usuário não autorizado.');
    RAISE EXCEPTION 'ACESSO_NEGADO: Somente Super Admins podem alterar a matriz de permissões.' 
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ETAPA 4: Validação do Payload
  IF jsonb_typeof(_changes) <> 'array' THEN
    RAISE EXCEPTION 'Payload inválido: esperado array.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ETAPA 10: Processamento em loop (Transacional por natureza da função)
  FOR _rec IN SELECT * FROM jsonb_array_elements(_changes) LOOP
    _role := (_rec->>'role')::public.app_role;
    _code := _rec->>'permission_code';
    _action := _rec->>'action';

    IF _code IS NULL OR _action IS NULL OR _role IS NULL THEN
      RAISE EXCEPTION 'Item de payload inválido: %', _rec USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- ETAPA 13: Proteção de Permissões Críticas
    IF _role = 'super_admin' AND _action = 'revoke' AND _code = ANY(_crit) THEN
      RAISE EXCEPTION 'Segurança: Não é permitido remover a permissão crítica (%) do Super Admin.', _code
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

      -- ETAPA 11: Auditoria Forense
      INSERT INTO public.audit_logs (user_id, modulo, acao, entidade, entidade_id, dados_novos, correlation_id, origem)
      VALUES (_user_id, 'rbac',
        CASE WHEN _existed THEN 'ROLE_PERMISSION_UPDATED' ELSE 'ROLE_PERMISSION_CREATED' END::public.audit_action,
        'RolePermission', NULL,
        jsonb_build_object('role', _role, 'permission_code', _code, 'effect', 'grant'),
        _correlation, 'web');
    ELSIF _action = 'revoke' THEN
      DELETE FROM public.role_permissions
      WHERE role = _role AND permission_code = _code;

      IF _existed THEN
        INSERT INTO public.audit_logs (user_id, modulo, acao, entidade, entidade_id, dados_antigos, correlation_id, origem)
        VALUES (_user_id, 'rbac', 'ROLE_PERMISSION_REMOVED'::public.audit_action,
          'RolePermission', NULL,
          jsonb_build_object('role', _role, 'permission_code', _code),
          _correlation, 'web');
      END IF;
    ELSE
      RAISE EXCEPTION 'Ação inválida: %', _action USING ERRCODE = 'invalid_parameter_value';
    END IF;

    _applied := _applied + 1;
  END LOOP;

  IF _applied > 1 THEN
    INSERT INTO public.audit_logs (user_id, modulo, acao, entidade, dados_novos, correlation_id, origem)
    VALUES (_user_id, 'rbac', 'ROLE_PERMISSION_BULK_UPDATED'::public.audit_action,
      'RolePermission',
      jsonb_build_object('total', _applied),
      _correlation, 'web');
  END IF;

  RETURN jsonb_build_object('applied', _applied, 'correlation_id', _correlation);
END;
$$;

-- ETAPA 6: GRANTS DA RPC
REVOKE ALL ON FUNCTION public.rbac_apply_role_matrix(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_apply_role_matrix(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.rbac_apply_role_matrix(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_apply_role_matrix(JSONB) TO service_role;

-- ETAPA 5 & 7: GRANTS MÍNIMOS DE OBJETO
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

-- Hardening: Revogar DML direto do authenticated nas tabelas sensíveis
REVOKE INSERT, UPDATE, DELETE ON public.role_permissions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.permissions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_permissions FROM authenticated;

-- Garantir acesso ao service_role
GRANT ALL ON public.role_permissions TO service_role;
GRANT ALL ON public.permissions TO service_role;
GRANT ALL ON public.audit_logs TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.user_permissions TO service_role;

COMMENT ON FUNCTION public.rbac_apply_role_matrix(JSONB) IS 'Aplica alterações na matriz de permissões com hardening e auditoria.';
