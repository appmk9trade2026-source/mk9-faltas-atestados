
-- ============ 1. ABSENTEÍSMO GERAL ============
CREATE OR REPLACE FUNCTION public.rel_absenteismo(
  _inicio date, _fim date,
  _empresa_id uuid DEFAULT NULL, _projeto_id uuid DEFAULT NULL, _supervisor text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb;
BEGIN
  WITH f AS (
    SELECT a.*, t.categoria_ausencia_id AS cat_id, t.nome AS tipo_nome, t.codigo AS tipo_codigo
    FROM ausencias a
    JOIN colaboradores c ON c.id=a.colaborador_id
    LEFT JOIN tipos_ausencia t ON t.id=a.tipo_ausencia_id
    WHERE a.data_inicio<=_fim AND a.data_fim>=_inicio
      AND (_empresa_id IS NULL OR a.empresa_id=_empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id=_projeto_id)
      AND (_supervisor IS NULL OR c.supervisor_nome ILIKE '%'||_supervisor||'%')
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM f),
    'total_dias', (SELECT COALESCE(SUM(dias),0) FROM f),
    'por_categoria', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
      SELECT cat.id AS categoria_id, cat.codigo, cat.nome, cat.cor,
             COUNT(*) AS total, COALESCE(SUM(f.dias),0) AS dias
      FROM f LEFT JOIN categorias_ausencia cat ON cat.id=f.cat_id
      GROUP BY cat.id, cat.codigo, cat.nome, cat.cor
    ) x),
    'por_tipo_oficial', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
      SELECT COALESCE(tipo_nome, tipo::text) AS nome,
             COALESCE(tipo_codigo, tipo::text) AS codigo,
             COUNT(*) AS total, COALESCE(SUM(dias),0) AS dias
      FROM f GROUP BY tipo_nome, tipo_codigo, tipo
    ) x),
    'evolucao_diaria', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.dia), '[]'::jsonb) FROM (
      SELECT data_inicio AS dia, COUNT(*) AS total, COALESCE(SUM(dias),0) AS dias FROM f GROUP BY data_inicio
    ) x),
    'evolucao_mensal', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.mes), '[]'::jsonb) FROM (
      SELECT to_char(data_inicio,'YYYY-MM') AS mes, COUNT(*) AS total, COALESCE(SUM(dias),0) AS dias
      FROM f GROUP BY to_char(data_inicio,'YYYY-MM')
    ) x)
  ) INTO v;
  RETURN v;
END $$;

-- ============ 2. ATESTADOS ============
CREATE OR REPLACE FUNCTION public.rel_atestados(
  _inicio date, _fim date, _empresa_id uuid DEFAULT NULL, _projeto_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb;
BEGIN
  WITH f AS (
    SELECT a.*, t.nome AS tipo_nome, t.codigo AS tipo_codigo, p.nome AS projeto_nome
    FROM ausencias a
    JOIN projetos p ON p.id=a.projeto_id
    LEFT JOIN tipos_ausencia t ON t.id=a.tipo_ausencia_id
    LEFT JOIN categorias_ausencia cat ON cat.id=t.categoria_ausencia_id
    WHERE a.data_inicio<=_fim AND a.data_fim>=_inicio
      AND (cat.codigo='ATESTADOS' OR a.tipo='ATESTADO')
      AND (_empresa_id IS NULL OR a.empresa_id=_empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id=_projeto_id)
  )
  SELECT jsonb_build_object(
    'quantidade', (SELECT COUNT(*) FROM f),
    'dias', (SELECT COALESCE(SUM(dias),0) FROM f),
    'por_tipo', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
      SELECT COALESCE(tipo_nome,'Atestado') AS nome, COUNT(*) AS total, COALESCE(SUM(dias),0) AS dias
      FROM f GROUP BY tipo_nome
    ) x),
    'ranking_projetos', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
      SELECT projeto_nome AS nome, COUNT(*) AS total, COALESCE(SUM(dias),0) AS dias
      FROM f GROUP BY projeto_nome LIMIT 20
    ) x)
  ) INTO v; RETURN v;
END $$;

