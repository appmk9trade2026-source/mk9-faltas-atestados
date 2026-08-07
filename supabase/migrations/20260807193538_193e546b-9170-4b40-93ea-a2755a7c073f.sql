-- Hardening Migration: Absenteísmo RBAC & Full Export
-- Goal: Eliminate name-based authorization and ensure export integrity.

CREATE OR REPLACE FUNCTION public.rel_absenteismo(
  _inicio date, 
  _fim date,
  _empresa_id uuid DEFAULT NULL, 
  _projeto_id uuid DEFAULT NULL, 
  _supervisor text DEFAULT NULL,
  _is_export boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE 
  v jsonb;
  v_user_id uuid := auth.uid();
  v_is_super_admin boolean := public.has_role(auth.uid(), 'super_admin');
  v_is_rh boolean := public.has_role(auth.uid(), 'rh');
  v_is_coordenador boolean := public.has_role(auth.uid(), 'coordenador');
  v_is_supervisor boolean := public.has_role(auth.uid(), 'supervisor');
BEGIN
  WITH filtered_ausencias AS (
    SELECT 
      a.*, 
      t.categoria_ausencia_id AS cat_id, 
      t.nome AS tipo_nome, 
      t.codigo AS tipo_codigo,
      c.nome_completo AS colab_nome,
      c.matricula AS colab_matricula,
      c.supervisor_nome AS colab_supervisor,
      c.supervisor_usuario_id AS colab_supervisor_id,
      p.nome AS projeto_nome,
      e.nome AS empresa_nome
    FROM public.ausencias a
    JOIN public.colaboradores c ON c.id = a.colaborador_id
    JOIN public.projetos p ON p.id = a.projeto_id
    JOIN public.empresas e ON e.id = a.empresa_id
    LEFT JOIN public.tipos_ausencia t ON t.id = a.tipo_ausencia_id
    WHERE a.data_inicio <= _fim AND a.data_fim >= _inicio
      AND a.status_documental = 'ATIVO'
      AND (_empresa_id IS NULL OR a.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id = _projeto_id)
      AND (_supervisor IS NULL OR c.supervisor_nome ILIKE '%'||_supervisor||'%')
      -- HARDENED RBAC SCOPE ENFORCEMENT
      AND (
        v_is_super_admin OR v_is_rh OR
        (v_is_coordenador AND EXISTS (
          SELECT 1 FROM public.profiles ps 
          WHERE ps.coordenador_usuario_id = v_user_id 
            AND ps.id = c.supervisor_usuario_id
        )) OR
        (v_is_supervisor AND c.supervisor_usuario_id = v_user_id)
      )
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'total_faltas', (SELECT COUNT(*) FROM filtered_ausencias WHERE tipo = 'FALTA'),
      'total_atestados', (SELECT COUNT(*) FROM filtered_ausencias WHERE tipo = 'ATESTADO'),
      'total_ocorrencias', (SELECT COUNT(*) FROM filtered_ausencias),
      'total_dias', (SELECT COALESCE(SUM(dias), 0) FROM filtered_ausencias)
    ),
    'ranking_projetos', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total_ocorrencias DESC), '[]'::jsonb) FROM (
      SELECT 
        projeto_nome AS projeto,
        empresa_nome AS empresa,
        COUNT(DISTINCT colaborador_id) AS colaboradores,
        COUNT(*) FILTER (WHERE tipo = 'FALTA') AS faltas,
        COUNT(*) FILTER (WHERE tipo = 'ATESTADO') AS atestados,
        COALESCE(SUM(dias), 0) AS dias_ausencia,
        COUNT(*) AS total_ocorrencias
      FROM filtered_ausencias
      GROUP BY projeto_nome, empresa_nome
      ORDER BY total_ocorrencias DESC
      LIMIT CASE WHEN _is_export THEN 10000 ELSE 50 END
    ) x),
    'ranking_colaboradores', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total_ocorrencias DESC), '[]'::jsonb) FROM (
      SELECT 
        colab_matricula AS matricula,
        colab_nome AS nome,
        projeto_nome AS projeto,
        colab_supervisor AS supervisor,
        COUNT(*) FILTER (WHERE tipo = 'FALTA') AS faltas,
        COUNT(*) FILTER (WHERE tipo = 'ATESTADO') AS atestados,
        COALESCE(SUM(dias), 0) AS dias_ausencia,
        COUNT(*) AS total_ocorrencias,
        MAX(data_inicio) AS ultima_ocorrencia
      FROM filtered_ausencias
      GROUP BY colab_matricula, colab_nome, projeto_nome, colab_supervisor
      ORDER BY total_ocorrencias DESC
      LIMIT CASE WHEN _is_export THEN 10000 ELSE 100 END
    ) x),
    'total', (SELECT COUNT(*) FROM filtered_ausencias),
    'total_dias', (SELECT COALESCE(SUM(dias), 0) FROM filtered_ausencias),
    'metadados', jsonb_build_object(
      'is_export', _is_export,
      'timestamp', now()
    )
  ) INTO v;
  RETURN v;
END $$;
