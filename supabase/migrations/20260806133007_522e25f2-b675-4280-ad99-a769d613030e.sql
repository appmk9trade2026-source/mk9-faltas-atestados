-- Corrigir visibilidade de perfis para RH/Compliance/Super Admin
-- A política atual 'Usuários ativos veem próprio perfil' é restritiva.
-- Adicionaremos uma política específica para permitir que papéis administrativos vejam perfis
-- envolvidos em ausências que eles já têm permissão para processar.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'RH/Compliance veem supervisores de ausencias acessiveis' AND tablename = 'profiles') THEN
        DROP POLICY "RH/Compliance veem supervisores de ausencias acessiveis" ON public.profiles;
    END IF;
END
$$;

CREATE POLICY "RH/Compliance/Admin veem perfis via ausencias"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin') OR 
  has_role(auth.uid(), 'rh') OR 
  has_role(auth.uid(), 'compliance') OR
  (auth.uid() = id) OR
  EXISTS (
    SELECT 1 FROM public.colaboradores c
    WHERE c.supervisor_usuario_id = public.profiles.id
  )
);

-- Garantir privilégios
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
