
-- Refazer a FK de supervisor_usuario_id para profiles para facilitar o JOIN do PostgREST
ALTER TABLE public.ocorrencias_ponto DROP CONSTRAINT IF EXISTS ocorrencias_ponto_supervisor_usuario_id_fkey;
ALTER TABLE public.ocorrencias_ponto 
ADD CONSTRAINT ocorrencias_ponto_supervisor_usuario_id_fkey 
FOREIGN KEY (supervisor_usuario_id) REFERENCES public.profiles(id);
