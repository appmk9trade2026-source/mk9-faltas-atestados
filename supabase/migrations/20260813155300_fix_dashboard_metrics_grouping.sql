-- CRM MK9 — CORREÇÃO DE DUPLICIDADE NO RANKING
-- Objetivo: Agrupar o ranking de supervisores pelo ID canônico (supervisor_usuario_id) em vez do nome textual.
-- Isso consolida variações como "JONAS NETO XAROPA" e "JONAS NETO FERREIRA XAROPA" em um único registro.
-- Regra: Group by supervisor_usuario_id + resolução de nome via profiles (preferencial) ou colaboradores.

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
    SELECT a.id, a.empresa_id, a.projeto_id, a.colaborador_id, a.tipo, a.status, a.data_inicio, a.data_fim, 
           a.dias, a.quantidade_dias_calculada, a.status_justificativa, a.status_documental,
           a.status_processamento, a.processamento_iniciado_em, a.processamento_concluido_em,
           a.registrado_em, a.lancado_em, a.acidente_trabalho_trajeto,
           c.nome_completo AS colab_nome,
           c.supervisor_usuario_id AS sup_id, -- Chave de identidade canônica
           c.supervisor_nome AS sup_nome_snapshot, -- Nome no momento do registro
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
      AND NOT (a.tipo = 'FALTA' AND COALESCE(a.status_justificativa, '') = 'JUSTIFICADA_OCORRENCIA_PONTO')
      AND (_empresa_id IS NULL OR a.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id = _projeto_id)
      AND (_supervisor IS NULL OR c.supervisor_nome ILIKE '%'||_supervisor||'%')
      AND (_tipo IS NULL OR a.tipo = _tipo)
      AND (_status IS NULL OR a.status = _status)
      AND (_categoria_id IS NULL OR t.categoria_ausencia_id = _categoria_id)
  ), filtered AS (SELECT * FROM base)
  SELECT
    (SELECT jsonb_build_object(
      'total', COUNT(*),
      'pendentes', COUNT(*) FILTER (WHERE f.status='PENDENTE'),
      'lancadas', COUNT(*) FILTER (WHERE f.status='LANCADO'),
      'faltas', COUNT(*) FILTER (WHERE f.tipo='FALTA'),
      'atestados', COUNT(*) FILTER (WHERE f.tipo='ATESTADO'),
      'declaracoes', COUNT(*) FILTER (WHERE f.tipo='DECLARACAO'),
      'suspensoes', COUNT(*) FILTER (WHERE f.tipo='SUSPENSAO'),
      'acidentes_trabalho', COUNT(*) FILTER (WHERE f.acidente_trabalho_trajeto IS TRUE),
      'acidentes_trajeto', 0,
      'tempo_medio_lanc_h',
        COALESCE(AVG(EXTRACT(EPOCH FROM (f.lancado_em - f.registrado_em))/3600.0)
          FILTER (WHERE f.lancado_em IS NOT NULL), 0),
      'colaboradores_ativos', (
          SELECT COALESCE(COUNT(DISTINCT c2.id), 0)::int
          FROM public.colaboradores c2
          WHERE c2.ativo = true
            AND (_empresa_id IS NULL OR c2.empresa_id = _empresa_id)
            AND (_projeto_id IS NULL OR c2.projeto_id = _projeto_id)
            AND (_supervisor IS NULL OR c2.supervisor_nome ILIKE '%'||_supervisor||'%')
      ),
      'backlog_processamento', (
          SELECT COUNT(*)
          FROM public.ausencias a2
          WHERE a2.status_processamento IN ('AGUARDANDO', 'EM_PROCESSAMENTO')
            AND a2.status_documental = 'ATIVO'
            AND NOT (a2.tipo = 'FALTA' AND COALESCE(a2.status_justificativa, '') = 'JUSTIFICADA_OCORRENCIA_PONTO')
            AND (_empresa_id IS NULL OR a2.empresa_id = _empresa_id)
            AND (_projeto_id IS NULL OR a2.projeto_id = _projeto_id)
      ),
      'processados_hoje', (
          SELECT COUNT(*)
          FROM public.ausencias a3
          WHERE a3.status_processamento = 'PROCESSADO'
            AND a3.status_documental = 'ATIVO'
            AND NOT (a3.tipo = 'FALTA' AND COALESCE(a3.status_justificativa, '') = 'JUSTIFICADA_OCORRENCIA_PONTO')
            AND a3.processamento_concluido_em::date = CURRENT_DATE
            AND (_empresa_id IS NULL OR a3.empresa_id = _empresa_id)
            AND (_projeto_id IS NULL OR a3.projeto_id = _projeto_id)
      ),
      'tempo_medio_processamento_h', (
          SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (a4.processamento_concluido_em - a4.processamento_iniciado_em))/3600.0), 0)
          FROM public.ausencias a4
          WHERE a4.status_processamento = 'PROCESSADO'
            AND a4.status_documental = 'ATIVO'
            AND NOT (a4.tipo = 'FALTA' AND COALESCE(a4.status_justificativa, '') = 'JUSTIFICADA_OCORRENCIA_PONTO')
            AND a4.processamento_concluido_em::date BETWEEN _inicio AND _fim
            AND a4.processamento_iniciado_em IS NOT NULL
            AND (_empresa_id IS NULL OR a4.empresa_id = _empresa_id)
            AND (_projeto_id IS NULL OR a4.projeto_id = _projeto_id)
      )
    ) FROM filtered f),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.dia), '[]'::jsonb) FROM (
      SELECT f.data_inicio AS dia, COUNT(*) AS total,
             COUNT(*) FILTER (WHERE f.status='PENDENTE') AS pendentes,
             COUNT(*) FILTER (WHERE f.status='LANCADO') AS lancadas
      FROM filtered f GROUP BY f.data_inicio
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT f.empresa_nome AS nome, COUNT(*) AS total FROM filtered f GROUP BY f.empresa_nome
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT f.projeto_nome AS nome, COUNT(*) AS total FROM filtered f GROUP BY f.projeto_nome
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT f.tipo AS nome, COUNT(*) AS total FROM filtered f GROUP BY f.tipo
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT f.status AS nome, COUNT(*) AS total FROM filtered f GROUP BY f.status
    ) t),
    -- ETAPA 1 e 3: Group By supervisor_usuario_id (Identity)
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT 
          COALESCE(p.nome, MAX(f.sup_nome_snapshot)) as nome,
          COUNT(*) as total
      FROM filtered f
      LEFT JOIN public.profiles p ON p.id = f.sup_id
      GROUP BY f.sup_id, (CASE WHEN f.sup_id IS NULL THEN f.sup_nome_snapshot ELSE NULL END)
      LIMIT 10
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT f.colab_nome AS nome, COUNT(*) AS total FROM filtered f GROUP BY f.colab_nome LIMIT 10
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.dia), '[]'::jsonb) FROM (
      SELECT f.data_inicio AS dia, 
             SUM(COALESCE(f.dias, 1)) AS total_dias
      FROM filtered f GROUP BY f.data_inicio
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.dow), '[]'::jsonb) FROM (
      SELECT EXTRACT(DOW FROM f.data_inicio) AS dow,
             COUNT(*) AS total
      FROM filtered f GROUP BY dow
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.registrado_em DESC), '[]'::jsonb) FROM (
      SELECT f.registrado_em, f.colab_nome, f.tipo, f.status FROM filtered f LIMIT 10
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT cat.nome AS nome, COUNT(*) AS total 
      FROM filtered f
      JOIN public.categorias_ausencia cat ON cat.id = f.categoria_id
      GROUP BY cat.nome
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT f.tipo_oficial_nome AS nome, f.tipo_oficial_codigo AS codigo, f.tipo_oficial_cor AS cor, COUNT(*) AS total 
      FROM filtered f 
      GROUP BY f.tipo_oficial_nome, f.tipo_oficial_codigo, f.tipo_oficial_cor
    ) t)
  INTO v_kpis, v_por_dia, v_por_empresa, v_por_projeto, v_por_tipo, v_por_status, v_top_sup, v_top_col, v_tempo_diario, v_heatmap, v_ultimos, v_por_categoria, v_por_tipo_oficial;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'atestados', COUNT(*) FILTER (WHERE a_prev.tipo='ATESTADO'),
    'faltas', COUNT(*) FILTER (WHERE a_prev.tipo='FALTA')
  ) INTO v_prev
  FROM public.ausencias a_prev
  WHERE a_prev.data_inicio <= v_prev_fim AND a_prev.data_fim >= v_prev_ini
    AND a_prev.status_documental = 'ATIVO'
    AND NOT (a_prev.tipo = 'FALTA' AND COALESCE(a_prev.status_justificativa, '') = 'JUSTIFICADA_OCORRENCIA_PONTO')
    AND (_empresa_id IS NULL OR a_prev.empresa_id = _empresa_id)
    AND (_projeto_id IS NULL OR a_prev.projeto_id = _projeto_id);

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
    'ultimos', v_ultimos,
    'por_categoria', v_por_categoria,
    'por_tipo_oficial', v_por_tipo_oficial
  );

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.dashboard_metrics(date, date, uuid, uuid, text, tipo_ausencia, status_ausencia, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(date, date, uuid, uuid, text, tipo_ausencia, status_ausencia, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.dashboard_metrics(date, date, uuid, uuid, text, tipo_ausencia, status_ausencia, uuid) FROM public, anon;
