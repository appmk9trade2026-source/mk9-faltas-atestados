-- Atualizar política de inserção de eventos para permitir MESSAGE_SENT por solicitantes
DROP POLICY IF EXISTS "Users can create audit events for their own tickets" ON public.support_ticket_events;

CREATE POLICY "Users can create audit events for their own tickets"
ON public.support_ticket_events
FOR INSERT
TO authenticated
WITH CHECK (
  (actor_user_id = auth.uid() AND event_type IN ('TICKET_CREATED', 'MESSAGE_SENT', 'TICKET_REOPENED'))
  OR (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'rh'))
);
