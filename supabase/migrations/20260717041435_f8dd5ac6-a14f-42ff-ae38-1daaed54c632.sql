
-- Add calibration/service order columns to sales_order_headers
ALTER TABLE public.sales_order_headers
  ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS spk_number TEXT,
  ADD COLUMN IF NOT EXISTS spk_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS target_completion_date DATE,
  ADD COLUMN IF NOT EXISTS service_location TEXT,
  ADD COLUMN IF NOT EXISTS service_pic_name TEXT,
  ADD COLUMN IF NOT EXISTS service_pic_phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS sales_order_headers_spk_number_unique
  ON public.sales_order_headers (spk_number) WHERE spk_number IS NOT NULL;

-- calibration_items
CREATE TABLE IF NOT EXISTS public.calibration_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_order_headers(id) ON DELETE CASCADE,
  item_number INT NOT NULL,
  instrument_name TEXT NOT NULL,
  brand_model TEXT,
  serial_number TEXT,
  measurement_range TEXT,
  calibration_method TEXT,
  sla_working_days INT NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  received_date DATE,
  condition_notes TEXT,
  feasibility_status TEXT NOT NULL DEFAULT 'pending' CHECK (feasibility_status IN ('pending','feasible','not_feasible')),
  feasibility_notes TEXT,
  certificate_number TEXT,
  certificate_issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calibration_items TO authenticated;
GRANT ALL ON public.calibration_items TO service_role;
ALTER TABLE public.calibration_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calibration_items authenticated all"
  ON public.calibration_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS calibration_items_so_idx ON public.calibration_items(sales_order_id);

-- calibration_tracker_checklists
CREATE TABLE IF NOT EXISTS public.calibration_tracker_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_order_headers(id) ON DELETE CASCADE,
  checklist_key TEXT NOT NULL,
  is_checked BOOLEAN NOT NULL DEFAULT false,
  checked_by UUID REFERENCES auth.users(id),
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sales_order_id, checklist_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calibration_tracker_checklists TO authenticated;
GRANT ALL ON public.calibration_tracker_checklists TO service_role;
ALTER TABLE public.calibration_tracker_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calibration_tracker_checklists authenticated all"
  ON public.calibration_tracker_checklists FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- calibration_tracker_comments
CREATE TABLE IF NOT EXISTS public.calibration_tracker_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_order_headers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'comment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calibration_tracker_comments TO authenticated;
GRANT ALL ON public.calibration_tracker_comments TO service_role;
ALTER TABLE public.calibration_tracker_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calibration_tracker_comments read auth"
  ON public.calibration_tracker_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "calibration_tracker_comments insert own"
  ON public.calibration_tracker_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "calibration_tracker_comments update own"
  ON public.calibration_tracker_comments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "calibration_tracker_comments delete own"
  ON public.calibration_tracker_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS calibration_tracker_comments_so_idx ON public.calibration_tracker_comments(sales_order_id);

-- updated_at trigger for calibration_items
CREATE TRIGGER calibration_items_updated_at
  BEFORE UPDATE ON public.calibration_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
