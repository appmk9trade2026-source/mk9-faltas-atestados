
-- CRM MK9 — CORREÇÃO CIRÚRGICA RELATÓRIOS
-- PARTE A: rel_atestados (Assinatura e RBAC)
-- PARTE B: rel_faltas (filtered_faltas scope)

-- 1. rel_atestados: Adicionar _is_export e RBAC
CREATE OR REPLACE FUNCTION public.rel_atestados(
  _inicio date, 
  _fim date, 
  _empresa_id uuid DEFAULT NULL::uuid, 
  _projeto_id uuid DEFAULT NULL::uuid,
  _is_export boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE 
  v jsonb;
  v_user_id uuid := auth.uid();
  v_is_super_admin boolean := public.has_role(auth.uid(), 'super_admin');
  v_is_rh boolean := public.has_role(auth.uid(), 'rh');
  v_is_coordenador boolean := public.has_role(auth.uid(), 'coordenador');
  v_is_supervisor boolean := public.has_role(auth.uid(), 'supervisor');
  v_limit_preview int := 20;
  v_limit_export int := 10000;
  v_count_total int;
  v_is_truncated boolean := false;
BEGIN
  WITH f AS (
    SELECT 
      a.*, 
      t.nome AS tipo_nome, 
      t.codigo AS tipo_codigo, 
      p.nome AS projeto_nome,
      c.nome_completo AS colab_nome,
      c.matricula AS colab_matricula,
      c.supervisor_nome AS colab_supervisor
    FROM public.ausencias a
    JOIN public.projetos p ON p.id = a.projeto_id
    JOIN public.colaboradores c ON c.id = a.colaborador_id
    LEFT JOIN public.tipos_ausencia t ON t.id = a.tipo_ausencia_id
    LEFT JOIN public.categorias_ausencia cat ON cat.id = t.categoria_ausencia_id
    WHERE a.data_inicio <= _fim AND a.data_fim >= _inicio
      AND a.status_documental = 'ATIVO'
      AND (cat.codigo = 'ATESTADOS' OR a.tipo = 'ATESTADO')
      AND (_empresa_id IS NULL OR a.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id = _projeto_id)
      -- RBAC SCOPE
      AND (
        v_is_super_admin OR v_is_rh OR
        (v_is_coordenador AND EXISTS (
          SELECT 1 FROM public.profiles ps 
          WHERE ps.coordenador_usuario_id = v_user_id 
            AND ps.nome = c.supervisor_nome
        )) OR
        (v_is_supervisor AND c.supervisor_nome = (SELECT raw_user_meta_data->>'nome' FROM auth.users WHERE id = v_user_id))
      )
  )
  SELECT COUNT(*) FROM f INTO v_count_total;
  
  IF _is_export AND v_count_total > v_limit_export THEN
    v_is_truncated := true;
  END IF;

  SELECT jsonb_build_object(
    'quantidade', v_count_total,
    'dias', (SELECT COALESCE(SUM(dias), 0) FROM f),
    'por_tipo', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
      SELECT COALESCE(tipo_nome, 'Atestado') AS nome, COUNT(*) AS total, COALESCE(SUM(dias), 0) AS dias
      FROM f GROUP BY tipo_nome
    ) x),
    'ranking_projetos', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
      SELECT projeto_nome AS nome, COUNT(*) AS total, COALESCE(SUM(dias), 0) AS dias
      FROM f GROUP BY projeto_nome 
      LIMIT CASE WHEN _is_export THEN v_limit_export ELSE v_limit_preview END
    ) x),
    'total_registros_disponiveis', v_count_total,
    'is_truncated', v_is_truncated,
    'limit_max', v_limit_export
  ) INTO v; 
  
  RETURN v;
END $function$;

