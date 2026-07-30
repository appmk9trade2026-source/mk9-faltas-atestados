-- =====================================================================
-- SIGEC — Correção cirúrgica do escopo de projetos no fluxo MANUAL de ausências
-- Arquivo idempotente. Executar manualmente no SQL Editor do projeto oficial.
--
-- Critério canônico (único) para o fluxo manual:
--   projeto no escopo  =  vínculo direto em public.usuario_projetos
--                         OU vínculo legítimo via equipe (função oficial do papel)
--
-- Nenhuma policy ampla é criada. RLS permanece ativo. service_role não é usado.
-- Nenhuma tabela, coluna, enum ou dado é alterado.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Predicado canônico centralizado (fail-closed)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_pode_projeto_escopo_manual(
  _user_id uuid,
  _projeto_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    _user_id IS NOT NULL
    AND _projeto_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projetos p
       WHERE p.id = _projeto_id AND p.ativo = true
    )
    AND (
      public.user_has_projeto(_user_id, _projeto_id)
      OR (
        public.has_role(_user_id, 'supervisor'::app_role)
        AND public.supervisor_has_projeto_via_equipe(_user_id, _projeto_id)
      )
      OR (
        public.has_role(_user_id, 'coordenador'::app_role)
        AND public.coordenador_has_projeto_via_equipe(_user_id, _projeto_id)
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.user_pode_projeto_escopo_manual(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_pode_projeto_escopo_manual(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_pode_projeto_escopo_manual(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) Policy existente: criação manual de colaborador pelo SUPERVISOR
--    (substituída, não duplicada — mesmas condições, só o escopo muda)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS colaboradores_supervisor_manual_insert ON public.colaboradores;
CREATE POLICY colaboradores_supervisor_manual_insert
  ON public.colaboradores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'supervisor'::app_role)
    AND origem = 'MANUAL'
    AND ativo = true
    AND supervisor_usuario_id = auth.uid()
    AND projeto_id IS NOT NULL
    AND public.user_pode_projeto_escopo_manual(auth.uid(), projeto_id)
    AND EXISTS (
      SELECT 1 FROM public.projetos p
       WHERE p.id = colaboradores.projeto_id
         AND p.empresa_id = colaboradores.empresa_id
    )
  );

-- ---------------------------------------------------------------------
-- 3) Policy existente: criação manual de colaborador pelo COORDENADOR
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS colaboradores_coordenador_manual_insert ON public.colaboradores;
CREATE POLICY colaboradores_coordenador_manual_insert
  ON public.colaboradores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'coordenador'::app_role)
    AND origem = 'MANUAL'
    AND ativo = true
    AND supervisor_usuario_id IS NOT NULL
    AND projeto_id IS NOT NULL
    AND public.user_pode_projeto_escopo_manual(auth.uid(), projeto_id)
    AND (
      supervisor_usuario_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles pf
         WHERE pf.id = colaboradores.supervisor_usuario_id
           AND pf.coordenador_usuario_id = auth.uid()
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.projetos p
       WHERE p.id = colaboradores.projeto_id
         AND p.empresa_id = colaboradores.empresa_id
    )
  );

-- ---------------------------------------------------------------------
-- 4) Policy existente de INSERT manual em public.ausencias
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS ausencias_manual_autor_insert ON public.ausencias;
CREATE POLICY ausencias_manual_autor_insert
  ON public.ausencias
  FOR INSERT
  TO authenticated
  WITH CHECK (
    origem_registro = 'MANUAL'
    AND registrado_por = auth.uid()
    AND projeto_id IS NOT NULL
    AND public.user_pode_projeto_escopo_manual(auth.uid(), projeto_id)
    AND (
      public.has_role(auth.uid(), 'supervisor'::app_role)
      OR public.has_role(auth.uid(), 'coordenador'::app_role)
    )
  );