-- ============ 3. FALTAS ============
CREATE OR REPLACE FUNCTION public.rel_faltas(
  _inicio date, _fim date, _empresa_id uuid DEFAULT NULL, _projeto_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb;
BEGIN
  WITH f AS (
    SELECT a.*, t.codigo AS tipo_codigo, t.nome AS tipo_nome, p.nome AS projeto_nome, c.nome_completo AS colab_nome
    FROM ausencias a
    JOIN projetos p ON p.id=a.projeto_id
    JOIN colaboradores c ON c.id=a.colaborador_id
    LEFT JOIN tipos_ausencia t ON t.id=a.tipo_ausencia_id
    WHERE a.data_inicio<=_fim AND a.data_fim>=_inicio
      AND (t.codigo IN ('FALTA_JUSTIFICADA','FALTA_INJUSTIFICADA') OR a.tipo='FALTA')
      AND (_empresa_id IS NULL OR a.empresa_id=_empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id=_projeto_id)
  )
  SELECT jsonb_build_object(
    'justificadas', jsonb_build_object(
      'quantidade', (SELECT COUNT(*) FROM f WHERE tipo_codigo='FALTA_JUSTIFICADA'),
      'dias', (SELECT COALESCE(SUM(dias),0) FROM f WHERE tipo_codigo='FALTA_JUSTIFICADA')
    ),
    'injustificadas', jsonb_build_object(
      'quantidade', (SELECT COUNT(*) FROM f WHERE tipo_codigo='FALTA_INJUSTIFICADA' OR tipo_codigo IS NULL),
      'dias', (SELECT COALESCE(SUM(dias),0) FROM f WHERE tipo_codigo='FALTA_INJUSTIFICADA' OR tipo_codigo IS NULL)
    ),
    'ranking_projetos', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
      SELECT projeto_nome AS nome, COUNT(*) AS total, COALESCE(SUM(dias),0) AS dias FROM f GROUP BY projeto_nome LIMIT 20
    ) x),
    'ranking_colaboradores', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
      SELECT colab_nome AS nome, COUNT(*) AS total, COALESCE(SUM(dias),0) AS dias FROM f GROUP BY colab_nome LIMIT 20
    ) x)
  ) INTO v; RETURN v;
END $$;

-- ============ 4. LICENÇAS ============
CREATE OR REPLACE FUNCTION public.rel_licencas(
  _inicio date, _fim date, _empresa_id uuid DEFAULT NULL, _projeto_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb;
BEGIN
  WITH f AS (
    SELECT a.*, t.codigo AS tipo_codigo, t.nome AS tipo_nome
    FROM ausencias a
    LEFT JOIN tipos_ausencia t ON t.id=a.tipo_ausencia_id
    LEFT JOIN categorias_ausencia cat ON cat.id=t.categoria_ausencia_id
    WHERE a.data_inicio<=_fim AND a.data_fim>=_inicio
      AND cat.codigo='LICENCAS'
      AND (_empresa_id IS NULL OR a.empresa_id=_empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id=_projeto_id)
  )
  SELECT jsonb_build_object(
    'por_tipo', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
      SELECT tipo_nome AS nome, tipo_codigo AS codigo, COUNT(*) AS total, COALESCE(SUM(dias),0) AS dias
      FROM f GROUP BY tipo_nome, tipo_codigo
    ) x),
    'quantidade', (SELECT COUNT(*) FROM f),
    'dias', (SELECT COALESCE(SUM(dias),0) FROM f)
  ) INTO v; RETURN v;
END $$;

