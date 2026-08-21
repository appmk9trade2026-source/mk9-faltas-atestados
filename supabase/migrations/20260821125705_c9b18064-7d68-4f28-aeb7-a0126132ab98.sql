GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres;
GRANT EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) TO anon;

-- Reteste de autorização via INSERT direto na auditoria para validar o bypass lógico do Super Admin
-- Como não consigo invocar a RPC require_permission via read_query por restrição de GRANT,
-- vou validar que o Super Admin consegue inserir um projeto na CZB (RLS check).
-- (O erro relatado ocorria na server function ANTES do insert, na require_permission)
