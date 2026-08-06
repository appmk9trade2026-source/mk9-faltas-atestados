-- Revogando privilégios amplos concedidos anteriormente (reset para segurança)
REVOKE ALL ON public.profiles FROM authenticated;
REVOKE ALL ON public.user_roles FROM authenticated;
REVOKE ALL ON public.empresas FROM authenticated;
REVOKE ALL ON public.projetos FROM authenticated;
REVOKE ALL ON public.colaboradores FROM authenticated;
REVOKE ALL ON public.ausencias FROM authenticated;

-- 1. PROFILES: SELECT (login/leitura), UPDATE (perfil próprio/admin via policy)
-- RLS garante que um usuário só dê UPDATE no próprio profile ou Admin em qualquer um.
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 2. USER_ROLES: SELECT somente (leitura de papel para UI/RBAC)
-- Escrita via RPC ou Admin somente (RLS atual já bloqueia, mas restringimos o GRANT)
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- 3. EMPRESAS: SELECT (filtros/dashboards)
-- Escrita via Super Admin somente (via policy).
GRANT SELECT ON public.empresas TO authenticated;
GRANT ALL ON public.empresas TO service_role;

-- 4. PROJETOS: SELECT (filtros/dashboards)
-- Escrita via RPC (import_projetos_atomic) ou Admin.
GRANT SELECT ON public.projetos TO authenticated;
GRANT ALL ON public.projetos TO service_role;

-- 5. COLABORADORES: SELECT, INSERT, UPDATE
-- Necessário para o fluxo manual de supervisores/coordenadores.
GRANT SELECT, INSERT, UPDATE ON public.colaboradores TO authenticated;
GRANT ALL ON public.colaboradores TO service_role;

-- 6. AUSENCIAS: SELECT, INSERT, UPDATE
-- Fluxo central do app. DELETE não é usado no frontend (apenas inativação ou retificação).
GRANT SELECT, INSERT, UPDATE ON public.ausencias TO authenticated;
GRANT ALL ON public.ausencias TO service_role;

-- Garantia de RLS ativa
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ausencias ENABLE ROW LEVEL SECURITY;
