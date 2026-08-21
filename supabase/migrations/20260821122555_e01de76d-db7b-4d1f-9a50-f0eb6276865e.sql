ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id);
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
COMMENT ON COLUMN public.support_tickets.resolved_by IS 'ID do atendente (RH/Admin) que resolveu o chamado.';
