DROP POLICY IF EXISTS "Usuários ativos veem próprio perfil" ON public.profiles;
CREATE POLICY "Usuários ativos veem próprio perfil" 
ON public.profiles 
FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Usuário vê próprios papéis" ON public.user_roles;
CREATE POLICY "Usuário vê próprios papéis" 
ON public.user_roles 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_roles TO service_role;