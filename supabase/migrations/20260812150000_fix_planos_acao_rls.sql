-- Grant select access to authenticated users to avoid permission denied on joins
GRANT SELECT ON public.plano_acao_acompanhamentos TO authenticated;
GRANT ALL ON public.plano_acao_acompanhamentos TO service_role;

-- Ensure RLS is enabled
ALTER TABLE public.plano_acao_acompanhamentos ENABLE ROW LEVEL SECURITY;

-- Drop existing if any to avoid conflicts during manual re-run
DROP POLICY IF EXISTS "Users can view check-ins for their accessible plans" ON public.plano_acao_acompanhamentos;
DROP POLICY IF EXISTS "Users can insert check-ins for their accessible plans" ON public.plano_acao_acompanhamentos;

-- Policy: Select check-ins if the user has access to the parent plan
CREATE POLICY "Users can view check-ins for their accessible plans"
ON public.plano_acao_acompanhamentos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.planos_acao pa
    WHERE pa.id = public.plano_acao_acompanhamentos.plano_id
  )
);

-- Policy: Insert check-ins (Logic: same as view, RLS on planos_acao already handles scope)
CREATE POLICY "Users can insert check-ins for their accessible plans"
ON public.plano_acao_acompanhamentos
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.planos_acao pa
    WHERE pa.id = public.plano_acao_acompanhamentos.plano_id
  )
);
