CREATE OR REPLACE FUNCTION public.rbac_apply_role_matrix(_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- Validação server-side de autorização (Super Admin)
  IF NOT public.has_role(_user_id, 'super_admin') THEN
    PERFORM public.log_permission_denied('permissao.editar', '/administracao/permissoes', NULL, NULL,
      'Tentativa de alteração da matriz RBAC por usuário não autorizado.');
    RAISE EXCEPTION 'ACESSO_NEGADO: Somente Super Admins podem alterar a matriz de permissões.' 
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF jsonb_typeof(_changes) <> 'array' THEN
    RAISE EXCEPTION 'Payload inválido: esperado array.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR _rec IN SELECT * FROM jsonb_array_elements(_changes) LOOP
    _role := (_rec->>'role')::public.app_role;
    _code := _rec->>'permission_code';
    _action := _rec->>'action';

    IF _code IS NULL OR _action IS NULL OR _role IS NULL THEN
      RAISE EXCEPTION 'Item de payload inválido: %', _rec USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Proteção de Permissões Críticas
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

      -- Correção: usuario_id, depois, sucesso
      INSERT INTO public.audit_logs (usuario_id, modulo, acao, entidade, registro_id, depois, sucesso, observacoes, origem)
      VALUES (_user_id, 'rbac',
        CASE WHEN _existed THEN 'ROLE_PERMISSION_UPDATED' ELSE 'ROLE_PERMISSION_CREATED' END::public.audit_action,
        'RolePermission', NULL,
        jsonb_build_object('role', _role, 'permission_code', _code, 'effect', 'grant'),
        true,
        'Alteração de permissão via matriz administrativa [corr=' || _correlation || ']',
        'web');
    ELSIF _action = 'revoke' THEN
      DELETE FROM public.role_permissions
      WHERE role = _role AND permission_code = _code;

      IF _existed THEN
        -- Correção: usuario_id, antes, sucesso
        INSERT INTO public.audit_logs (usuario_id, modulo, acao, entidade, registro_id, antes, sucesso, observacoes, origem)
        VALUES (_user_id, 'rbac', 'ROLE_PERMISSION_REMOVED'::public.audit_action,
          'RolePermission', NULL,
          jsonb_build_object('role', _role, 'permission_code', _code),
          true,
          'Remoção de permissão via matriz administrativa [corr=' || _correlation || ']',
          'web');
      END IF;
    ELSE
      RAISE EXCEPTION 'Ação inválida: %', _action USING ERRCODE = 'invalid_parameter_value';
    END IF;

    _applied := _applied + 1;
  END LOOP;

  IF _applied > 1 THEN
    INSERT INTO public.audit_logs (usuario_id, modulo, acao, entidade, depois, sucesso, observacoes, origem)
    VALUES (_user_id, 'rbac', 'ROLE_PERMISSION_BULK_UPDATED'::public.audit_action,
      'RolePermission',
      jsonb_build_object('total', _applied),
      true,
      'Atualização em lote da matriz de permissões [corr=' || _correlation || ']',
      'web');
  END IF;

  RETURN jsonb_build_object('applied', _applied, 'correlation_id', _correlation);
END;
$function$;