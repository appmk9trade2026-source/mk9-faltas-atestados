-- 1. Function to detect conflicts (overlaps)
CREATE OR REPLACE FUNCTION public.detectar_conflitos_ausencia(
    _colaborador_id UUID,
    _data_inicio DATE,
    _data_fim DATE,
    _tipo tipo_ausencia,
    _origem_registro TEXT DEFAULT 'AUTOMATICO',
    _manual_matricula TEXT DEFAULT NULL,
    _empresa_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    tipo tipo_ausencia,
    data_inicio DATE,
    data_fim DATE,
    registrado_por UUID,
    registrado_em TIMESTAMP WITH TIME ZONE,
    protocolo TEXT,
    status status_ausencia,
    registrado_por_nome TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id, 
        a.tipo, 
        a.data_inicio, 
        a.data_fim, 
        a.registrado_por, 
        a.registrado_em, 
        a.protocolo,
        a.status,
        p.nome as registrado_por_nome
    FROM public.ausencias a
    LEFT JOIN public.profiles p ON p.id = a.registrado_por
    WHERE 
        -- Identificação do colaborador
        (
            (_origem_registro = 'AUTOMATICO' AND a.colaborador_id = _colaborador_id)
            OR 
            (_origem_registro = 'MANUAL' AND a.empresa_id = _empresa_id AND a.manual_matricula = _manual_matricula)
        )
        AND a.status NOT IN ('CANCELADO', 'SUBSTITUIDA')
        AND (
            -- Sobreposição de datas (Inclusive)
            (a.data_inicio, a.data_fim) OVERLAPS (_data_inicio, _data_fim)
            OR a.data_inicio = _data_inicio
            OR a.data_fim = _data_fim
        )
        -- Conflito entre Atestado e Falta
        AND (
            (_tipo = 'ATESTADO' AND a.tipo = 'FALTA')
            OR (_tipo = 'FALTA' AND a.tipo = 'ATESTADO')
        );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.detectar_conflitos_ausencia FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detectar_conflitos_ausencia TO authenticated;

-- 2. RPC for Atomic Substitution
CREATE OR REPLACE FUNCTION public.substituir_ausencia_conflito(
    _ausencia_id_antiga UUID,
    _dados_nova_ausencia JSONB,
    _motivo_substituicao TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _nova_ausencia_id UUID;
    _status_processamento_antigo ausencia_status_processamento;
    _responsavel_antigo UUID;
    _responsavel_antigo_nome TEXT;
    _obs_processamento_antigo TEXT;
    _iniciado_em_antigo TIMESTAMP WITH TIME ZONE;
BEGIN
    -- 1. Capturar estado da antiga para migrar processamento se necessário
    SELECT 
        status_processamento, 
        responsavel_processamento_id, 
        responsavel_processamento_nome,
        observacao_processamento,
        processamento_iniciado_em
    INTO 
        _status_processamento_antigo, 
        _responsavel_antigo, 
        _responsavel_antigo_nome,
        _obs_processamento_antigo,
        _iniciado_em_antigo
    FROM public.ausencias
    WHERE id = _ausencia_id_antiga;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ausência original não encontrada';
    END IF;

    -- 2. Inserir a nova ausência
    INSERT INTO public.ausencias (
        empresa_id, 
        projeto_id, 
        colaborador_id, 
        tipo, 
        data_inicio, 
        data_fim, 
        dias, 
        possui_anexo, 
        arquivo_url, 
        arquivo_nome, 
        arquivo_mime, 
        arquivo_tamanho,
        status, 
        observacoes, 
        registrado_por, 
        origem_registro, 
        manual_nome, 
        manual_matricula, 
        manual_motivo, 
        cid, 
        protocolo,
        tipo_ausencia_id,
        opcao_periodo_id
    )
    VALUES (
        (_dados_nova_ausencia->>'empresa_id')::UUID,
        (_dados_nova_ausencia->>'projeto_id')::UUID,
        (_dados_nova_ausencia->>'colaborador_id')::UUID,
        (_dados_nova_ausencia->>'tipo')::tipo_ausencia,
        (_dados_nova_ausencia->>'data_inicio')::DATE,
        (_dados_nova_ausencia->>'data_fim')::DATE,
        (_dados_nova_ausencia->>'dias')::INTEGER,
        COALESCE((_dados_nova_ausencia->>'possui_anexo')::BOOLEAN, FALSE),
        _dados_nova_ausencia->>'arquivo_url',
        _dados_nova_ausencia->>'arquivo_nome',
        _dados_nova_ausencia->>'arquivo_mime',
        (_dados_nova_ausencia->>'arquivo_tamanho')::INTEGER,
        'LANCADO',
        _dados_nova_ausencia->>'observacoes',
        auth.uid(),
        COALESCE(_dados_nova_ausencia->>'origem_registro', 'AUTOMATICO'),
        _dados_nova_ausencia->>'manual_nome',
        _dados_nova_ausencia->>'manual_matricula',
        _dados_nova_ausencia->>'manual_motivo',
        _dados_nova_ausencia->>'cid',
        _dados_nova_ausencia->>'protocolo',
        (_dados_nova_ausencia->>'tipo_ausencia_id')::UUID,
        (_dados_nova_ausencia->>'opcao_periodo_id')::UUID
    )
    RETURNING id INTO _nova_ausencia_id;

    -- 3. Marcar a antiga como SUBSTITUIDA
    UPDATE public.ausencias
    SET 
        status = 'SUBSTITUIDA',
        substituida_por_ausencia_id = _nova_ausencia_id,
        substituida_em = now(),
        substituida_por_usuario_id = auth.uid(),
        motivo_substituicao = _motivo_substituicao
    WHERE id = _ausencia_id_antiga;

    -- 4. Transferir status de processamento (Etapa 9)
    IF _status_processamento_antigo != 'AGUARDANDO' THEN
        UPDATE public.ausencias
        SET 
            status_processamento = _status_processamento_antigo,
            responsavel_processamento_id = _responsavel_antigo,
            responsavel_processamento_nome = _responsavel_antigo_nome,
            processamento_iniciado_em = _iniciado_em_antigo,
            observacao_processamento = COALESCE(_obs_processamento_antigo, '') || ' [Migrado por substituição da ausência ' || _ausencia_id_antiga || ']'
        WHERE id = _nova_ausencia_id;
    END IF;

    -- 5. Registrar em Auditoria
    INSERT INTO public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        metadata
    ) VALUES (
        auth.uid(),
        'UPDATE',
        'ausencias',
        _ausencia_id_antiga,
        jsonb_build_object('status', 'LANCADO'),
        jsonb_build_object('status', 'SUBSTITUIDA', 'substituida_por', _nova_ausencia_id),
        jsonb_build_object('reason', 'CONFLITO_SUBSTITUICAO', 'motivo', _motivo_substituicao)
    );

    RETURN _nova_ausencia_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.substituir_ausencia_conflito FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.substituir_ausencia_conflito TO authenticated;

-- 3. Update BI view to exclude substituted/cancelled records by default
CREATE OR REPLACE VIEW public.bi_absenteismo_diario AS
  SELECT COALESCE(a.data_inicio, (a.created_at)::date) AS data_referencia,
     c.empresa_id,
     c.projeto_id,
     t.categoria_ausencia_id AS categoria_id,
     a.tipo_ausencia_id,
     COALESCE((a.status)::text, 'PENDENTE'::text) AS status,
     (count(*))::integer AS total_registros,
     (count(DISTINCT a.colaborador_id))::integer AS total_colaboradores_afetados,
     (COALESCE(sum(NULLIF(COALESCE(a.dias, a.quantidade_dias_calculada), 0)), (0)::bigint))::numeric AS total_dias_ausencia,
     (COALESCE(sum((NULLIF(COALESCE(a.dias, a.quantidade_dias_calculada), 0) * 8)), (0)::bigint))::numeric AS total_horas_estimadas,
     (count(*) FILTER (WHERE (cat.codigo = 'ATESTADOS'::text)))::integer AS atestados,
     (count(*) FILTER (WHERE (cat.codigo = 'FALTAS'::text)))::integer AS faltas,
     (count(*) FILTER (WHERE (cat.codigo = 'LICENCAS'::text)))::integer AS licencas,
     (count(*) FILTER (WHERE (cat.codigo = 'AFASTAMENTOS'::text)))::integer AS afastamentos,
     (count(*) FILTER (WHERE (cat.codigo = 'MEDIDAS_ADMINISTRATIVAS'::text)))::integer AS medidas_administrativas,
     (count(*) FILTER (WHERE ((cat.codigo = 'OUTROS'::text) OR (cat.codigo IS NULL))))::integer AS outros,
     (count(*) FILTER (WHERE ((COALESCE(a.dias, a.quantidade_dias_calculada) IS NULL) OR (COALESCE(a.dias, a.quantidade_dias_calculada) = 0))))::integer AS sem_duracao
    FROM (((public.ausencias a
      LEFT JOIN public.colaboradores c ON ((c.id = a.colaborador_id)))
      LEFT JOIN public.tipos_ausencia t ON ((t.id = a.tipo_ausencia_id)))
      LEFT JOIN public.categorias_ausencia cat ON ((cat.id = t.categoria_ausencia_id)))
   WHERE (COALESCE(a.data_inicio, (a.created_at)::date) IS NOT NULL)
     AND a.status NOT IN ('CANCELADO', 'SUBSTITUIDA')
   GROUP BY COALESCE(a.data_inicio, (a.created_at)::date), c.empresa_id, c.projeto_id, t.categoria_ausencia_id, a.tipo_ausencia_id, COALESCE((a.status)::text, 'PENDENTE'::text);

-- 4. New function for Conversion KPIs
CREATE OR REPLACE FUNCTION public.get_ausencia_conversoes_stats(
    _data_inicio DATE,
    _data_fim DATE,
    _empresa_id UUID DEFAULT NULL,
    _projeto_id UUID DEFAULT NULL
)
RETURNS TABLE (
    total_conversoes BIGINT,
    tempo_medio_conversao_horas DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        COUNT(*) as total_conversoes,
        AVG(EXTRACT(EPOCH FROM (substituida_em - registrado_em)) / 3600) as tempo_medio_conversao_horas
    FROM public.ausencias
    WHERE status = 'SUBSTITUIDA'
      AND substituida_em::date BETWEEN _data_inicio AND _data_fim
      AND (_empresa_id IS NULL OR empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR projeto_id = _projeto_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_ausencia_conversoes_stats TO authenticated;
