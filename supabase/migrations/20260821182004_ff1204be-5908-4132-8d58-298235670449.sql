
CREATE OR REPLACE FUNCTION public.reatribuir_processamento_ausencia(_ausencia_id uuid, _responsavel_anterior_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_status_atual ausencia_status_processamento;
    v_responsavel_atual uuid;
    v_user_nome text;
    v_user_id uuid := auth.uid();
BEGIN
    -- 1. Validação de Papel (RH, Compliance ou Super Admin)
    -- Usando a tabela diretamente para evitar problemas de contexto do auth.uid() em chamadas diretas de ferramentas
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = v_user_id 
        AND role IN ('super_admin', 'rh', 'compliance')
    ) THEN
        RAISE EXCEPTION 'Acesso negado. Apenas usuários administrativos podem reatribuir registros.';
    END IF;

    -- 2. Carregar estado atual com trava
    SELECT status_processamento, responsavel_processamento_id
    INTO v_status_atual, v_responsavel_atual
    FROM public.ausencias
    WHERE id = _ausencia_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registro não encontrado.';
    END IF;

    -- 3. Regras de Transição e Concorrência
    IF v_status_atual = 'PROCESSADO' THEN
        RAISE EXCEPTION 'Este registro já foi concluído e não pode ser reatribuído.';
    END IF;

    IF v_status_atual <> 'EM_PROCESSAMENTO' OR v_responsavel_atual IS NULL THEN
        RAISE EXCEPTION 'A reatribuição só é permitida para registros já em processamento.';
    END IF;

    -- Proteção contra corrida (Race Condition)
    IF v_responsavel_atual <> _responsavel_anterior_id THEN
        RAISE EXCEPTION 'O responsável deste processamento foi alterado. Atualize a tela e tente novamente.';
    END IF;

    -- 4. Buscar nome do novo responsável
    SELECT nome INTO v_user_nome FROM public.profiles WHERE id = v_user_id;

    -- 5. Atualizar Registro (Preservando processamento_iniciado_em)
    UPDATE public.ausencias
    SET
        responsavel_processamento_id = v_user_id,
        responsavel_processamento_nome = v_user_nome,
        updated_at = now()
    WHERE id = _ausencia_id;

    -- 6. Auditoria Forense
    PERFORM public.log_audit_event(
        _modulo := 'ausencias',
        _acao := 'PROCESSAMENTO_REATRIBUIDO',
        _entidade := 'Ausência',
        _registro_id := _ausencia_id,
        _antes := jsonb_build_object('responsavel_id', v_responsavel_atual),
        _depois := jsonb_build_object('responsavel_id', v_user_id),
        _observacoes := 'Reatribuição de processamento de ' || COALESCE((SELECT nome FROM profiles WHERE id = v_responsavel_atual), 'AUTOMAÇÃO') || ' para ' || v_user_nome,
        _sucesso := true
    );

    RETURN json_build_object('success', true, 'novo_responsavel_nome', v_user_nome);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reatribuir_processamento_ausencia(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reatribuir_processamento_ausencia(uuid, uuid) TO service_role;
