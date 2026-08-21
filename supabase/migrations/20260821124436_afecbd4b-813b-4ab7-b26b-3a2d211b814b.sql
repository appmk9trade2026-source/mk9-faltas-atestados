CREATE OR REPLACE FUNCTION public.require_permission(_code text, _rota text DEFAULT NULL::text, _empresa_id uuid DEFAULT NULL::uuid, _projeto_id uuid DEFAULT NULL::uuid, _colaborador_id uuid DEFAULT NULL::uuid, _correlation_id uuid DEFAULT NULL::uuid, _observacoes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_corr      uuid := COALESCE(_correlation_id, gen_random_uuid());
  v_projeto   uuid := _projeto_id;
  v_empresa   uuid := _empresa_id;
  v_is_super  boolean;
BEGIN
  IF v_uid IS NULL THEN
    PERFORM public.rbac_log_deny(
      'PERMISSAO_NEGADA', _code, _rota, v_empresa, v_projeto, v_corr,
      'AUTH_REQUIRED'
    );
    RAISE EXCEPTION 'AUTH_REQUIRED: autenticação obrigatória'
      USING ERRCODE = '28000', HINT = v_corr::text;
  END IF;

  IF NOT public.has_permission(v_uid, _code) THEN
    PERFORM public.rbac_log_deny(
      'PERMISSAO_NEGADA', _code, _rota, v_empresa, v_projeto, v_corr,
      _observacoes
    );
    RAISE EXCEPTION 'PERMISSION_DENIED: permissão % negada', _code
      USING ERRCODE = '42501', HINT = v_corr::text;
  END IF;

  v_is_super := public.has_role(v_uid, 'super_admin');

  IF _colaborador_id IS NOT NULL THEN
    SELECT c.projeto_id, c.empresa_id
      INTO v_projeto, v_empresa
      FROM public.colaboradores c
     WHERE c.id = _colaborador_id;

    IF v_projeto IS NULL THEN
      PERFORM public.rbac_log_deny(
        'ESCOPO_COLABORADOR_NEGADO', _code, _rota, _empresa_id, _projeto_id, v_corr,
        'colaborador inexistente'
      );
      RAISE EXCEPTION 'RESOURCE_NOT_FOUND: colaborador não encontrado'
        USING ERRCODE = 'P0002', HINT = v_corr::text;
    END IF;

    IF _projeto_id IS NOT NULL AND _projeto_id <> v_projeto THEN
      PERFORM public.rbac_log_deny(
        'ESCOPO_COLABORADOR_NEGADO', _code, _rota, _empresa_id, _projeto_id, v_corr,
        'projeto informado difere do projeto do colaborador'
      );
      RAISE EXCEPTION 'COLLABORATOR_SCOPE_DENIED: colaborador fora do projeto informado'
        USING ERRCODE = '42501', HINT = v_corr::text;
    END IF;
    IF _empresa_id IS NOT NULL AND _empresa_id <> v_empresa THEN
      PERFORM public.rbac_log_deny(
        'ESCOPO_COLABORADOR_NEGADO', _code, _rota, _empresa_id, _projeto_id, v_corr,
        'empresa informada difere da empresa do colaborador'
      );
      RAISE EXCEPTION 'COLLABORATOR_SCOPE_DENIED: colaborador fora da empresa informada'
        USING ERRCODE = '42501', HINT = v_corr::text;
    END IF;
  END IF;

  IF v_projeto IS NOT NULL AND NOT v_is_super THEN
    IF NOT (
      public.has_role(v_uid, 'rh') OR
      public.has_role(v_uid, 'compliance') OR
      public.user_has_projeto(v_uid, v_projeto) OR
      public.user_pode_projeto_escopo_manual(v_uid, v_projeto)
    ) THEN
      PERFORM public.rbac_log_deny(
        'ESCOPO_PROJETO_NEGADO', _code, _rota, v_empresa, v_projeto, v_corr,
        _observacoes
      );
      RAISE EXCEPTION 'PROJECT_SCOPE_DENIED: projeto fora do seu escopo'
        USING ERRCODE = '42501', HINT = v_corr::text;
    END IF;
  END IF;

  -- CORREÇÃO: Adicionado check NOT v_is_super para ignorar validação de vínculo empresarial
  IF v_empresa IS NOT NULL AND v_projeto IS NULL AND NOT v_is_super THEN
    IF NOT (
      public.has_role(v_uid, 'rh') OR
      public.has_role(v_uid, 'compliance') OR
      EXISTS (
        SELECT 1 FROM public.usuario_empresas ue
         WHERE ue.user_id = v_uid AND ue.empresa_id = v_empresa
      )
    ) THEN
      PERFORM public.rbac_log_deny(
        'ESCOPO_EMPRESA_NEGADO', _code, _rota, v_empresa, NULL, v_corr,
        _observacoes
      );
      RAISE EXCEPTION 'COMPANY_SCOPE_DENIED: empresa fora do seu escopo'
        USING ERRCODE = '42501', HINT = v_corr::text;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'correlation_id', v_corr,
    'empresa_id', v_empresa,
    'projeto_id', v_projeto
  );
END;
$function$;