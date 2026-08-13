
-- CRM MK9 — CORREÇÃO CIRÚRGICA RELATÓRIOS (V3)
-- Causa: O PostgREST às vezes falha ao resolver CTEs em múltiplos sub-statements dentro de um jsonb_build_object.
-- Solução: Mover a lógica para subqueries explícitas ou garantir que a CTE seja materializada se necessário, 
-- mas a forma mais segura é injetar a lógica diretamente ou usar subqueries.

-- 1. rel_atestados
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
  -- Criar uma temporary table para garantir visibilidade em todos os statements do jsonb_build_object
  -- Como a função é STABLE, não podemos criar tabelas temporárias. 
  -- Vamos usar uma única query principal.

  SELECT 
    jsonb_build_object(
      'quantidade', COUNT(*),
      'dias', COALESCE(SUM(dias), 0),
      'por_tipo', (
        SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb)
        FROM (
          SELECT COALESCE(t2.nome, 'Atestado') AS nome, COUNT(*) AS total, COALESCE(SUM(a2.dias), 0) AS dias
          FROM public.ausencias a2
          JOIN public.colaboradores c2 ON c2.id = a2.colaborador_id
          LEFT JOIN public.tipos_ausencia t2 ON t2.id = a2.tipo_ausencia_id
          LEFT JOIN public.categorias_ausencia cat2 ON cat2.id = t2.categoria_ausencia_id
          WHERE a2.data_inicio <= _fim AND a2.data_fim >= _inicio
            AND a2.status_documental = 'ATIVO'
            AND (cat2.codigo = 'ATESTADOS' OR a2.tipo = 'ATESTADO')
            AND (_empresa_id IS NULL OR a2.empresa_id = _empresa_id)
            AND (_projeto_id IS NULL OR a2.projeto_id = _projeto_id)
            AND (
              v_is_super_admin OR v_is_rh OR
              (v_is_coordenador AND EXISTS (
                SELECT 1 FROM public.profiles ps 
                WHERE ps.coordenador_usuario_id = v_user_id 
                  AND ps.nome = c2.supervisor_nome
              )) OR
              (v_is_supervisor AND c2.supervisor_nome = (SELECT raw_user_meta_data->>'nome' FROM auth.users WHERE id = v_user_id))
            )
          GROUP BY t2.nome
        ) x
      ),
      'ranking_projetos', (
        SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb)
        FROM (
          SELECT p3.nome AS nome, COUNT(*) AS total, COALESCE(SUM(a3.dias), 0) AS dias
          FROM public.ausencias a3
          JOIN public.projetos p3 ON p3.id = a3.projeto_id
          JOIN public.colaboradores c3 ON c3.id = a3.colaborador_id
          LEFT JOIN public.tipos_ausencia t3 ON t3.id = a3.tipo_ausencia_id
          LEFT JOIN public.categorias_ausencia cat3 ON cat3.id = t3.categoria_ausencia_id
          WHERE a3.data_inicio <= _fim AND a3.data_fim >= _inicio
            AND a3.status_documental = 'ATIVO'
            AND (cat3.codigo = 'ATESTADOS' OR a3.tipo = 'ATESTADO')
            AND (_empresa_id IS NULL OR a3.empresa_id = _empresa_id)
            AND (_projeto_id IS NULL OR a3.projeto_id = _projeto_id)
            AND (
              v_is_super_admin OR v_is_rh OR
              (v_is_coordenador AND EXISTS (
                SELECT 1 FROM public.profiles ps 
                WHERE ps.coordenador_usuario_id = v_user_id 
                  AND ps.nome = c3.supervisor_nome
              )) OR
              (v_is_supervisor AND c3.supervisor_nome = (SELECT raw_user_meta_data->>'nome' FROM auth.users WHERE id = v_user_id))
            )
          GROUP BY p3.nome
          LIMIT CASE WHEN _is_export THEN v_limit_export ELSE v_limit_preview END
        ) x
      )
    )
  INTO v
  FROM public.ausencias a
  JOIN public.colaboradores c ON c.id = a.colaborador_id
  LEFT JOIN public.tipos_ausencia t ON t.id = a.tipo_ausencia_id
  LEFT JOIN public.categorias_ausencia cat ON cat.id = t.categoria_ausencia_id
  WHERE a.data_inicio <= _fim AND a.data_fim >= _inicio
    AND a.status_documental = 'ATIVO'
    AND (cat.codigo = 'ATESTADOS' OR a.tipo = 'ATESTADO')
    AND (_empresa_id IS NULL OR a.empresa_id = _empresa_id)
    AND (_projeto_id IS NULL OR a.projeto_id = _projeto_id)
    AND (
      v_is_super_admin OR v_is_rh OR
      (v_is_coordenador AND EXISTS (
        SELECT 1 FROM public.profiles ps 
        WHERE ps.coordenador_usuario_id = v_user_id 
          AND ps.nome = c.supervisor_nome
      )) OR
      (v_is_supervisor AND c.supervisor_nome = (SELECT raw_user_meta_data->>'nome' FROM auth.users WHERE id = v_user_id))
    );

  -- Adicionar metadados de exportação
  SELECT v || jsonb_build_object(
    'total_registros_disponiveis', COALESCE((v->>'quantidade')::int, 0),
    'is_truncated', (_is_export AND COALESCE((v->>'quantidade')::int, 0) > v_limit_export),
    'limit_max', v_limit_export
  ) INTO v;

  RETURN v;
