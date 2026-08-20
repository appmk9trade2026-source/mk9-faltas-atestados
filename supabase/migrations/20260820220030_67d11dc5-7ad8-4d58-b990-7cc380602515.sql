DROP POLICY IF EXISTS "Users can view their own tickets" ON public.support_tickets;

CREATE POLICY "Users can view their own tickets"
ON public.support_tickets
FOR SELECT
TO authenticated
USING (
  (auth.uid() = requester_user_id) OR 
  public.has_role(auth.uid(), 'super_admin') OR 
  (public.has_role(auth.uid(), 'rh') AND (assigned_user_id = auth.uid() OR assigned_user_id IS NULL))
);
