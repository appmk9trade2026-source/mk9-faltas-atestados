-- Migration para corrigir privilégios de execução na cadeia RBAC
-- Alvo: SUPER_ADMIN_PROJECT_CREATE_BLOCKED_REOPENED
-- Causa: Falha de EXECUTE permission mesmo com ACLs aparentes

-- 1. Revogar para limpar possíveis inconsistências de cache/estado
REVOKE EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) FROM public, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM public, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.rbac_log_deny(public.audit_action, text, text, uuid, uuid, uuid, text) FROM public, authenticated, anon;

-- 2. Conceder privilégios explicitamente para authenticated e service_role
-- require_permission é a entrada principal
GRANT EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) TO authenticated, service_role;

-- has_permission e has_role são helpers internos chamados por require_permission
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- rbac_log_deny é chamada em falhas
GRANT EXECUTE ON FUNCTION public.rbac_log_deny(public.audit_action, text, text, uuid, uuid, uuid, text) TO authenticated, service_role;

-- 3. Conceder apenas o necessário para anon (require_permission)
GRANT EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) TO anon;

-- Garantir privilégios no schema public
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
