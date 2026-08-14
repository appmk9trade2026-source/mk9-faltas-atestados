DO $$
DECLARE
    r RECORD;
    v_ausencia_id UUID;
    v_total_processed INTEGER := 0;
BEGIN
    FOR r IN (
        SELECT o.id, o.colaborador_id, o.empresa_id, o.projeto_id, o.data_ocorrencia, o.supervisor_usuario_id, o.motivo
        FROM public.ocorrencias_ponto o
        WHERE o.ausencia_id IS NULL 
          AND o.protocolo IN (
            'OCP-AMBEV-20260814-000001', 'OCP-AMBEV-20260814-000003', 'OCP-AMBEV-20260814-000002',
            'OCP-AMBEV-20260813-000001', 'OCP-AMBEV-20260812-000001', 'OCP-AMBEV-20260811-000001',
            'OCP-AMBEV-20260811-000003', 'OCP-AMBEV-20260811-000002'
          )
    ) LOOP
        -- Proteção contra duplicidade
        SELECT id INTO v_ausencia_id 
        FROM public.ausencias 
        WHERE colaborador_id = r.colaborador_id 
          AND data_inicio = r.data_ocorrencia 
          AND status != 'CANCELADO'
        LIMIT 1;

        IF v_ausencia_id IS NULL THEN
            INSERT INTO public.ausencias (
                colaborador_id,
                empresa_id,
                projeto_id,
                data_inicio,
                data_fim,
                tipo,
                status,
                observacoes,
                registrado_por,
                localidade,
                loja_codigo_nome,
                acidente_trabalho_trajeto,
                motivo -- Campo obrigatório pelo trigger tg_ausencias_valida
            ) VALUES (
                r.colaborador_id,
                r.empresa_id,
                r.projeto_id,
                r.data_ocorrencia,
                r.data_ocorrencia,
                'FALTA',
                'PENDENTE',
                'Backfill Automático - Saneamento OCP AMBEV',
                r.supervisor_usuario_id,
                'Backfill Automático',
                'Backfill Automático',
                false,
                COALESCE(r.motivo, 'FALTA OPERACIONAL AMBEV')
            ) RETURNING id INTO v_ausencia_id;
        END IF;

        UPDATE public.ocorrencias_ponto 
        SET ausencia_id = v_ausencia_id 
        WHERE id = r.id;

        v_total_processed := v_total_processed + 1;
    END LOOP;
END $$;