-- 1. Garantir que registrado_por é uma FK para auth.users (isso ajuda o PostgREST)
ALTER TABLE public.ocorrencias_ponto 
DROP CONSTRAINT IF EXISTS ocorrencias_ponto_registrado_por_fkey,
ADD CONSTRAINT ocorrencias_ponto_registrado_por_fkey 
FOREIGN KEY (registrado_por) REFERENCES auth.users(id);

-- 2. Corrigir RLS de INSERT
DROP POLICY IF EXISTS "Criar ocorrencias" ON public.ocorrencias_ponto;
CREATE POLICY "Criar ocorrencias" 
ON public.ocorrencias_ponto 
FOR INSERT 
TO authenticated 
WITH CHECK (
  (auth.uid() = registrado_por) AND 
  (
    public.has_role(auth.uid(), 'rh') OR 
    public.has_role(auth.uid(), 'coordenador') OR 
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'super_admin')
  )
);

-- 3. Corrigir RLS de SELECT
DROP POLICY IF EXISTS "Ver ocorrencias permitidas" ON public.ocorrencias_ponto;
CREATE POLICY "Ver ocorrencias permitidas" 
ON public.ocorrencias_ponto 
FOR SELECT 
TO authenticated 
USING (
  public.has_role(auth.uid(), 'rh') OR 
  public.has_role(auth.uid(), 'coordenador') OR 
  public.has_role(auth.uid(), 'super_admin') OR
  (registrado_por = auth.uid())
);

-- 4. Grants extras
GRANT SELECT, INSERT, UPDATE ON public.ocorrencias_ponto TO authenticated;
GRANT ALL ON public.ocorrencias_ponto TO service_role;
