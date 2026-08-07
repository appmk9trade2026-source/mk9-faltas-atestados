CREATE OR REPLACE FUNCTION public.dashboard_metrics(_inicio date, _fim date, _empresa_id uuid DEFAULT NULL::uuid, _projeto_id uuid DEFAULT NULL::uuid, _supervisor text DEFAULT NULL::text, _tipo tipo_ausencia DEFAULT NULL::tipo_ausencia, _status status_ausencia DEFAULT NULL::status_ausencia, _categoria_id uuid DEFAULT NULL::uuid)
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
      -- Novos KPIs da Central de Processamento
      'backlog_processamento', (
          SELECT COUNT(*)
          FROM public.ausencias
          WHERE status_processamento IN ('AGUARDANDO', 'EM_PROCESSAMENTO')
            AND status_documental = 'ATIVO'
            AND (_empresa_id IS NULL OR empresa_id = _empresa_id)
            AND (_projeto_id IS NULL OR projeto_id = _projeto_id)
      ),
      'processados_hoje', (
          SELECT COUNT(*)
          FROM public.ausencias
          WHERE status_processamento = 'PROCESSADO'
            AND status_documental = 'ATIVO'
            AND processamento_concluido_em::date = CURRENT_DATE
            AND (_empresa_id IS NULL OR empresa_id = _empresa_id)
            AND (_projeto_id IS NULL OR projeto_id = _projeto_id)
      ),
      'tempo_medio_processamento_h', (
          SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (processamento_concluido_em - processamento_iniciado_em))/3600.0), 0)
          FROM public.ausencias
          WHERE status_processamento = 'PROCESSADO'
            AND status_documental = 'ATIVO'
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
      SELECT empresa_id, empresa_nome AS nome, COUNT(*) AS total
      FROM filtered GROUP BY empresa_id, empresa_nome
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT projeto_id, projeto_nome AS nome, COUNT(*) AS total
      FROM filtered GROUP BY projeto_id, projeto_nome LIMIT 15
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT tipo::text AS nome, COUNT(*) AS total FROM filtered GROUP BY tipo
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT status::text AS nome, COUNT(*) AS total FROM filtered GROUP BY status
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT COALESCE(sup_nome, '(Sem supervisor)') AS nome, COUNT(*) AS total
      FROM filtered GROUP BY sup_nome ORDER BY COUNT(*) DESC LIMIT 10
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT colaborador_id AS id, colab_nome AS nome, COUNT(*) AS total
      FROM filtered GROUP BY colaborador_id, colab_nome ORDER BY COUNT(*) DESC LIMIT 10
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.dia), '[]'::jsonb) FROM (
      SELECT registrado_em::date AS dia,
             AVG(EXTRACT(EPOCH FROM (lancado_em - registrado_em))/3600.0) AS horas
      FROM filtered WHERE lancado_em IS NOT NULL
      GROUP BY registrado_em::date
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT EXTRACT(DOW FROM registrado_em) AS dow, COUNT(*) AS total
      FROM filtered GROUP BY EXTRACT(DOW FROM registrado_em)
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT id, registrado_em, colab_nome, empresa_nome, projeto_nome, tipo::text, status::text, data_inicio, data_fim,
             tipo_oficial_nome, tipo_oficial_codigo
      FROM filtered ORDER BY registrado_em DESC LIMIT 10
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
       SELECT
         f.categoria_id,
         (SELECT codigo FROM public.categorias_ausencia WHERE id = f.categoria_id) AS codigo,
         (SELECT nome FROM public.categorias_ausencia WHERE id = f.categoria_id) AS nome,
         (SELECT cor FROM public.categorias_ausencia WHERE id = f.categoria_id) AS cor,
         COUNT(*) AS total
       FROM filtered f
       GROUP BY f.categoria_id
     ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
       SELECT
         f.tipo_oficial_id AS tipo_id,
         COALESCE(f.tipo_oficial_codigo, f.tipo::text) AS codigo,
         COALESCE(f.tipo_oficial_nome, f.tipo::text) AS nome,
         f.tipo_oficial_cor AS cor,
         (SELECT categoria_ausencia_id FROM public.tipos_ausencia WHERE id = f.tipo_oficial_id) AS categoria_id,
         COUNT(*) AS total
       FROM filtered f
       GROUP BY f.tipo_oficial_id, f.tipo_oficial_codigo, f.tipo_oficial_nome, f.tipo_oficial_cor, f.tipo
     ) t)
  INTO v_kpis, v_por_dia, v_por_empresa, v_por_projeto, v_por_tipo, v_por_status,
       v_top_sup, v_top_col, v_tempo_diario, v_heatmap, v_ultimos,
       v_por_categoria, v_por_tipo_oficial
  FROM filtered LIMIT 1;

  v_kpis := COALESCE(v_kpis, '{}'::jsonb) || jsonb_build_object(
    'colaboradores_ativos',
      (SELECT COUNT(*) FROM public.colaboradores
        WHERE ativo=true
          AND (_empresa_id IS NULL OR empresa_id=_empresa_id)
          AND (_projeto_id IS NULL OR projeto_id=_projeto_id)),
    'comunicacoes_enviadas',
      (SELECT COUNT(*) FROM public.comunicacoes co
        WHERE co.status='ENVIADO'
          AND co.enviado_em::date BETWEEN _inicio AND _fim)
  );

  v_result := jsonb_build_object(
    'periodo', jsonb_build_object('inicio', _inicio, 'fim', _fim,
                                  'prev_inicio', v_prev_ini, 'prev_fim', v_prev_fim),
    'kpis', COALESCE(v_kpis, '{}'::jsonb),
    'prev', COALESCE(v_prev, '{}'::jsonb),
    'por_dia', COALESCE(v_por_dia,'[]'::jsonb),
    'por_empresa', COALESCE(v_por_empresa,'[]'::jsonb),
    'por_projeto', COALESCE(v_por_projeto,'[]'::jsonb),
    'por_tipo', COALESCE(v_por_tipo,'[]'::jsonb),
    'por_status', COALESCE(v_por_status,'[]'::jsonb),
    'top_supervisores', COALESCE(v_top_sup,'[]'::jsonb),
    'top_colaboradores', COALESCE(v_top_col,'[]'::jsonb),
    'tempo_diario', COALESCE(v_tempo_diario,'[]'::jsonb),
    'heatmap', COALESCE(v_heatmap,'[]'::jsonb),
    'ultimos', COALESCE(v_ultimos,'[]'::jsonb),
    'por_categoria', COALESCE(v_por_categoria,'[]'::jsonb),
    'por_tipo_oficial', COALESCE(v_por_tipo_oficial,'[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.dashboard_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics TO service_role;
