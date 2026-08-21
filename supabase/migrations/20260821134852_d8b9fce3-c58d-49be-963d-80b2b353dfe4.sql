-- Migration emergencial para corrigir privilégios de execução
-- Alvo: SUPER_ADMIN_PROJECT_CREATE_BLOCKED_REOPENED
-- Foco: supabase_read_only_user (usado por ferramentas externas) e roles operacionais

-- 1. Garantir que o usuário de leitura/ferramentas tenha acesso (necessário para retestes)
GRANT EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.rbac_log_deny(public.audit_action, text, text, uuid, uuid, uuid, text) TO supabase_read_only_user;

-- 2. Reforçar para authenticated e service_role
GRANT EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rbac_log_deny(public.audit_action, text, text, uuid, uuid, uuid, text) TO authenticated, service_role;

-- 3. Anon (apenas a entrada)
GRANT EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) TO anon;

-- 4. Garantir que o schema esteja acessível a todos os envolvidos
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role, supabase_read_only_user;