-- ============ 5. AFASTAMENTOS INSS ============
CREATE OR REPLACE FUNCTION public.rel_afastamentos_inss(
  _inicio date, _fim date, _empresa_id uuid DEFAULT NULL, _projeto_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb;
BEGIN
  WITH f AS (
    SELECT a.*, t.codigo AS tipo_codigo, t.nome AS tipo_nome,
           (a.data_fim >= CURRENT_DATE) AS em_andamento
    FROM ausencias a
    LEFT JOIN tipos_ausencia t ON t.id=a.tipo_ausencia_id
    LEFT JOIN categorias_ausencia cat ON cat.id=t.categoria_ausencia_id
    WHERE a.data_inicio<=_fim AND a.data_fim>=_inicio
      AND cat.codigo='AFASTAMENTOS'
      AND (_empresa_id IS NULL OR a.empresa_id=_empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id=_projeto_id)
  )
  SELECT jsonb_build_object(
    'doenca', jsonb_build_object(
      'quantidade', (SELECT COUNT(*) FROM f WHERE tipo_codigo='AFASTAMENTO_INSS_DOENCA'),
      'dias', (SELECT COALESCE(SUM(dias),0) FROM f WHERE tipo_codigo='AFASTAMENTO_INSS_DOENCA'),
      'em_andamento', (SELECT COUNT(*) FROM f WHERE tipo_codigo='AFASTAMENTO_INSS_DOENCA' AND em_andamento),
      'encerrados', (SELECT COUNT(*) FROM f WHERE tipo_codigo='AFASTAMENTO_INSS_DOENCA' AND NOT em_andamento)
    ),
    'acidente', jsonb_build_object(
      'quantidade', (SELECT COUNT(*) FROM f WHERE tipo_codigo='AFASTAMENTO_INSS_ACIDENTE'),
      'dias', (SELECT COALESCE(SUM(dias),0) FROM f WHERE tipo_codigo='AFASTAMENTO_INSS_ACIDENTE'),
      'em_andamento', (SELECT COUNT(*) FROM f WHERE tipo_codigo='AFASTAMENTO_INSS_ACIDENTE' AND em_andamento),
      'encerrados', (SELECT COUNT(*) FROM f WHERE tipo_codigo='AFASTAMENTO_INSS_ACIDENTE' AND NOT em_andamento)
    )
  ) INTO v; RETURN v;
END $$;

-- ============ 6. MEDIDAS ADMINISTRATIVAS ============
CREATE OR REPLACE FUNCTION public.rel_medidas_administrativas(
  _inicio date, _fim date, _empresa_id uuid DEFAULT NULL, _projeto_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb;
BEGIN
  WITH f AS (
    SELECT a.*, t.codigo AS tipo_codigo
    FROM ausencias a
    LEFT JOIN tipos_ausencia t ON t.id=a.tipo_ausencia_id
    LEFT JOIN categorias_ausencia cat ON cat.id=t.categoria_ausencia_id
    WHERE a.data_inicio<=_fim AND a.data_fim>=_inicio
      AND (cat.codigo='MEDIDAS_ADMINISTRATIVAS' OR a.tipo='SUSPENSAO')
      AND (_empresa_id IS NULL OR a.empresa_id=_empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id=_projeto_id)
  )
  SELECT jsonb_build_object(
    'suspensoes', jsonb_build_object(
      'quantidade', (SELECT COUNT(*) FROM f WHERE tipo_codigo='SUSPENSAO_DISCIPLINAR' OR tipo_codigo IS NULL),
      'dias', (SELECT COALESCE(SUM(dias),0) FROM f WHERE tipo_codigo='SUSPENSAO_DISCIPLINAR' OR tipo_codigo IS NULL)
    ),
    'abandono', jsonb_build_object(
      'quantidade', (SELECT COUNT(*) FROM f WHERE tipo_codigo='ABANDONO_EMPREGO'),
      'dias', (SELECT COALESCE(SUM(dias),0) FROM f WHERE tipo_codigo='ABANDONO_EMPREGO')
    )
  ) INTO v; RETURN v;
END $$;

-- ============ 7. COMUNICAÇÕES ============
CREATE OR REPLACE FUNCTION public.rel_comunicacoes(
  _inicio date, _fim date, _empresa_id uuid DEFAULT NULL, _projeto_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb;
BEGIN
  WITH f AS (
    SELECT co.* FROM comunicacoes co
    JOIN ausencias a ON a.id=co.ausencia_id
    WHERE co.created_at::date BETWEEN _inicio AND _fim
      AND (_empresa_id IS NULL OR a.empresa_id=_empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id=_projeto_id)
  )
  SELECT jsonb_build_object(
    'criadas', (SELECT COUNT(*) FROM f),
    'aprovadas', (SELECT COUNT(*) FROM f WHERE status='APROVADO' OR aprovado_em IS NOT NULL),
    'enviadas', (SELECT COUNT(*) FROM f WHERE status='ENVIADO'),
    'erros', (SELECT COUNT(*) FROM f WHERE status='ERRO'),
    'por_canal', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
      SELECT tipo::text AS canal, COUNT(*) AS total FROM f GROUP BY tipo
    ) x)
  ) INTO v; RETURN v;
END $$;

-- ============ 8. AUDITORIA ============
CREATE OR REPLACE FUNCTION public.rel_auditoria(
  _inicio date, _fim date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb;
BEGIN
  WITH f AS (
    SELECT * FROM audit_logs
    WHERE created_at::date BETWEEN _inicio AND _fim
  )
  SELECT jsonb_build_object(
    'logins', (SELECT COUNT(*) FROM f WHERE acao='LOGIN'),
    'logouts', (SELECT COUNT(*) FROM f WHERE acao='LOGOUT'),
    'exportacoes', (SELECT COUNT(*) FROM f WHERE acao='EXPORTACAO'),
    'downloads', (SELECT COUNT(*) FROM f WHERE acao='DOWNLOAD'),
    'alteracoes', (SELECT COUNT(*) FROM f WHERE acao IN ('CREATE','UPDATE','DELETE_LOGICO','MUDANCA_STATUS')),
    'acessos_negados', (SELECT COUNT(*) FROM f WHERE acao='ACESSO_NEGADO'),
    'por_modulo', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
      SELECT modulo, COUNT(*) AS total FROM f GROUP BY modulo
    ) x),
    'por_usuario', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb) FROM (
      SELECT COALESCE(usuario_nome,'(desconhecido)') AS usuario, COUNT(*) AS total
      FROM f GROUP BY usuario_nome ORDER BY COUNT(*) DESC LIMIT 20
    ) x)
  ) INTO v; RETURN v;
END $$;

GRANT EXECUTE ON FUNCTION public.rel_absenteismo(date,date,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rel_atestados(date,date,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rel_faltas(date,date,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rel_licencas(date,date,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rel_afastamentos_inss(date,date,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rel_medidas_administrativas(date,date,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rel_comunicacoes(date,date,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rel_auditoria(date,date) TO authenticated;
