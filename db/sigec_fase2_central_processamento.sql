-- FASE 2: CENTRAL DE PROCESSAMENTO INTERNO (CHARLES)
-- Hardening do fluxo administrativo sem alterar workflow operacional de campo.

-- 1. Colunas adicionais em ausencias para controle de concorrência e atribuição
ALTER TABLE public.ausencias 
ADD COLUMN IF NOT EXISTS responsavel_processamento_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS responsavel_processamento_nome text,
ADD COLUMN IF NOT EXISTS processamento_iniciado_em timestamptz,
ADD COLUMN IF NOT EXISTS processamento_concluido_em timestamptz,
ADD COLUMN IF NOT EXISTS processamento_concluido_por uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.ausencias.responsavel_processamento_id IS 'Usuário administrativo que assumiu o registro';

-- 2. Garantir permissões de SELECT e UPDATE para os papéis administrativos
GRANT SELECT, UPDATE(status_processamento, responsavel_processamento_id, responsavel_processamento_nome, processamento_iniciado_em, processamento_concluido_em, processamento_concluido_por, observacao_processamento) 
ON public.ausencias TO rh, compliance;

-- 3. Função RPC para Assumir/Iniciar Processamento com trava de concorrência
CREATE OR REPLACE FUNCTION public.iniciar_processamento_ausencia(_ausencia_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status_atual ausencia_status_processamento;
    v_responsavel_atual uuid;
    v_user_nome text;
    v_user_id uuid := auth.uid();
BEGIN
    -- Validação de Papel (RH, Compliance ou Admin)
    IF NOT (public.has_role(v_user_id, 'admin') OR public.has_role(v_user_id, 'rh') OR public.has_role(v_user_id, 'compliance')) THEN
        RAISE EXCEPTION 'Acesso negado. Papel administrativo requerido.';
    END IF;

    -- Carregar estado atual
    SELECT status_processamento, responsavel_processamento_id 
    INTO v_status_atual, v_responsavel_atual
    FROM public.ausencias 
    WHERE id = _ausencia_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registro não encontrado.';
    END IF;

    -- Trava de Concorrência
    IF v_status_atual = 'PROCESSADO' THEN
        RAISE EXCEPTION 'Este registro já foi processado.';
    END IF;

    IF v_responsavel_atual IS NOT NULL AND v_responsavel_atual <> v_user_id AND NOT public.has_role(v_user_id, 'admin') THEN
        RAISE EXCEPTION 'Este registro já está sendo processado por outro usuário.';
    END IF;

    -- Buscar nome do usuário para denormalização (performance de listagem)
    SELECT nome INTO v_user_nome FROM public.profiles WHERE id = v_user_id;

    -- Atualizar
    UPDATE public.ausencias
    SET 
        status_processamento = 'EM_PROCESSAMENTO',
        responsavel_processamento_id = v_user_id,
        responsavel_processamento_nome = v_user_nome,
        processamento_iniciado_em = now(),
        updated_at = now()
    WHERE id = _ausencia_id;

    -- Auditoria
    PERFORM public.log_audit_event(
        _modulo := 'ausencias',
        _acao := 'AUSENCIA_STATUS_ALTERADO',
        _entidade := 'Ausência',
        _registro_id := _ausencia_id,
        _observacoes := 'Início de processamento administrativo por ' || COALESCE(v_user_nome, 'usuário'),
        _sucesso := true
    );

    RETURN json_build_object('success', true, 'status', 'EM_PROCESSAMENTO');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.iniciar_processamento_ausencia(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iniciar_processamento_ausencia(uuid) TO authenticated;

-- 4. Função RPC para Concluir Processamento
CREATE OR REPLACE FUNCTION public.concluir_processamento_ausencia(_ausencia_id uuid, _observacao text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_user_nome text;
BEGIN
    -- Validação de Papel
    IF NOT (public.has_role(v_user_id, 'admin') OR public.has_role(v_user_id, 'rh') OR public.has_role(v_user_id, 'compliance')) THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    SELECT nome INTO v_user_nome FROM public.profiles WHERE id = v_user_id;

    UPDATE public.ausencias
    SET 
        status_processamento = 'PROCESSADO',
        processamento_concluido_em = now(),
        processamento_concluido_por = v_user_id,
        observacao_processamento = COALESCE(_observacao, observacao_processamento),
        updated_at = now()
    WHERE id = _ausencia_id;

    -- Auditoria
    PERFORM public.log_audit_event(
        _modulo := 'ausencias',
        _acao := 'AUSENCIA_STATUS_ALTERADO',
        _entidade := 'Ausência',
        _registro_id := _ausencia_id,
        _observacoes := 'Conclusão de processamento administrativo',
        _sucesso := true
    );

    RETURN json_build_object('success', true, 'status', 'PROCESSADO');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.concluir_processamento_ausencia(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concluir_processamento_ausencia(uuid, text) TO authenticated;

-- 5. Função para KPIs da Central (Otimizada)
CREATE OR REPLACE FUNCTION public.get_processamento_kpis()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT json_build_object(
        'backlog', (SELECT count(*) FROM public.ausencias WHERE status_processamento = 'AGUARDANDO'),
        'em_processamento', (SELECT count(*) FROM public.ausencias WHERE status_processamento = 'EM_PROCESSAMENTO'),
        'processados_hoje', (SELECT count(*) FROM public.ausencias WHERE status_processamento = 'PROCESSADO' AND processamento_concluido_em >= CURRENT_DATE),
        'fora_sla', (SELECT count(*) FROM public.ausencias WHERE status_processamento = 'AGUARDANDO' AND (CURRENT_DATE - registrado_em::date) >= 4)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_processamento_kpis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_processamento_kpis() TO authenticated;
