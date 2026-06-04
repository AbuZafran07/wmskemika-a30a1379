DROP POLICY IF EXISTS "Audit logs insert via trusted functions only" ON public.audit_logs;

CREATE POLICY "Users can insert their own audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());