END $function$;

-- 2. rel_faltas
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
BEGIN
  -- Contagem total primeiro
  SELECT COUNT(*)
  INTO v_count_total
  FROM public.ausencias a
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
    );

  SELECT jsonb_build_object(
    'justificadas', (
      SELECT jsonb_build_object('quantidade', COUNT(*), 'dias', COALESCE(SUM(a2.dias), 0))
      FROM public.ausencias a2
      JOIN public.colaboradores c2 ON c2.id = a2.colaborador_id
      LEFT JOIN public.tipos_ausencia t2 ON t2.id = a2.tipo_ausencia_id
      WHERE a2.data_inicio <= _fim AND a2.data_fim >= _inicio
        AND a2.status_documental = 'ATIVO'
        AND t2.codigo = 'FALTA_JUSTIFICADA'
        AND (_empresa_id IS NULL OR a2.empresa_id = _empresa_id)
        AND (_projeto_id IS NULL OR a2.projeto_id = _projeto_id)
        AND (v_is_super_admin OR v_is_rh OR v_is_compliance OR 
            (v_is_coordenador AND EXISTS (SELECT 1 FROM public.profiles ps WHERE ps.coordenador_usuario_id = v_user_id AND ps.nome = c2.supervisor_nome)) OR
            (v_is_supervisor AND c2.supervisor_nome = (SELECT raw_user_meta_data->>'nome' FROM auth.users WHERE id = v_user_id)))
    ),
    'justificadas_ambev', (
      SELECT jsonb_build_object('quantidade', COUNT(*), 'dias', COALESCE(SUM(a2.dias), 0))
      FROM public.ausencias a2
      JOIN public.colaboradores c2 ON c2.id = a2.colaborador_id
      LEFT JOIN public.tipos_ausencia t2 ON t2.id = a2.tipo_ausencia_id
      WHERE a2.data_inicio <= _fim AND a2.data_fim >= _inicio
        AND a2.status_documental = 'ATIVO'
        AND a2.status_justificativa = 'JUSTIFICADA_OCORRENCIA_PONTO'
        AND (_empresa_id IS NULL OR a2.empresa_id = _empresa_id)
        AND (_projeto_id IS NULL OR a2.projeto_id = _projeto_id)
        AND (v_is_super_admin OR v_is_rh OR v_is_compliance OR 
            (v_is_coordenador AND EXISTS (SELECT 1 FROM public.profiles ps WHERE ps.coordenador_usuario_id = v_user_id AND ps.nome = c2.supervisor_nome)) OR
            (v_is_supervisor AND c2.supervisor_nome = (SELECT raw_user_meta_data->>'nome' FROM auth.users WHERE id = v_user_id)))
    ),
    'injustificadas', (
      SELECT jsonb_build_object('quantidade', COUNT(*), 'dias', COALESCE(SUM(a2.dias), 0))
      FROM public.ausencias a2
      JOIN public.colaboradores c2 ON c2.id = a2.colaborador_id
      LEFT JOIN public.tipos_ausencia t2 ON t2.id = a2.tipo_ausencia_id
      WHERE a2.data_inicio <= _fim AND a2.data_fim >= _inicio
        AND a2.status_documental = 'ATIVO'
        AND (t2.codigo = 'FALTA_INJUSTIFICADA' OR (t2.codigo IS NULL AND a2.tipo = 'FALTA'))
        AND COALESCE(a2.status_justificativa, '') <> 'JUSTIFICADA_OCORRENCIA_PONTO'
        AND (_empresa_id IS NULL OR a2.empresa_id = _empresa_id)
        AND (_projeto_id IS NULL OR a2.projeto_id = _projeto_id)
        AND (v_is_super_admin OR v_is_rh OR v_is_compliance OR 
            (v_is_coordenador AND EXISTS (SELECT 1 FROM public.profiles ps WHERE ps.coordenador_usuario_id = v_user_id AND ps.nome = c2.supervisor_nome)) OR
            (v_is_supervisor AND c2.supervisor_nome = (SELECT raw_user_meta_data->>'nome' FROM auth.users WHERE id = v_user_id)))
    ),
    'ranking_projetos', (
      SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb)
      FROM (
        SELECT p2.nome AS nome, COUNT(*) AS total, COALESCE(SUM(a2.dias), 0) AS dias 
        FROM public.ausencias a2
        JOIN public.projetos p2 ON p2.id = a2.projeto_id
        JOIN public.colaboradores c2 ON c2.id = a2.colaborador_id
        LEFT JOIN public.tipos_ausencia t2 ON t2.id = a2.tipo_ausencia_id
        WHERE a2.data_inicio <= _fim AND a2.data_fim >= _inicio
          AND a2.status_documental = 'ATIVO'
          AND (t2.codigo IN ('FALTA_JUSTIFICADA', 'FALTA_INJUSTIFICADA') OR a2.tipo = 'FALTA')
          AND COALESCE(a2.status_justificativa, '') <> 'JUSTIFICADA_OCORRENCIA_PONTO'
          AND (_empresa_id IS NULL OR a2.empresa_id = _empresa_id)
          AND (_projeto_id IS NULL OR a2.projeto_id = _projeto_id)
          AND (v_is_super_admin OR v_is_rh OR v_is_compliance OR 
              (v_is_coordenador AND EXISTS (SELECT 1 FROM public.profiles ps WHERE ps.coordenador_usuario_id = v_user_id AND ps.nome = c2.supervisor_nome)) OR
              (v_is_supervisor AND c2.supervisor_nome = (SELECT raw_user_meta_data->>'nome' FROM auth.users WHERE id = v_user_id)))
        GROUP BY p2.nome
        LIMIT CASE WHEN _is_export THEN v_limit_export ELSE v_limit_preview END
      ) x
    ),
    'ranking_colaboradores', (
      SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb)
      FROM (
        SELECT c2.nome_completo AS nome, c2.matricula AS matricula, c2.supervisor_nome AS supervisor, COUNT(*) AS total, COALESCE(SUM(a2.dias), 0) AS dias 
        FROM public.ausencias a2
        JOIN public.colaboradores c2 ON c2.id = a2.colaborador_id
        LEFT JOIN public.tipos_ausencia t2 ON t2.id = a2.tipo_ausencia_id
        WHERE a2.data_inicio <= _fim AND a2.data_fim >= _inicio
          AND a2.status_documental = 'ATIVO'
          AND (t2.codigo IN ('FALTA_JUSTIFICADA', 'FALTA_INJUSTIFICADA') OR a2.tipo = 'FALTA')
          AND COALESCE(a2.status_justificativa, '') <> 'JUSTIFICADA_OCORRENCIA_PONTO'
          AND (_empresa_id IS NULL OR a2.empresa_id = _empresa_id)
          AND (_projeto_id IS NULL OR a2.projeto_id = _projeto_id)
          AND (v_is_super_admin OR v_is_rh OR v_is_compliance OR 
              (v_is_coordenador AND EXISTS (SELECT 1 FROM public.profiles ps WHERE ps.coordenador_usuario_id = v_user_id AND ps.nome = c2.supervisor_nome)) OR
              (v_is_supervisor AND c2.supervisor_nome = (SELECT raw_user_meta_data->>'nome' FROM auth.users WHERE id = v_user_id)))
        GROUP BY c2.nome_completo, c2.matricula, c2.supervisor_nome
        LIMIT CASE WHEN _is_export THEN v_limit_export ELSE v_limit_preview END
      ) x
    ),
    'total_registros_disponiveis', v_count_total,
    'total_registros_exportados', CASE WHEN (_is_export AND v_count_total > v_limit_export) THEN v_limit_export ELSE v_count_total END,
    'is_truncated', (_is_export AND v_count_total > v_limit_export),
    'limit_max', v_limit_export
  ) INTO v;
  
  RETURN v;
END $function$;

-- Recarregar cache
NOTIFY pgrst, 'reload schema';
