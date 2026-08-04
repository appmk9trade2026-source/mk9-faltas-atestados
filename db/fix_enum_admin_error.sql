-- CRM MK9 — CORREÇÃO CRÍTICA DO ENUM "ADMIN" E DETALHE DA AUSÊNCIA
--
-- OBJETIVO: 
-- 1. Auditar e corrigir RPCs que referenciam o papel inexistente "admin".
-- 2. Garantir que a autorização use papéis reais do enum app_role (super_admin, rh, compliance).

-- FASE 1: Auditar e corrigir as RPCs de processamento

CREATE OR REPLACE FUNCTION public.iniciar_processamento_ausencia(_ausencia_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _user_id uuid := auth.uid();
    _pode_processar boolean;
BEGIN
    -- Validação de Papel: Apenas super_admin, rh e compliance podem iniciar o processamento
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = _user_id 
        AND role IN ('super_admin', 'rh', 'compliance')
    ) INTO _pode_processar;

    IF NOT _pode_processar THEN
        RAISE EXCEPTION 'Acesso negado. Você não possui permissão para iniciar o processamento administrativo.';
    END IF;

    -- Verificar se a ausência existe e está aguardando
    -- Implementar trava de concorrência com FOR UPDATE
    IF NOT EXISTS (
        SELECT 1 FROM public.ausencias 
        WHERE id = _ausencia_id 
        AND status_processamento = 'AGUARDANDO'
        FOR UPDATE SKIP LOCKED
    ) THEN
        RETURN json_build_object(
            'success', false, 
            'status', 'O registro já está sendo processado por outro usuário ou já foi concluído.'
        );
    END IF;

    -- Iniciar processamento
    UPDATE public.ausencias
    SET 
        status_processamento = 'EM_PROCESSAMENTO',
        responsavel_processamento_id = _user_id,
        responsavel_processamento_nome = (SELECT nome_completo FROM public.profiles WHERE id = _user_id),
        processamento_iniciado_em = now()
    WHERE id = _ausencia_id;

    -- Auditoria
    PERFORM public.log_audit_event(
        'ausencias',
        'AUSENCIA_STATUS_ALTERADO',
        'Ausência',
        _ausencia_id,
        NULL, -- empresa_id (opcional aqui)
        NULL, -- projeto_id (opcional aqui)
        jsonb_build_object('status_processamento', 'AGUARDANDO'),
        jsonb_build_object('status_processamento', 'EM_PROCESSAMENTO', 'responsavel_id', _user_id),
        'Processamento administrativo iniciado',
        'server'
    );

    RETURN json_build_object('success', true, 'status', 'EM_PROCESSAMENTO');
END;
$$;

CREATE OR REPLACE FUNCTION public.concluir_processamento_ausencia(_ausencia_id uuid, _observacao text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _user_id uuid := auth.uid();
    _pode_processar boolean;
    _responsavel_atual uuid;
BEGIN
    -- Validação de Papel
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = _user_id 
        AND role IN ('super_admin', 'rh', 'compliance')
    ) INTO _pode_processar;

    IF NOT _pode_processar THEN
        RAISE EXCEPTION 'Acesso negado. Você não possui permissão para concluir o processamento administrativo.';
    END IF;

    -- Verificar se o usuário é o responsável pelo processamento
    SELECT responsavel_processamento_id INTO _responsavel_atual
    FROM public.ausencias WHERE id = _ausencia_id;

    IF _responsavel_atual IS DISTINCT FROM _user_id AND (SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')) THEN
         RAISE EXCEPTION 'Apenas o responsável pelo processamento ou um Super Admin pode concluir este registro.';
    END IF;

    -- Concluir processamento
    UPDATE public.ausencias
    SET 
        status_processamento = 'PROCESSADO',
        processamento_concluido_em = now(),
        processamento_observacao = _observacao
    WHERE id = _ausencia_id;

    -- Auditoria
    PERFORM public.log_audit_event(
        'ausencias',
        'AUSENCIA_STATUS_ALTERADO',
        'Ausência',
        _ausencia_id,
        NULL,
        NULL,
        jsonb_build_object('status_processamento', 'EM_PROCESSAMENTO'),
        jsonb_build_object('status_processamento', 'PROCESSADO', 'observacao', _observacao),
        'Processamento administrativo concluído',
        'server'
    );

    RETURN json_build_object('success', true, 'status', 'PROCESSADO');
END;
$$;

-- FASE 2: Revogar permissão de EXECUTE de PUBLIC
REVOKE EXECUTE ON FUNCTION public.iniciar_processamento_ausencia(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.concluir_processamento_ausencia(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iniciar_processamento_ausencia(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.concluir_processamento_ausencia(uuid, text) TO authenticated;

-- FASE 3: KPIs da Central com segurança aprimorada
CREATE OR REPLACE FUNCTION public.get_processamento_kpis()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _backlog int;
    _em_processamento int;
    _processados_hoje int;
    _fora_sla int;
BEGIN
    -- Contagem de Backlog (Aguardando)
    SELECT count(*) INTO _backlog FROM public.ausencias WHERE status_processamento = 'AGUARDANDO';
    
    -- Contagem de Em Processamento
    SELECT count(*) INTO _em_processamento FROM public.ausencias WHERE status_processamento = 'EM_PROCESSAMENTO';
    
    -- Contagem de Processados Hoje
    SELECT count(*) INTO _processados_hoje FROM public.ausencias 
    WHERE status_processamento = 'PROCESSADO' 
    AND processamento_concluido_em >= CURRENT_DATE;
    
    -- Contagem Fora do SLA (Mais de 4 dias aguardando)
    SELECT count(*) INTO _fora_sla FROM public.ausencias 
    WHERE status_processamento = 'AGUARDANDO' 
    AND registrado_em < (now() - interval '4 days');

    RETURN json_build_object(
        'backlog', _backlog,
        'em_processamento', _em_processamento,
        'processados_hoje', _processados_hoje,
        'fora_sla', _fora_sla
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_processamento_kpis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_processamento_kpis() TO authenticated;
