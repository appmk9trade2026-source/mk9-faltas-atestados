-- Adicionar colunas de processamento/análise se não existirem
ALTER TABLE public.ocorrencias_ponto 
ADD COLUMN IF NOT EXISTS parecer_processamento text,
ADD COLUMN IF NOT EXISTS processado_por uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS processado_em timestamptz;

-- Garantir que a RLS permita UPDATE apenas para perfis autorizados
-- A política "Processar ocorrencias" já existe, vamos reforçá-la ou ajustá-la se necessário
DROP POLICY IF EXISTS "Processar ocorrencias" ON public.ocorrencias_ponto;
CREATE POLICY "Processar ocorrencias" ON public.ocorrencias_ponto
  FOR UPDATE
  TO authenticated
  USING (
    (has_role(auth.uid(), 'rh'::app_role) OR 
     has_role(auth.uid(), 'coordenador'::app_role) OR 
     has_role(auth.uid(), 'super_admin'::app_role))
    AND status = 'PENDENTE'
  );

-- Garantir SELECT amplo para RH/Coord/Admin e restrito para Supervisor
DROP POLICY IF EXISTS "Ver ocorrencias permitidas" ON public.ocorrencias_ponto;
CREATE POLICY "Ver ocorrencias permitidas" ON public.ocorrencias_ponto
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'rh'::app_role) OR 
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    (has_role(auth.uid(), 'coordenador'::app_role) AND EXISTS (
        -- Coordenador vê projetos da sua coordenação (lógica simplificada via profiles)
        SELECT 1 FROM public.profiles p 
        WHERE p.id = auth.uid() 
        AND (p.empresa_id = ocorrencias_ponto.empresa_id)
    )) OR 
    (registrado_por = auth.uid()) OR
    (supervisor_usuario_id = auth.uid())
  );
