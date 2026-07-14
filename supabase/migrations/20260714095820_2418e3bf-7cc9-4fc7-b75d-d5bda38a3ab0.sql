
-- delivery_requests: restrict SELECT to relevant roles
DROP POLICY IF EXISTS "All authenticated users can view delivery requests" ON public.delivery_requests;
CREATE POLICY "Relevant roles can view delivery requests"
  ON public.delivery_requests
  FOR SELECT
  TO authenticated
  USING (
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'sales'::app_role, 'warehouse'::app_role, 'purchasing'::app_role, 'finance'::app_role])
  );

-- delivery_comments: restrict SELECT to relevant roles
DROP POLICY IF EXISTS "read_comments" ON public.delivery_comments;
CREATE POLICY "read_comments"
  ON public.delivery_comments
  FOR SELECT
  TO authenticated
  USING (
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'sales'::app_role, 'warehouse'::app_role, 'purchasing'::app_role, 'finance'::app_role])
  );

-- po_tracker_comments: restrict SELECT to PO-related roles
DROP POLICY IF EXISTS "po_tracker_comments read" ON public.po_tracker_comments;
CREATE POLICY "po_tracker_comments read"
  ON public.po_tracker_comments
  FOR SELECT
  TO authenticated
  USING (
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'purchasing'::app_role, 'finance'::app_role])
  );
