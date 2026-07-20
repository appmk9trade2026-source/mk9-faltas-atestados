
DROP FUNCTION IF EXISTS public.get_projetos_ativos_por_empresa(uuid);
CREATE FUNCTION public.get_projetos_ativos_por_empresa(_empresa_id uuid)
RETURNS TABLE (id uuid, nome text, codigo_protocolo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nome, p.codigo_protocolo
    FROM public.projetos p
   WHERE p.empresa_id = _empresa_id AND p.ativo = true
   ORDER BY p.nome ASC;
$$;
REVOKE ALL ON FUNCTION public.get_projetos_ativos_por_empresa(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_projetos_ativos_por_empresa(uuid) TO authenticated, service_role;
