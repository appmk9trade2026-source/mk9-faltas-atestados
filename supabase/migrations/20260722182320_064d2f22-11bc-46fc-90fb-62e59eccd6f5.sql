
-- 1) Coluna de vínculo direto Supervisor → Colaborador
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS supervisor_usuario_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS colaboradores_supervisor_usuario_idx
  ON public.colaboradores (supervisor_usuario_id)
  WHERE supervisor_usuario_id IS NOT NULL;

-- 2) Substitui a policy SELECT do supervisor por vínculo direto (fail-closed)
DROP POLICY IF EXISTS colaboradores_supervisor_scoped_select ON public.colaboradores;

CREATE POLICY colaboradores_supervisor_direct_select
  ON public.colaboradores
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND ativo = true
    AND supervisor_usuario_id IS NOT NULL
    AND supervisor_usuario_id = auth.uid()
  );
