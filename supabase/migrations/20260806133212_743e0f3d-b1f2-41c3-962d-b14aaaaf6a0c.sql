ALTER TABLE public.colaboradores 
ADD CONSTRAINT colaboradores_supervisor_profiles_fkey 
FOREIGN KEY (supervisor_usuario_id) 
REFERENCES public.profiles(id);
