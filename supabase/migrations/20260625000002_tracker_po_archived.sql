-- Tabel untuk PO yang di-dismiss dari kolom In Stock
CREATE TABLE public.po_tracker_archived (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_order_id UUID NOT NULL UNIQUE
    REFERENCES plan_order_headers(id) ON DELETE CASCADE,
  archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.po_tracker_archived ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_tracker_archived_select" ON public.po_tracker_archived
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "po_tracker_archived_insert" ON public.po_tracker_archived
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'admin', 'purchasing')
    )
  );

CREATE POLICY "po_tracker_archived_delete" ON public.po_tracker_archived
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'admin', 'purchasing')
    )
  );
