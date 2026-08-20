-- Migration Parte 4C: Correção da Auditoria de Tickets
-- 1. Grant de permissões na tabela support_ticket_events
GRANT SELECT, INSERT, UPDATE ON public.support_ticket_events TO authenticated;
GRANT ALL ON public.support_ticket_events TO service_role;

-- 2. Garantir que RLS está habilitado
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;

-- 3. Criar política de INSERT para usuários autenticados (apenas TICKET_CREATED para seus próprios tickets)
CREATE POLICY "Users can create audit events for their own tickets"
ON public.support_ticket_events
FOR INSERT
TO authenticated
WITH CHECK (
  (event_type = 'TICKET_CREATED' AND actor_user_id = auth.uid()) OR
  (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'rh'))
);

-- 4. Criar política de SELECT para transparência (usuário vê eventos de seus tickets)
CREATE POLICY "Users can view audit events for their own tickets"
ON public.support_ticket_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = ticket_id 
    AND (t.requester_user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'rh'))
  )
);
