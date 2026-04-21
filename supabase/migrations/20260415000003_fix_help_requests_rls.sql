-- Fix: allow group members to create help requests even when assigned_to is null
DROP POLICY IF EXISTS "Users can create own help requests" ON public.help_requests;

CREATE POLICY "Users can create own help requests"
  ON public.help_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = help_requests.group_id
        AND gm.user_id = auth.uid()
    )
  );
