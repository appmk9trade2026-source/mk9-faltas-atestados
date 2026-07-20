
-- ============================================================
-- Novas ações de auditoria (RBAC Fase 3 — Onda 1)
-- ============================================================
DO $$
BEGIN
  -- Ausências (permitidas)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'audit_action'::regtype AND enumlabel = 'AUSENCIA_CRIADA') THEN
    ALTER TYPE public.audit_action ADD VALUE 'AUSENCIA_CRIADA';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'audit_action'::regtype AND enumlabel = 'AUSENCIA_EDITADA') THEN
    ALTER TYPE public.audit_action ADD VALUE 'AUSENCIA_EDITADA';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'audit_action'::regtype AND enumlabel = 'AUSENCIA_EXCLUIDA') THEN
    ALTER TYPE public.audit_action ADD VALUE 'AUSENCIA_EXCLUIDA';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'audit_action'::regtype AND enumlabel = 'AUSENCIA_STATUS_ALTERADO') THEN
    ALTER TYPE public.audit_action ADD VALUE 'AUSENCIA_STATUS_ALTERADO';
  END IF;
END $$;
-- Escopos negados / mutação bloqueada
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'audit_action'::regtype AND enumlabel = 'ESCOPO_EMPRESA_NEGADO') THEN
    ALTER TYPE public.audit_action ADD VALUE 'ESCOPO_EMPRESA_NEGADO';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'audit_action'::regtype AND enumlabel = 'ESCOPO_PROJETO_NEGADO') THEN
    ALTER TYPE public.audit_action ADD VALUE 'ESCOPO_PROJETO_NEGADO';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'audit_action'::regtype AND enumlabel = 'ESCOPO_COLABORADOR_NEGADO') THEN
    ALTER TYPE public.audit_action ADD VALUE 'ESCOPO_COLABORADOR_NEGADO';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'audit_action'::regtype AND enumlabel = 'MUTACAO_BLOQUEADA') THEN
    ALTER TYPE public.audit_action ADD VALUE 'MUTACAO_BLOQUEADA';
  END IF;
END $$;

-- ============================================================
-- rbac_log_deny: helper interno que grava auditoria (mesma transação
-- pode falhar sem quebrar o log via subtransação implicit em plpgsql)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rbac_log_deny(
  _acao      public.audit_action,
  _code      text,
  _rota      text,
  _empresa   uuid,
  _projeto   uuid,
  _corr      uuid,
  _obs       text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.log_audit_event(
      'rbac',
      _acao,
      'RBAC',
      NULL,
      _empresa,
      _projeto,
      NULL,
      jsonb_build_object(
        'permission_code', _code,
        'correlation_id',  _corr,
        'observacoes',     _obs
      ),
      false,
      _obs,
      'server',
      NULL,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    -- auditoria não pode quebrar o fluxo de negar
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.rbac_log_deny(public.audit_action, text, text, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rbac_log_deny(public.audit_action, text, text, uuid, uuid, uuid, text) TO authenticated, service_role;

-- ============================================================
-- require_permission — porta única de autorização.
-- Levanta exceções codificadas quando nega:
--   PERMISSION_DENIED  → SQLSTATE '42501'
--   AUTH_REQUIRED      → SQLSTATE '28000'
--   COMPANY_SCOPE_DENIED, PROJECT_SCOPE_DENIED,
--   COLLABORATOR_SCOPE_DENIED → SQLSTATE '42501'
-- A mensagem SEMPRE começa com "<CODE>:" para o client parsear.
-- ============================================================
CREATE OR REPLACE FUNCTION public.require_permission(
  _code            text,
  _rota            text        DEFAULT NULL,
  _empresa_id      uuid        DEFAULT NULL,
  _projeto_id      uuid        DEFAULT NULL,
  _colaborador_id  uuid        DEFAULT NULL,
  _correlation_id  uuid        DEFAULT NULL,
  _observacoes     text        DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_corr      uuid := COALESCE(_correlation_id, gen_random_uuid());
  v_projeto   uuid := _projeto_id;
  v_empresa   uuid := _empresa_id;
  v_is_super  boolean;
BEGIN
  ---------------- 1. autenticação
  IF v_uid IS NULL THEN
    PERFORM public.rbac_log_deny(
      'PERMISSAO_NEGADA', _code, _rota, v_empresa, v_projeto, v_corr,
      'AUTH_REQUIRED'
    );
    RAISE EXCEPTION 'AUTH_REQUIRED: autenticação obrigatória'
      USING ERRCODE = '28000', HINT = v_corr::text;
  END IF;

  ---------------- 2. permissão granular
  IF NOT public.has_permission(v_uid, _code) THEN
    PERFORM public.rbac_log_deny(
      'PERMISSAO_NEGADA', _code, _rota, v_empresa, v_projeto, v_corr,
      _observacoes
    );
    RAISE EXCEPTION 'PERMISSION_DENIED: permissão % negada', _code
      USING ERRCODE = '42501', HINT = v_corr::text;
  END IF;

  v_is_super := public.has_role(v_uid, 'super_admin');

  ---------------- 3. resolver colaborador → projeto/empresa
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

    -- se caller enviou projeto_id, precisa bater com o do colaborador
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

  ---------------- 4. escopo de projeto
  IF v_projeto IS NOT NULL AND NOT v_is_super THEN
    -- RH/Compliance têm escopo global (mesmas regras das policies existentes)
    IF NOT (
      public.has_role(v_uid, 'rh') OR
      public.has_role(v_uid, 'compliance') OR
      public.user_has_projeto(v_uid, v_projeto)
    ) THEN
      PERFORM public.rbac_log_deny(
        'ESCOPO_PROJETO_NEGADO', _code, _rota, v_empresa, v_projeto, v_corr,
        _observacoes
      );
      RAISE EXCEPTION 'PROJECT_SCOPE_DENIED: projeto fora do seu escopo'
        USING ERRCODE = '42501', HINT = v_corr::text;
    END IF;
  END IF;

  ---------------- 5. escopo de empresa (só quando informado sem projeto)
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
    'permission_code', _code,
    'empresa_id', v_empresa,
    'projeto_id', v_projeto
  );
END;
$$;

REVOKE ALL ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) IS
  'RBAC Fase 3 — valida auth + permissão granular + escopos (empresa/projeto/colaborador). Registra em auditoria quando nega. Mensagens sempre no formato "CODE: descrição".';
