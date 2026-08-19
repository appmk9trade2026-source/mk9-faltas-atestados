
-- Refresh de privilégios e políticas para garantir visibilidade imediata
GRANT SELECT ON public.audit_stability_results TO authenticated;
GRANT ALL ON public.audit_stability_results TO service_role;

-- Garantir que a política permita leitura para super_admin (já existe, mas forçamos refresh lógico)
ALTER TABLE public.audit_stability_results ENABLE ROW LEVEL SECURITY;
