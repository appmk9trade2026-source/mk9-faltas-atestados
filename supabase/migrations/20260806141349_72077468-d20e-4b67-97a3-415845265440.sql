-- ETAPA 1: Garantir permissões de SELECT para o papel authenticated
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

-- ETAPA 2: Simplificar RLS para o perfil próprio
DROP POLICY IF EXISTS "Usuários ativos veem próprio perfil" ON public.profiles;
CREATE POLICY "Usuário vê próprio perfil"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- ETAPA 3: Garantir que papéis possam ser lidos
DROP POLICY IF EXISTS "Usuário vê próprios papéis" ON public.user_roles;
CREATE POLICY "Usuário vê próprios papéis"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);