-- 2. rel_faltas: Corrigir erro filtered_faltas (scope)
CREATE OR REPLACE FUNCTION public.rel_faltas(
  _inicio date, 
  _fim date, 
  _empresa_id uuid DEFAULT NULL::uuid, 
  _projeto_id uuid DEFAULT NULL::uuid, 
  _is_export boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE 
  v jsonb;
  v_user_id uuid := auth.uid();
  v_is_super_admin boolean := public.has_role(auth.uid(), 'super_admin');
  v_is_rh boolean := public.has_role(auth.uid(), 'rh');
  v_is_compliance boolean := public.has_role(auth.uid(), 'compliance');
  v_is_coordenador boolean := public.has_role(auth.uid(), 'coordenador');
  v_is_supervisor boolean := public.has_role(auth.uid(), 'supervisor');
  v_limit_preview int := 50;
  v_limit_export int := 10000;
  v_count_total int;
  v_is_truncated boolean := false;
BEGIN
  WITH src AS (
    SELECT 
      a.*, 
      t.codigo AS tipo_codigo, 
      t.nome AS tipo_nome, 
      p.nome AS projeto_nome, 
      c.nome_completo AS colab_nome,
      c.matricula AS colab_matricula,
      c.supervisor_nome AS colab_supervisor
    FROM public.ausencias a
    JOIN public.projetos p ON p.id = a.projeto_id
    JOIN public.colaboradores c ON c.id = a.colaborador_id
    LEFT JOIN public.tipos_ausencia t ON t.id = a.tipo_ausencia_id
    WHERE a.data_inicio <= _fim AND a.data_fim >= _inicio
      AND a.status_documental = 'ATIVO'
      AND (t.codigo IN ('FALTA_JUSTIFICADA', 'FALTA_INJUSTIFICADA') OR a.tipo = 'FALTA')
      AND (_empresa_id IS NULL OR a.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id = _projeto_id)
      AND (
        v_is_super_admin OR v_is_rh OR v_is_compliance OR
        (v_is_coordenador AND EXISTS (
          SELECT 1 FROM public.profiles ps 
          WHERE ps.coordenador_usuario_id = v_user_id 
            AND ps.nome = c.supervisor_nome
        )) OR
        (v_is_supervisor AND c.supervisor_nome = (SELECT raw_user_meta_data->>'nome' FROM auth.users WHERE id = v_user_id))
      )
  )
  SELECT COUNT(*) FROM src INTO v_count_total;
  
  IF _is_export AND v_count_total > v_limit_export THEN
    v_is_truncated := true;
  END IF;

  SELECT jsonb_build_object(
    'justificadas', jsonb_build_object(
      'quantidade', (SELECT COUNT(*) FROM src WHERE tipo_codigo = 'FALTA_JUSTIFICADA'),
      'dias', (SELECT COALESCE(SUM(dias), 0) FROM src WHERE tipo_codigo = 'FALTA_JUSTIFICADA')
    ),
    'justificadas_ambev', jsonb_build_object(
      'quantidade', (SELECT COUNT(*) FROM src WHERE status_justificativa = 'JUSTIFICADA_OCORRENCIA_PONTO'),
      'dias', (SELECT COALESCE(SUM(dias), 0) FROM src WHERE status_justificativa = 'JUSTIFICADA_OCORRENCIA_PONTO')
    ),
    'injustificadas', jsonb_build_object(
      'quantidade', (SELECT COUNT(*) FROM src 
                     WHERE (tipo_codigo = 'FALTA_INJUSTIFICADA' OR tipo_codigo IS NULL)
                       AND COALESCE(status_justificativa, '') <> 'JUSTIFICADA_OCORRENCIA_PONTO'),
      'dias', (SELECT COALESCE(SUM(dias), 0) FROM src 
               WHERE (tipo_codigo = 'FALTA_INJUSTIFICADA' OR tipo_codigo IS NULL)
                 AND COALESCE(status_justificativa, '') <> 'JUSTIFICADA_OCORRENCIA_PONTO')
    ),
    'ranking_projetos', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
      SELECT projeto_nome AS nome, COUNT(*) AS total, COALESCE(SUM(dias), 0) AS dias 
      FROM src 
      WHERE COALESCE(status_justificativa, '') <> 'JUSTIFICADA_OCORRENCIA_PONTO'
      GROUP BY projeto_nome 
      LIMIT CASE WHEN _is_export THEN v_limit_export ELSE v_limit_preview END
    ) x),
    'ranking_colaboradores', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
      SELECT colab_nome AS nome, colab_matricula AS matricula, colab_supervisor AS supervisor, COUNT(*) AS total, COALESCE(SUM(dias), 0) AS dias 
      FROM src 
      WHERE COALESCE(status_justificativa, '') <> 'JUSTIFICADA_OCORRENCIA_PONTO'
      GROUP BY colab_nome, colab_matricula, colab_supervisor 
      LIMIT CASE WHEN _is_export THEN v_limit_export ELSE v_limit_preview END
    ) x),
    'total_registros_disponiveis', v_count_total,
    'total_registros_exportados', CASE WHEN v_is_truncated THEN v_limit_export ELSE v_count_total END,
    'is_truncated', v_is_truncated,
    'limit_max', v_limit_export
  ) INTO v;
  
  RETURN v;
END $function$;

-- Garantir GRANTs
GRANT EXECUTE ON FUNCTION public.rel_atestados(date, date, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rel_faltas(date, date, uuid, uuid, boolean) TO authenticated;

-- Recarregar cache
NOTIFY pgrst, 'reload schema';
