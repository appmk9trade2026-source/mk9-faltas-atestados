
-- CRM MK9 — CORREÇÃO CIRÚRGICA FINAL: RESTAURAÇÃO DE CONTRATO DASHBOARD_METRICS
-- Objetivo: Garantir que a chave 'ultimos' seja devolvida em vez de 'ultimos_registros'.
-- Preserva: Filtro AMBEV, Segurança (search_path), e GRANTs.

DO $$
BEGIN
    -- 1. Snapshot/Recriação da função com a chave canônica 'ultimos'
    CREATE OR REPLACE FUNCTION public.dashboard_metrics(
        _inicio date, 
        _fim date, 
        _empresa_id uuid DEFAULT NULL::uuid, 
        _projeto_id uuid DEFAULT NULL::uuid, 
        _supervisor text DEFAULT NULL::text, 
        _tipo tipo_ausencia DEFAULT NULL::tipo_ausencia, 
        _status status_ausencia DEFAULT NULL::status_ausencia, 
        _categoria_id uuid DEFAULT NULL::uuid
    )
     RETURNS jsonb
     LANGUAGE plpgsql
     STABLE
     SET search_path TO 'public'
    AS $function$
    DECLARE
      v_prev_ini date; v_prev_fim date; v_dias int;
      v_result jsonb; v_kpis jsonb; v_prev jsonb;
      v_por_dia jsonb; v_por_empresa jsonb; v_por_projeto jsonb;
      v_por_tipo jsonb; v_por_status jsonb; v_top_sup jsonb; v_top_col jsonb;
      v_tempo_diario jsonb; v_heatmap jsonb; v_ultimos jsonb;
      v_por_categoria jsonb; v_por_tipo_oficial jsonb;
    BEGIN
      v_dias := (_fim - _inicio) + 1;
      v_prev_fim := _inicio - 1;
      v_prev_ini := v_prev_fim - (v_dias - 1);

      WITH base AS (
        SELECT a.*,
               c.nome_completo AS colab_nome,
               c.supervisor_nome AS sup_nome,
               e.nome AS empresa_nome,
               p.nome AS projeto_nome,
               t.id AS tipo_oficial_id,
               t.codigo AS tipo_oficial_codigo,
               t.nome AS tipo_oficial_nome,
               t.cor AS tipo_oficial_cor,
               t.categoria_ausencia_id AS categoria_id
        FROM public.ausencias a
        JOIN public.colaboradores c ON c.id = a.colaborador_id
        JOIN public.empresas e ON e.id = a.empresa_id
        JOIN public.projetos p ON p.id = a.projeto_id
        LEFT JOIN public.tipos_ausencia t ON t.id = a.tipo_ausencia_id
        WHERE a.data_inicio <= _fim AND a.data_fim >= _inicio
          AND a.status_documental = 'ATIVO'
          -- REGRA CANÔNICA FASE 4: Faltas justificadas AMBEV têm impacto operacional zero
          AND NOT (a.tipo = 'FALTA' AND COALESCE(a.status_justificativa, '') = 'JUSTIFICADA_OCORRENCIA_PONTO')
          AND (_empresa_id IS NULL OR a.empresa_id = _empresa_id)
          AND (_projeto_id IS NULL OR a.projeto_id = _projeto_id)
          AND (_supervisor IS NULL OR c.supervisor_nome ILIKE '%'||_supervisor||'%')
          AND (_tipo IS NULL OR a.tipo = _tipo)
          AND (_status IS NULL OR a.status = _status)
          AND (_categoria_id IS NULL OR t.categoria_ausencia_id = _categoria_id)
      ), filtered AS (SELECT * FROM base)
      SELECT
        jsonb_build_object(
          'total', COUNT(*),
          'pendentes', COUNT(*) FILTER (WHERE status='PENDENTE'),
          'lancadas', COUNT(*) FILTER (WHERE status='LANCADO'),
          'faltas', COUNT(*) FILTER (WHERE tipo='FALTA'),
          'atestados', COUNT(*) FILTER (WHERE tipo='ATESTADO'),
          'declaracoes', COUNT(*) FILTER (WHERE tipo='DECLARACAO'),
          'suspensoes', COUNT(*) FILTER (WHERE tipo='SUSPENSAO'),
          'acidentes_trabalho', COUNT(*) FILTER (WHERE acidente_trabalho_trajeto IS TRUE),
          'acidentes_trajeto', 0,
          'tempo_medio_lanc_h',
            COALESCE(AVG(EXTRACT(EPOCH FROM (lancado_em - registrado_em))/3600.0)
              FILTER (WHERE lancado_em IS NOT NULL), 0),
          'backlog_processamento', (
              SELECT COUNT(*)
              FROM public.ausencias
              WHERE status_processamento IN ('AGUARDANDO', 'EM_PROCESSAMENTO')
                AND status_documental = 'ATIVO'
                AND NOT (tipo = 'FALTA' AND COALESCE(status_justificativa, '') = 'JUSTIFICADA_OCORRENCIA_PONTO')
                AND (_empresa_id IS NULL OR empresa_id = _empresa_id)
                AND (_projeto_id IS NULL OR projeto_id = _projeto_id)
          ),
          'processados_hoje', (
              SELECT COUNT(*)
              FROM public.ausencias
              WHERE status_processamento = 'PROCESSADO'
                AND status_documental = 'ATIVO'
                AND NOT (tipo = 'FALTA' AND COALESCE(status_justificativa, '') = 'JUSTIFICADA_OCORRENCIA_PONTO')
                AND processamento_concluido_em::date = CURRENT_DATE
                AND (_empresa_id IS NULL OR empresa_id = _empresa_id)
                AND (_projeto_id IS NULL OR projeto_id = _projeto_id)
          ),
          'tempo_medio_processamento_h', (
              SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (processamento_concluido_em - processamento_iniciado_em))/3600.0), 0)
              FROM public.ausencias
              WHERE status_processamento = 'PROCESSADO'
                AND status_documental = 'ATIVO'
                AND NOT (tipo = 'FALTA' AND COALESCE(status_justificativa, '') = 'JUSTIFICADA_OCORRENCIA_PONTO')
                AND processamento_concluido_em::date BETWEEN _inicio AND _fim
                AND processamento_iniciado_em IS NOT NULL
                AND (_empresa_id IS NULL OR empresa_id = _empresa_id)
                AND (_projeto_id IS NULL OR projeto_id = _projeto_id)
          )
        ),
        (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.dia), '[]'::jsonb) FROM (
          SELECT data_inicio AS dia, COUNT(*) AS total,
                 COUNT(*) FILTER (WHERE status='PENDENTE') AS pendentes,
                 COUNT(*) FILTER (WHERE status='LANCADO') AS lancadas
          FROM filtered GROUP BY data_inicio
        ) t),
        (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
          SELECT empresa_nome AS empresa, COUNT(*) AS total FROM filtered GROUP BY empresa_nome
        ) t),
        (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
          SELECT projeto_nome AS projeto, COUNT(*) AS total FROM filtered GROUP BY projeto_nome
        ) t),
        (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
          SELECT tipo AS tipo, COUNT(*) AS total FROM filtered GROUP BY tipo
        ) t),
        (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
          SELECT status AS status, COUNT(*) AS total FROM filtered GROUP BY status
        ) t),
        (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
          SELECT sup_nome AS supervisor, COUNT(*) AS total FROM filtered WHERE sup_nome IS NOT NULL GROUP BY sup_nome LIMIT 10
        ) t),
        (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
          SELECT colab_nome AS colaborador, COUNT(*) AS total FROM filtered GROUP BY colab_nome LIMIT 10
        ) t),
        (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.dia), '[]'::jsonb) FROM (
          SELECT data_inicio AS dia, 
                 SUM(COALESCE(dias, 1)) AS total_dias
          FROM filtered GROUP BY data_inicio
        ) t),
        (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
          SELECT EXTRACT(DOW FROM data_inicio) AS dow,
                 EXTRACT(HOUR FROM registrado_em) AS hour,
                 COUNT(*) AS value
          FROM filtered GROUP BY dow, hour
        ) t),
        (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.registrado_em DESC), '[]'::jsonb) FROM (
          SELECT registrado_em, colab_nome, tipo, status FROM filtered LIMIT 10
        ) t),
        (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
          SELECT cat.nome AS categoria, COUNT(*) AS total 
          FROM filtered f
          JOIN public.categorias_ausencia cat ON cat.id = f.categoria_id
          GROUP BY cat.nome
        ) t),
        (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
          SELECT tipo_oficial_nome AS tipo, tipo_oficial_cor AS cor, COUNT(*) AS total FROM filtered GROUP BY tipo_oficial_nome, tipo_oficial_cor
        ) t)
      INTO v_kpis, v_por_dia, v_por_empresa, v_por_projeto, v_por_tipo, v_por_status, v_top_sup, v_top_col, v_tempo_diario, v_heatmap, v_ultimos, v_por_categoria, v_por_tipo_oficial;

      -- KPI de comparação com período anterior
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'atestados', COUNT(*) FILTER (WHERE tipo='ATESTADO'),
        'faltas', COUNT(*) FILTER (WHERE tipo='FALTA')
      ) INTO v_prev
      FROM public.ausencias a
      WHERE a.data_inicio <= v_prev_fim AND a.data_fim >= v_prev_ini
        AND a.status_documental = 'ATIVO'
        AND NOT (a.tipo = 'FALTA' AND COALESCE(a.status_justificativa, '') = 'JUSTIFICADA_OCORRENCIA_PONTO')
        AND (_empresa_id IS NULL OR a.empresa_id = _empresa_id)
        AND (_projeto_id IS NULL OR a.projeto_id = _projeto_id);

      v_result := jsonb_build_object(
        'kpis', v_kpis,
        'prev_kpis', v_prev,
        'por_dia', v_por_dia,
        'por_empresa', v_por_empresa,
        'por_projeto', v_por_projeto,
        'por_tipo', v_por_tipo,
        'por_status', v_por_status,
        'top_supervisores', v_top_sup,
        'top_colaboradores', v_top_col,
        'tempo_diario', v_tempo_diario,
        'heatmap', v_heatmap,
        'ultimos', v_ultimos, -- CONTRATO CANÔNICO RESTAURADO
        'por_categoria', v_por_categoria,
        'por_tipo_oficial', v_por_tipo_oficial
      );

      RETURN v_result;
    END;
    $function$;

    -- 2. Restauração de GRANTs (Segurança P0)
    GRANT EXECUTE ON FUNCTION public.dashboard_metrics(date, date, uuid, uuid, text, tipo_ausencia, status_ausencia, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.dashboard_metrics(date, date, uuid, uuid, text, tipo_ausencia, status_ausencia, uuid) TO service_role;
    
    -- 3. Hardening: Revogar acesso público/anon
    REVOKE EXECUTE ON FUNCTION public.dashboard_metrics(date, date, uuid, uuid, text, tipo_ausencia, status_ausencia, uuid) FROM anon, PUBLIC;
END;
$$;
