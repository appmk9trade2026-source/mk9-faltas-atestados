
-- Fase C: Prevenção de projetos equivalentes
-- 1) Função canônica de checagem de equivalente ATIVO (por empresa + nome_normalizado)
CREATE OR REPLACE FUNCTION public.check_projeto_equivalente(
  _empresa_id uuid,
  _nome text,
  _exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  nome text,
  codigo_interno text,
  codigo_protocolo text,
  ativo boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome, p.codigo_interno, p.codigo_protocolo, p.ativo, p.created_at
  FROM public.projetos p
  WHERE p.empresa_id = _empresa_id
    AND p.ativo = true
    AND public.normalize_name(p.nome) = public.normalize_name(_nome)
    AND (_exclude_id IS NULL OR p.id <> _exclude_id)
  ORDER BY p.created_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.check_projeto_equivalente(uuid, text, uuid) TO authenticated, service_role;

-- 2) Relatório de colisões ATIVAS remanescentes por empresa_id + nome_normalizado
CREATE OR REPLACE FUNCTION public.report_projetos_colisoes_ativas()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH grupos AS (
    SELECT
      p.empresa_id,
      public.normalize_name(p.nome) AS nome_normalizado,
      COUNT(*) AS total,
      jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'codigo_interno', p.codigo_interno,
        'codigo_protocolo', p.codigo_protocolo,
        'created_at', p.created_at
      ) ORDER BY p.created_at) AS projetos
    FROM public.projetos p
    WHERE p.ativo = true
    GROUP BY p.empresa_id, public.normalize_name(p.nome)
    HAVING COUNT(*) > 1
  )
  SELECT jsonb_build_object(
    'total_grupos', COALESCE(COUNT(*), 0),
    'total_projetos_envolvidos', COALESCE(SUM(g.total), 0),
    'grupos', COALESCE(jsonb_agg(jsonb_build_object(
      'empresa_id', g.empresa_id,
      'empresa_nome', e.nome,
      'nome_normalizado', g.nome_normalizado,
      'total', g.total,
      'projetos', g.projetos
    ) ORDER BY e.nome, g.nome_normalizado), '[]'::jsonb)
  )
  FROM grupos g
  LEFT JOIN public.empresas e ON e.id = g.empresa_id;
$$;

GRANT EXECUTE ON FUNCTION public.report_projetos_colisoes_ativas() TO authenticated, service_role;
