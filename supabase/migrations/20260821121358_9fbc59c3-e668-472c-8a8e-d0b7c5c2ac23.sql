
ALTER TABLE public.support_messages ADD COLUMN read_at timestamp with time zone;
COMMENT ON COLUMN public.support_messages.read_at IS 'Timestamp de quando a mensagem foi lida pelo destinatário.';

GRANT UPDATE (read_at) ON public.support_messages TO authenticated;

CREATE POLICY "Users can mark messages as read" 
ON public.support_messages 
FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets 
    WHERE public.support_tickets.id = public.support_messages.ticket_id 
    AND (
      (public.support_tickets.requester_user_id = auth.uid()) OR 
      (public.support_tickets.assigned_user_id = auth.uid()) OR 
      has_role(auth.uid(), 'super_admin')
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.support_tickets 
    WHERE public.support_tickets.id = public.support_messages.ticket_id 
    AND (
      (public.support_tickets.requester_user_id = auth.uid()) OR 
      (public.support_tickets.assigned_user_id = auth.uid()) OR 
      has_role(auth.uid(), 'super_admin')
    )
  )
);
