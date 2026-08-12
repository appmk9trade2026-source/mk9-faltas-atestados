-- 1. Adicionar novas colunas
ALTER TABLE public.planos_acao 
ADD COLUMN IF NOT EXISTS indicador_sucesso text,
ADD COLUMN IF NOT EXISTS supervisor_usuario_id uuid REFERENCES public.profiles(id);

-- 2. Preencher indicador para registros existentes
UPDATE public.planos_acao SET indicador_sucesso = 'Definido na implantação' WHERE indicador_sucesso IS NULL;
ALTER TABLE public.planos_acao ALTER COLUMN indicador_sucesso SET NOT NULL;

-- 3. Atualizar Constraints
ALTER TABLE public.planos_acao DROP CONSTRAINT IF EXISTS planos_acao_projeto_alvo_check;
ALTER TABLE public.planos_acao ADD CONSTRAINT planos_acao_projeto_alvo_check 
CHECK (
  (tipo_alvo = 'PROJETO'::tipo_alvo_plano AND supervisor_usuario_id IS NULL AND colaborador_id IS NULL) OR
  (tipo_alvo = 'SUPERVISOR'::tipo_alvo_plano AND supervisor_usuario_id IS NOT NULL AND colaborador_id IS NULL) OR
  (tipo_alvo = 'COLABORADOR'::tipo_alvo_plano AND supervisor_usuario_id IS NOT NULL AND colaborador_id IS NOT NULL)
);

-- 4. Grant permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planos_acao TO authenticated;
GRANT ALL ON public.planos_acao TO service_role;
