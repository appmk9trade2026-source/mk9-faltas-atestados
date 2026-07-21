-- Diagnóstico de projetos duplicados/equivalentes por normalização.
-- Retorna, por empresa e chave lógica, todos os projetos que colidem com
-- métricas para o operador escolher o principal com segurança.
-- Somente super_admin ou rh podem consultar (contém dados sensíveis de escopo).

CREATE OR REPLACE FUNCTION public.diagnose_projetos_duplicados()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'Sem permissão para diagnosticar projetos duplicados.'
      USING ERRCODE='insufficient_privilege';
  END IF;

  WITH grupos AS (
    SELECT
      p.empresa_id,
      public.normalize_name(p.nome) AS chave,
      count(*) AS qtd
    FROM public.projetos p
    GROUP BY p.empresa_id, public.normalize_name(p.nome)
    HAVING count(*) > 1
  ),
  detalhes AS (
    SELECT
      g.empresa_id,
      g.chave,
      g.qtd,
      e.nome AS empresa_nome,
      jsonb_agg(
        jsonb_build_object(
          'projeto_id',       p.id,
          'nome',             p.nome,
          'nome_normalizado', public.normalize_name(p.nome),
          'codigo_interno',   p.codigo_interno,
          'codigo_protocolo', p.codigo_protocolo,
          'ativo',            p.ativo,
          'created_at',       p.created_at,
          'colaboradores',    (SELECT count(*) FROM public.colaboradores c WHERE c.projeto_id = p.id),
          'ausencias',        (SELECT count(*) FROM public.ausencias a WHERE a.projeto_id = p.id),
          'alertas',          (SELECT count(*) FROM public.alertas al WHERE al.projeto_id = p.id),
          'protocolos',       (SELECT count(*) FROM public.projeto_protocolo_sequencias s WHERE s.projeto_id = p.id),
          'usuarios',         (SELECT count(*) FROM public.usuario_projetos u WHERE u.projeto_id = p.id),
          'ultima_ausencia',  (SELECT max(a.created_at) FROM public.ausencias a WHERE a.projeto_id = p.id)
        ) ORDER BY p.created_at
      ) AS projetos
    FROM grupos g
    JOIN public.empresas e ON e.id = g.empresa_id
    JOIN public.projetos p
      ON p.empresa_id = g.empresa_id
     AND public.normalize_name(p.nome) = g.chave
    GROUP BY g.empresa_id, g.chave, g.qtd, e.nome
  )
  SELECT jsonb_build_object(
    'total_grupos', (SELECT count(*) FROM detalhes),
    'total_projetos_envolvidos', (SELECT coalesce(sum(qtd),0) FROM detalhes),
    'grupos', coalesce(jsonb_agg(
      jsonb_build_object(
        'empresa_id',   empresa_id,
        'empresa_nome', empresa_nome,
        'chave',        chave,
        'qtd',          qtd,
        'projetos',     projetos
      ) ORDER BY empresa_nome, chave
    ), '[]'::jsonb)
  ) INTO v_result
  FROM detalhes;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.diagnose_projetos_duplicados() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.diagnose_projetos_duplicados() TO authenticated;

COMMENT ON FUNCTION public.diagnose_projetos_duplicados() IS
'Fase A — Diagnóstico read-only: agrupa projetos equivalentes por empresa_id + normalize_name(nome). Não altera dados.';