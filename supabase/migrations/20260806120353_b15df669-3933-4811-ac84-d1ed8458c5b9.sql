-- Correção definitiva do papel administrativo na Central de Processamento
-- O papel 'admin' não existe no enum app_role, o correto é 'super_admin'.

-- 1. Corrigir iniciar_processamento_ausencia
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
    -- Validação de Papel (RH, Compliance ou Super Admin) via has_role
    IF NOT (public.has_role(v_user_id, 'super_admin') OR public.has_role(v_user_id, 'rh') OR public.has_role(v_user_id, 'compliance')) THEN
        RAISE EXCEPTION 'Acesso negado. Papel administrativo requerido.';
    END IF;

    -- Carregar estado atual com trava de linha
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

    -- Se já tem responsável, só o super_admin ou o próprio responsável pode continuar/mudar
    IF v_responsavel_atual IS NOT NULL AND v_responsavel_atual <> v_user_id AND NOT public.has_role(v_user_id, 'super_admin') THEN
        RAISE EXCEPTION 'Este registro já está sendo processado por outro usuário.';
    END IF;

    -- Buscar nome do usuário para denormalização
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

-- 2. Corrigir concluir_processamento_ausencia
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
    -- Validação de Papel (RH, Compliance ou Super Admin)
    IF NOT (public.has_role(v_user_id, 'super_admin') OR public.has_role(v_user_id, 'rh') OR public.has_role(v_user_id, 'compliance')) THEN
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

-- 3. Corrigir a política RLS que citava 'admin' (Migration 20260804181315)
DROP POLICY IF EXISTS "Acesso Central Processamento (RH/Compliance/Admin)" ON public.ausencias;
CREATE POLICY "Acesso Central Processamento (RH/Compliance/SuperAdmin)"
ON public.ausencias
FOR ALL
TO authenticated
USING (
    public.has_role(auth.uid(), 'super_admin') OR 
    public.has_role(auth.uid(), 'rh') OR 
    public.has_role(auth.uid(), 'compliance')
);

-- 4. Revogar e garantir execução (Hardening)
REVOKE ALL ON FUNCTION public.iniciar_processamento_ausencia(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iniciar_processamento_ausencia(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.concluir_processamento_ausencia(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concluir_processamento_ausencia(uuid, text) TO authenticated;