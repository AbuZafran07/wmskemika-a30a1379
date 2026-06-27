
ALTER TABLE public.plan_order_headers
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE TABLE IF NOT EXISTS public.po_tracker_archived (
  plan_order_id uuid PRIMARY KEY REFERENCES public.plan_order_headers(id) ON DELETE CASCADE,
  archived_by uuid,
  archived_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.po_tracker_archived TO authenticated;
GRANT ALL ON public.po_tracker_archived TO service_role;

ALTER TABLE public.po_tracker_archived ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view archived PO"
  ON public.po_tracker_archived FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'purchasing'::app_role, 'warehouse'::app_role]));

CREATE POLICY "Authorized users can manage archived PO"
  ON public.po_tracker_archived FOR ALL
  USING (auth.uid() IS NOT NULL AND public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'purchasing'::app_role]))
  WITH CHECK (auth.uid() IS NOT NULL AND public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'purchasing'::app_role]));