-- ---------------------------------------------------------------------
-- 5) Trigger de escopo do supervisor em ausências (mesmo critério)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ausencia_supervisor_escopo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_supervisor boolean;
  v_is_priv boolean;
  v_colab_projeto uuid;
  v_colab_empresa uuid;
  v_colab_sup uuid;
  v_manual boolean := (NEW.origem_registro = 'MANUAL');
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_supervisor := public.has_role(v_uid, 'supervisor'::app_role);
  v_is_priv := public.has_role(v_uid, 'super_admin'::app_role)
            OR public.has_role(v_uid, 'rh'::app_role);

  IF NEW.registrado_por IS NULL THEN
    NEW.registrado_por := v_uid;
  END IF;

  IF v_is_supervisor AND NOT v_is_priv THEN
    IF NEW.registrado_por <> v_uid THEN
      INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, sucesso, origem, usuario_id, observacoes)
      VALUES ('ausencias','PERMISSAO_NEGADA','ausencia', NULL, false, 'trigger', v_uid,
              'Supervisor tentou definir registrado_por diferente do próprio usuário.');
      RAISE EXCEPTION 'Operação não permitida: responsável inválido.' USING ERRCODE = '42501';
    END IF;

    IF v_manual THEN
      -- Escopo canônico: vínculo direto OU vínculo legítimo via equipe.
      IF NOT public.user_pode_projeto_escopo_manual(v_uid, NEW.projeto_id) THEN
        INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, sucesso, origem, usuario_id, observacoes)
        VALUES ('ausencias','AUSENCIA_TENTATIVA_FORA_DO_ESCOPO','projeto', NEW.projeto_id, false, 'trigger', v_uid,
                'Lançamento manual em projeto fora do escopo do supervisor.');
        RAISE EXCEPTION 'Projeto fora do seu escopo.' USING ERRCODE = '42501';
      END IF;

      INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, sucesso, origem, usuario_id, observacoes)
      VALUES ('ausencias','AUSENCIA_CRIADA_POR_SUPERVISOR','ausencia', NEW.id, true, 'trigger', v_uid,
              'Ausência MANUAL criada por supervisor no projeto permitido. Motivo: ' || coalesce(NEW.manual_motivo,'-'));
      RETURN NEW;
    END IF;

    -- Colaborador precisa estar diretamente vinculado ao supervisor.
    SELECT projeto_id, empresa_id, supervisor_usuario_id
      INTO v_colab_projeto, v_colab_empresa, v_colab_sup
    FROM public.colaboradores WHERE id = NEW.colaborador_id;

    IF v_colab_sup IS NULL OR v_colab_sup <> v_uid THEN
      INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, sucesso, origem, usuario_id, observacoes)
      VALUES ('ausencias','AUSENCIA_TENTATIVA_FORA_DO_ESCOPO','colaborador', NEW.colaborador_id, false, 'trigger', v_uid,
              'Colaborador não está vinculado ao supervisor autenticado.');
      RAISE EXCEPTION 'Colaborador não está vinculado a você.' USING ERRCODE = '42501';
    END IF;

    IF NEW.projeto_id IS NOT NULL AND v_colab_projeto IS NOT NULL AND v_colab_projeto <> NEW.projeto_id THEN
      RAISE EXCEPTION 'Colaborador não pertence ao projeto informado.' USING ERRCODE = '42501';
    END IF;
    IF NEW.empresa_id IS NOT NULL AND v_colab_empresa IS NOT NULL AND v_colab_empresa <> NEW.empresa_id THEN
      RAISE EXCEPTION 'Colaborador não pertence à empresa informada.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, sucesso, origem, usuario_id, observacoes)
    VALUES ('ausencias','AUSENCIA_CRIADA_POR_SUPERVISOR','ausencia', NEW.id, true, 'trigger', v_uid,
            'Ausência criada por supervisor no escopo direto permitido.');
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 6) require_permission — apenas o passo 4 (escopo de projeto) passa a
--    aceitar o mesmo critério canônico. Demais regras inalteradas.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.require_permission(
  _code text,
  _rota text DEFAULT NULL::text,
  _empresa_id uuid DEFAULT NULL::uuid,
  _projeto_id uuid DEFAULT NULL::uuid,
  _colaborador_id uuid DEFAULT NULL::uuid,
  _correlation_id uuid DEFAULT NULL::uuid,
  _observacoes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  ---------------- 4. escopo de projeto (critério canônico)
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
    'empresa_id', v_empresa,
    'projeto_id', v_projeto
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 7) RPC do fluxo manual — sem terceira regra: valida o mesmo predicado
--    antes de inserir (fail-closed e mensagem sem detalhes internos).
--    Mantida como SECURITY INVOKER: o RLS continua sendo a proteção real.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_ausencia_com_colaborador_manual(
  _colaborador jsonb,
  _ausencia jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa uuid := (_colaborador->>'empresa_id')::uuid;
  v_projeto uuid := (_colaborador->>'projeto_id')::uuid;
  v_matricula text := normalize_matricula(_colaborador->>'matricula');
  v_nome text := nullif(btrim(_colaborador->>'nome_completo'), '');
  v_sup_usuario uuid := nullif(_colaborador->>'supervisor_usuario_id','')::uuid;
  v_sup_email text := lower(nullif(btrim(_colaborador->>'supervisor_email'), ''));
  v_colab_id uuid;
  v_criado boolean := false;
  v_a public.ausencias%ROWTYPE;
  v_new_id uuid;
  v_protocolo text;
  v_uid uuid := auth.uid();
  v_is_supervisor boolean;
  v_is_coordenador boolean;
  v_is_priv boolean;
  v_projeto_empresa uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_empresa IS NULL OR v_projeto IS NULL OR coalesce(v_matricula,'') = '' OR v_nome IS NULL THEN
    RAISE EXCEPTION 'dados obrigatórios ausentes para o colaborador manual';
  END IF;

  v_is_supervisor := public.has_role(v_uid, 'supervisor'::app_role);
  v_is_coordenador := public.has_role(v_uid, 'coordenador'::app_role);
  v_is_priv := public.has_role(v_uid, 'super_admin'::app_role)
            OR public.has_role(v_uid, 'rh'::app_role);

  -- Empresa deve ser coerente com o projeto informado (evita cross-tenant).
  SELECT p.empresa_id INTO v_projeto_empresa
    FROM public.projetos p WHERE p.id = v_projeto AND p.ativo = true;
  IF v_projeto_empresa IS NULL OR v_projeto_empresa <> v_empresa THEN
    RAISE EXCEPTION 'Projeto não pertence à empresa informada.' USING ERRCODE = '42501';
  END IF;

  -- Escopo canônico para papéis não privilegiados (mesmo predicado do RLS).
  IF NOT v_is_priv AND (v_is_supervisor OR v_is_coordenador) THEN
    IF NOT public.user_pode_projeto_escopo_manual(v_uid, v_projeto) THEN
      RAISE EXCEPTION 'Projeto fora do seu escopo.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Chave canônica de identidade: (empresa_id, matricula normalizada). Nunca o nome.
  SELECT id INTO v_colab_id
  FROM public.colaboradores
  WHERE empresa_id = v_empresa AND normalize_matricula(matricula) = v_matricula
  LIMIT 1;

  -- Resolve o supervisor pela chave oficial (e-mail -> profiles) quando não informado.
  IF v_colab_id IS NULL AND v_sup_usuario IS NULL AND v_sup_email IS NOT NULL THEN
    BEGIN
      v_sup_usuario := public.resolve_supervisor_usuario_id(v_sup_email);
    EXCEPTION WHEN OTHERS THEN
      v_sup_usuario := NULL;
    END;
  END IF;

  -- Supervisor não privilegiado só pode criar colaborador vinculado a si mesmo.
  IF v_is_supervisor AND NOT v_is_priv AND NOT v_is_coordenador THEN
    v_sup_usuario := v_uid;
  ELSIF v_colab_id IS NULL AND v_sup_usuario IS NULL AND v_is_coordenador AND NOT v_is_priv THEN
    v_sup_usuario := v_uid;
  END IF;

  IF v_colab_id IS NULL THEN
    BEGIN
      INSERT INTO public.colaboradores (
        empresa_id, projeto_id, matricula, nome_completo, telefone, whatsapp, email,
        supervisor_nome, supervisor_telefone, supervisor_email, supervisor_usuario_id, ativo, origem
      ) VALUES (
        v_empresa, v_projeto, v_matricula, v_nome,
        nullif(_colaborador->>'telefone',''),
        nullif(_colaborador->>'whatsapp',''),
        nullif(_colaborador->>'email',''),
        nullif(_colaborador->>'supervisor_nome',''),
        nullif(_colaborador->>'supervisor_telefone',''),
        v_sup_email,
        v_sup_usuario,
        true, 'MANUAL'
      )
      RETURNING id INTO v_colab_id;
      v_criado := true;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_colab_id
      FROM public.colaboradores
      WHERE empresa_id = v_empresa AND normalize_matricula(matricula) = v_matricula
      LIMIT 1;
      v_criado := false;
    END;
  END IF;

  IF v_colab_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível criar ou localizar o colaborador';
  END IF;

  v_a := jsonb_populate_record(NULL::public.ausencias, _ausencia);

  INSERT INTO public.ausencias (
    empresa_id, projeto_id, colaborador_id, origem_registro,
    manual_motivo, manual_motivo_detalhe, manual_nome, manual_matricula,
    manual_telefone, manual_whatsapp, manual_email,
    manual_supervisor_nome, manual_supervisor_telefone,
    manual_registrado_por, manual_registrado_em, registrado_por,
    tipo, tipo_detalhe, dias_label, tipo_ausencia_id, opcao_periodo_id,
    motivo, data_inicio, data_fim, localidade, loja_codigo_nome, cid,
    acidente_trabalho_trajeto, arquivo_url, arquivo_nome, arquivo_mime,
    arquivo_tamanho, arquivo_criado_por, arquivo_criado_em,
    acidente_data, acidente_hora, acidente_local, acidente_descricao,
    acidente_atendimento_medico, acidente_houve_afastamento,
    acidente_dias_afastamento_inicial, acidente_cat_emitida, acidente_observacoes
  ) VALUES (
    v_empresa, v_projeto, v_colab_id, 'MANUAL',
    v_a.manual_motivo, v_a.manual_motivo_detalhe, v_a.manual_nome, v_a.manual_matricula,
    v_a.manual_telefone, v_a.manual_whatsapp, v_a.manual_email,
    v_a.manual_supervisor_nome, v_a.manual_supervisor_telefone,
    v_uid, now(), v_uid,
    v_a.tipo, v_a.tipo_detalhe, v_a.dias_label, v_a.tipo_ausencia_id, v_a.opcao_periodo_id,
    v_a.motivo, v_a.data_inicio, v_a.data_fim, v_a.localidade, v_a.loja_codigo_nome, v_a.cid,
    coalesce(v_a.acidente_trabalho_trajeto,false), v_a.arquivo_url, v_a.arquivo_nome, v_a.arquivo_mime,
    v_a.arquivo_tamanho, v_a.arquivo_criado_por, v_a.arquivo_criado_em,
    v_a.acidente_data, v_a.acidente_hora, v_a.acidente_local, v_a.acidente_descricao,
    v_a.acidente_atendimento_medico, v_a.acidente_houve_afastamento,
    v_a.acidente_dias_afastamento_inicial, v_a.acidente_cat_emitida, v_a.acidente_observacoes
  )
  RETURNING id, protocolo INTO v_new_id, v_protocolo;

  RETURN jsonb_build_object(
    'colaborador_id', v_colab_id,
    'colaborador_criado', v_criado,
    'ausencia_id', v_new_id,
    'protocolo', v_protocolo
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_ausencia_com_colaborador_manual(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_ausencia_com_colaborador_manual(jsonb, jsonb) TO authenticated;

COMMIT;

-- =====================================================================
-- VALIDAÇÃO MANUAL (executar autenticado como cada perfil)
--
-- A) vínculo direto:      SELECT public.user_pode_projeto_escopo_manual(auth.uid(), '<projeto>') ; -- true
-- B) vínculo via equipe:  idem                                                                    ; -- true
-- C) fora do escopo:      idem                                                                    ; -- false → INSERT bloqueado
-- D) falsificação:        INSERT com supervisor_usuario_id <> auth.uid()                          ; -- bloqueado
-- E) empresa divergente:  empresa_id <> projeto.empresa_id                                        ; -- bloqueado
-- F) admin/rh:            policies próprias inalteradas                                           ; -- comportamento preservado
-- =====================================================================
