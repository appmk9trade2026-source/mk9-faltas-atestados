
-- RPC para resolver nomes de supervisores visíveis ao chamador,
-- respeitando RLS de colaboradores (fonte oficial de vínculo).

CREATE OR REPLACE FUNCTION public.get_supervisor_ids_visiveis()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT supervisor_usuario_id
  FROM public.colaboradores
  WHERE supervisor_usuario_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_supervisor_ids_visiveis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_supervisor_ids_visiveis() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_supervisores_visiveis()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, COALESCE(NULLIF(TRIM(p.nome), ''), p.email, 'Supervisor sem nome') AS nome
  FROM public.profiles p
  WHERE p.id IN (SELECT public.get_supervisor_ids_visiveis())
  ORDER BY nome;
$$;

REVOKE ALL ON FUNCTION public.get_supervisores_visiveis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_supervisores_visiveis() TO authenticated;
