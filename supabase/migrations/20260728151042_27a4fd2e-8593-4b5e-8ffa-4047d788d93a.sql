CREATE OR REPLACE FUNCTION public.dashboard_desempenho_positivo(_inicio date, _fim date, _empresa_id uuid DEFAULT NULL::uuid, _projeto_id uuid DEFAULT NULL::uuid, _min_colaboradores integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_min int := GREATEST(COALESCE(_min_colaboradores, 5), 1);
  v_sup jsonb; v_emp jsonb; v_proj jsonb; v_colab jsonb;
BEGIN
  -- Base compartilhada: colaboradores ativos no escopo (RLS do chamador se aplica)
  WITH colabs AS (
    SELECT c.id, c.empresa_id, c.projeto_id,
           c.supervisor_usuario_id, c.supervisor_nome,
           e.nome AS empresa_nome, p.nome AS projeto_nome
    FROM public.colaboradores c
    JOIN public.empresas e ON e.id = c.empresa_id
    JOIN public.projetos p ON p.id = c.projeto_id
    WHERE c.ativo = true
      AND (_empresa_id IS NULL OR c.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR c.projeto_id = _projeto_id)
  ),
  aus AS (
    SELECT a.colaborador_id, a.status, a.registrado_em, a.lancado_em
    FROM public.ausencias a
    WHERE a.data_inicio <= _fim AND a.data_fim >= _inicio
      AND a.colaborador_id IS NOT NULL
      AND (_empresa_id IS NULL OR a.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id = _projeto_id)
  ),
  sup_colabs AS (
    SELECT
      COALESCE(c.supervisor_usuario_id::text, 'nome:' || lower(btrim(c.supervisor_nome))) AS chave,
      c.id AS colab_id,
      COALESCE(NULLIF(btrim(c.supervisor_nome), ''), '(Sem supervisor)') AS sup_nome,
      c.empresa_nome, c.projeto_nome
    FROM colabs c
    WHERE c.supervisor_usuario_id IS NOT NULL
       OR NULLIF(btrim(c.supervisor_nome), '') IS NOT NULL
  ),
  sup_agg AS (
    SELECT
      sc.chave,
      MODE() WITHIN GROUP (ORDER BY sc.sup_nome) AS nome,
      MODE() WITHIN GROUP (ORDER BY sc.empresa_nome) AS empresa_nome,
      MODE() WITHIN GROUP (ORDER BY sc.projeto_nome) AS projeto_nome,
      COUNT(DISTINCT sc.colab_id) AS colaboradores,
      COUNT(a.colaborador_id) AS ocorrencias,
      COUNT(a.colaborador_id) FILTER (WHERE a.status = 'PENDENTE') AS pendencias,
      COUNT(a.colaborador_id) FILTER (WHERE a.lancado_em IS NOT NULL) AS lancadas,
      COUNT(a.colaborador_id) FILTER (
        WHERE a.lancado_em IS NOT NULL
          AND a.lancado_em <= a.registrado_em + interval '24 hours'
      ) AS no_prazo,
      AVG(EXTRACT(EPOCH FROM (a.lancado_em - a.registrado_em)) / 3600.0)
        FILTER (WHERE a.lancado_em IS NOT NULL) AS tempo_medio_h
    FROM sup_colabs sc
    LEFT JOIN aus a ON a.colaborador_id = sc.colab_id
    GROUP BY sc.chave
    HAVING COUNT(DISTINCT sc.colab_id) >= v_min
  ),
  sup_norm AS (
    SELECT s.*,
      (s.ocorrencias::numeric / s.colaboradores) * 100 AS taxa,
      (s.pendencias::numeric / s.colaboradores) * 100 AS taxa_pendencia,
      CASE WHEN s.lancadas > 0 THEN (s.no_prazo::numeric / s.lancadas) * 100 END AS pct_prazo
    FROM sup_agg s
  ),
  sup_score AS (
    SELECT n.*,
      ROUND((
        50 * (1 - COALESCE(
          CASE WHEN MAX(n.taxa) OVER () > MIN(n.taxa) OVER ()
            THEN (n.taxa - MIN(n.taxa) OVER ()) / (MAX(n.taxa) OVER () - MIN(n.taxa) OVER ())
            ELSE 0 END, 0))
      + 20 * (1 - COALESCE(
          CASE WHEN MAX(n.taxa_pendencia) OVER () > MIN(n.taxa_pendencia) OVER ()
            THEN (n.taxa_pendencia - MIN(n.taxa_pendencia) OVER ()) / (MAX(n.taxa_pendencia) OVER () - MIN(n.taxa_pendencia) OVER ())
            ELSE 0 END, 0))
      + 20 * COALESCE(n.pct_prazo / 100.0, 0.5)
      + 10 * (1 - COALESCE(
          CASE WHEN MAX(n.tempo_medio_h) OVER () > MIN(n.tempo_medio_h) OVER ()
            THEN (n.tempo_medio_h - MIN(n.tempo_medio_h) OVER ()) / (MAX(n.tempo_medio_h) OVER () - MIN(n.tempo_medio_h) OVER ())
            ELSE 0.5 END, 0.5))
      )::numeric, 1) AS score
    FROM sup_norm n
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_sup
  FROM (
    SELECT chave, nome, empresa_nome, projeto_nome, colaboradores, ocorrencias,
           pendencias, lancadas, no_prazo,
           ROUND(taxa::numeric, 1) AS taxa,
           ROUND(pct_prazo::numeric, 1) AS pct_prazo,
           ROUND(tempo_medio_h::numeric, 1) AS tempo_medio_h,
           score
    FROM sup_score
    ORDER BY score DESC, taxa ASC, colaboradores DESC, nome ASC
    LIMIT 10
  ) t;

  -- Empresas
  WITH colabs AS (
    SELECT c.id, c.empresa_id, e.nome AS empresa_nome
    FROM public.colaboradores c
    JOIN public.empresas e ON e.id = c.empresa_id
    WHERE c.ativo = true
      AND (_empresa_id IS NULL OR c.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR c.projeto_id = _projeto_id)
  ),
  aus AS (
    SELECT a.colaborador_id, a.status
    FROM public.ausencias a
    WHERE a.data_inicio <= _fim AND a.data_fim >= _inicio
      AND a.colaborador_id IS NOT NULL
      AND (_empresa_id IS NULL OR a.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id = _projeto_id)
  ),
  agg AS (
    SELECT c.empresa_id AS id, MIN(c.empresa_nome) AS nome,
           COUNT(DISTINCT c.id) AS colaboradores,
           COUNT(a.colaborador_id) AS ocorrencias,
           COUNT(a.colaborador_id) FILTER (WHERE a.status = 'PENDENTE') AS pendencias
    FROM colabs c
    LEFT JOIN aus a ON a.colaborador_id = c.id
    GROUP BY c.empresa_id
    HAVING COUNT(DISTINCT c.id) >= v_min
  ),
  norm AS (
    SELECT g.*, (g.ocorrencias::numeric / g.colaboradores) * 100 AS taxa,
           (g.pendencias::numeric / g.colaboradores) * 100 AS taxa_pendencia
    FROM agg g
  ),
  scored AS (
    SELECT n.*, ROUND((
        70 * (1 - COALESCE(CASE WHEN MAX(n.taxa) OVER () > MIN(n.taxa) OVER ()
          THEN (n.taxa - MIN(n.taxa) OVER ()) / (MAX(n.taxa) OVER () - MIN(n.taxa) OVER ()) ELSE 0 END, 0))
      + 30 * (1 - COALESCE(CASE WHEN MAX(n.taxa_pendencia) OVER () > MIN(n.taxa_pendencia) OVER ()
          THEN (n.taxa_pendencia - MIN(n.taxa_pendencia) OVER ()) / (MAX(n.taxa_pendencia) OVER () - MIN(n.taxa_pendencia) OVER ()) ELSE 0 END, 0))
      )::numeric, 1) AS score
    FROM norm n
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_emp
  FROM (
    SELECT id, nome, colaboradores, ocorrencias, pendencias,
           ROUND(taxa::numeric, 1) AS taxa, score
    FROM scored
    ORDER BY score DESC, taxa ASC, colaboradores DESC, nome ASC
    LIMIT 10
  ) t;

  -- Projetos
  WITH colabs AS (
    SELECT c.id, c.projeto_id, p.nome AS projeto_nome, e.nome AS empresa_nome
    FROM public.colaboradores c
    JOIN public.projetos p ON p.id = c.projeto_id
    JOIN public.empresas e ON e.id = c.empresa_id
    WHERE c.ativo = true
      AND (_empresa_id IS NULL OR c.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR c.projeto_id = _projeto_id)
  ),
  aus AS (
    SELECT a.colaborador_id, a.status
    FROM public.ausencias a
    WHERE a.data_inicio <= _fim AND a.data_fim >= _inicio
      AND a.colaborador_id IS NOT NULL
      AND (_empresa_id IS NULL OR a.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id = _projeto_id)
  ),
  agg AS (
    SELECT c.projeto_id AS id, MIN(c.projeto_nome) AS nome, MIN(c.empresa_nome) AS empresa_nome,
           COUNT(DISTINCT c.id) AS colaboradores,
           COUNT(a.colaborador_id) AS ocorrencias,
           COUNT(a.colaborador_id) FILTER (WHERE a.status = 'PENDENTE') AS pendencias
    FROM colabs c
    LEFT JOIN aus a ON a.colaborador_id = c.id
    GROUP BY c.projeto_id
    HAVING COUNT(DISTINCT c.id) >= v_min
  ),
  norm AS (
    SELECT g.*, (g.ocorrencias::numeric / g.colaboradores) * 100 AS taxa,
           (g.pendencias::numeric / g.colaboradores) * 100 AS taxa_pendencia
    FROM agg g
  ),
  scored AS (
    SELECT n.*, ROUND((
        70 * (1 - COALESCE(CASE WHEN MAX(n.taxa) OVER () > MIN(n.taxa) OVER ()
          THEN (n.taxa - MIN(n.taxa) OVER ()) / (MAX(n.taxa) OVER () - MIN(n.taxa) OVER ()) ELSE 0 END, 0))
      + 30 * (1 - COALESCE(CASE WHEN MAX(n.taxa_pendencia) OVER () > MIN(n.taxa_pendencia) OVER ()
          THEN (n.taxa_pendencia - MIN(n.taxa_pendencia) OVER ()) / (MAX(n.taxa_pendencia) OVER () - MIN(n.taxa_pendencia) OVER ()) ELSE 0 END, 0))
      )::numeric, 1) AS score
    FROM norm n
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_proj
  FROM (
    SELECT id, nome, empresa_nome, colaboradores, ocorrencias, pendencias,
           ROUND(taxa::numeric, 1) AS taxa, score
    FROM scored
    ORDER BY score DESC, taxa ASC, colaboradores DESC, nome ASC
    LIMIT 10
  ) t;

  -- Conformidade de colaboradores (resumo agregado, sem ranking individual)
  WITH colabs AS (
    SELECT c.id
    FROM public.colaboradores c
    WHERE c.ativo = true
      AND (_empresa_id IS NULL OR c.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR c.projeto_id = _projeto_id)
  ),
  aus AS (
    SELECT DISTINCT a.colaborador_id
    FROM public.ausencias a
    WHERE a.data_inicio <= _fim AND a.data_fim >= _inicio
      AND a.colaborador_id IS NOT NULL
      AND (_empresa_id IS NULL OR a.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id = _projeto_id)
  )
  SELECT jsonb_build_object(
    'total_ativos', (SELECT COUNT(*) FROM colabs),
    'conformes', (SELECT COUNT(*) FROM colabs c WHERE NOT EXISTS (SELECT 1 FROM aus a WHERE a.colaborador_id = c.id)),
    'com_ocorrencia', (SELECT COUNT(*) FROM colabs c WHERE EXISTS (SELECT 1 FROM aus a WHERE a.colaborador_id = c.id)),
    'ranking_disponivel', false
  ) INTO v_colab;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('inicio', _inicio, 'fim', _fim),
    'min_colaboradores', v_min,
    'supervisores', COALESCE(v_sup, '[]'::jsonb),
    'empresas', COALESCE(v_emp, '[]'::jsonb),
    'projetos', COALESCE(v_proj, '[]'::jsonb),
    'colaboradores', COALESCE(v_colab, '{}'::jsonb)
  );
END $function$;

REVOKE ALL ON FUNCTION public.dashboard_desempenho_positivo(date, date, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_desempenho_positivo(date, date, uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_desempenho_positivo(date, date, uuid, uuid, integer) TO service_role;