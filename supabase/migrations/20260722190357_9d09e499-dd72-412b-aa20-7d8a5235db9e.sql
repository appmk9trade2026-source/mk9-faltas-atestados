
-- =====================================================================
-- FASE 1 — Escopo global direto por Supervisor (backend)
-- Regra oficial: colaboradores.supervisor_usuario_id = auth.uid()
-- Fail-closed: colaboradores sem supervisor_usuario_id não aparecem
-- para nenhum supervisor.
-- =====================================================================

-- ---------- AUSENCIAS ----------
DROP POLICY IF EXISTS ausencias_supervisor_scoped_select ON public.ausencias;
DROP POLICY IF EXISTS ausencias_supervisor_scoped_insert ON public.ausencias;

CREATE POLICY ausencias_supervisor_direct_select
  ON public.ausencias
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.colaboradores c
      WHERE c.id = ausencias.colaborador_id
        AND c.supervisor_usuario_id = auth.uid()
    )
  );

CREATE POLICY ausencias_supervisor_direct_insert
  ON public.ausencias
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'supervisor'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.colaboradores c
      WHERE c.id = ausencias.colaborador_id
        AND c.supervisor_usuario_id = auth.uid()
    )
  );

-- ---------- COMUNICACOES ----------
DROP POLICY IF EXISTS comunicacoes_select ON public.comunicacoes;

CREATE POLICY comunicacoes_select_privileged
  ON public.comunicacoes
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'rh'::app_role)
    OR public.has_role(auth.uid(), 'compliance'::app_role)
  );

CREATE POLICY comunicacoes_select_supervisor_direct
  ON public.comunicacoes
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.colaboradores c
      WHERE c.id = comunicacoes.colaborador_id
        AND c.supervisor_usuario_id = auth.uid()
    )
  );

-- ---------- ALERTAS (via helper) ----------
CREATE OR REPLACE FUNCTION public.alerta_visivel_para(_alerta public.alertas, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(_user_id, 'super_admin'::app_role)
     OR public.has_role(_user_id, 'compliance'::app_role) THEN
    RETURN TRUE;
  END IF;

  IF public.has_role(_user_id, 'rh'::app_role)
     OR public.has_role(_user_id, 'visualizador'::app_role) THEN
    IF _alerta.empresa_id IS NULL AND _alerta.projeto_id IS NULL THEN
      RETURN TRUE;
    END IF;
    IF _alerta.empresa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.usuario_empresas ue
      WHERE ue.user_id = _user_id AND ue.empresa_id = _alerta.empresa_id
    ) THEN
      RETURN TRUE;
    END IF;
    IF _alerta.projeto_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.usuario_projetos up
      WHERE up.user_id = _user_id AND up.projeto_id = _alerta.projeto_id
    ) THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  -- SUPERVISOR: vínculo direto pelo colaborador. Alertas globais/sem
  -- colaborador não aparecem para supervisores.
  IF public.has_role(_user_id, 'supervisor'::app_role) THEN
    IF _alerta.colaborador_id IS NULL THEN
      RETURN FALSE;
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.colaboradores c
      WHERE c.id = _alerta.colaborador_id
        AND c.supervisor_usuario_id = _user_id
    );
  END IF;

  RETURN FALSE;
END;
$function$;

-- ---------- ATESTADO (storage helper) ----------
CREATE OR REPLACE FUNCTION public.atestado_path_visivel_para(_name text, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _colab_id uuid;
BEGIN
  IF _user_id IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'super_admin'::app_role)
     OR public.has_role(_user_id, 'rh'::app_role)
     OR public.has_role(_user_id, 'compliance'::app_role) THEN
    RETURN true;
  END IF;

  IF public.has_role(_user_id, 'supervisor'::app_role) THEN
    BEGIN
      _colab_id := (split_part(_name, '/', 2))::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    IF _colab_id IS NULL THEN RETURN false; END IF;

    RETURN EXISTS (
      SELECT 1 FROM public.colaboradores c
      WHERE c.id = _colab_id
        AND c.supervisor_usuario_id = _user_id
    );
  END IF;

  RETURN false;
END;
$function$;

-- ---------- TRIGGER de lançamento por supervisor ----------
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

    -- Coerência de projeto/empresa informados vs. colaborador.
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

-- ---------- WHATSAPP OUTBOX (leitura escopada para supervisor) ----------
CREATE POLICY wa_outbox_supervisor_direct_select
  ON public.whatsapp_outbox
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor'::app_role)
    AND (
      (destinatario_colaborador_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.colaboradores c
        WHERE c.id = whatsapp_outbox.destinatario_colaborador_id
          AND c.supervisor_usuario_id = auth.uid()
      ))
      OR (ausencia_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.ausencias a
        JOIN public.colaboradores c ON c.id = a.colaborador_id
        WHERE a.id = whatsapp_outbox.ausencia_id
          AND c.supervisor_usuario_id = auth.uid()
      ))
    )
  );

CREATE POLICY wa_outbox_ev_supervisor_direct_select
  ON public.whatsapp_outbox_eventos
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_outbox o
      WHERE o.id = whatsapp_outbox_eventos.outbox_id
        AND (
          (o.destinatario_colaborador_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.colaboradores c
            WHERE c.id = o.destinatario_colaborador_id
              AND c.supervisor_usuario_id = auth.uid()
          ))
          OR (o.ausencia_id IS NOT NULL AND EXISTS (
            SELECT 1
            FROM public.ausencias a
            JOIN public.colaboradores c ON c.id = a.colaborador_id
            WHERE a.id = o.ausencia_id
              AND c.supervisor_usuario_id = auth.uid()
          ))
        )
    )
  );
