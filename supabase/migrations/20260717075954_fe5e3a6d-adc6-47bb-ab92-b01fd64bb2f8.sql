
-- calibration_receipts
CREATE TABLE IF NOT EXISTS public.calibration_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  spk_number TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  service_pic_name TEXT,
  service_pic_phone TEXT,
  service_location TEXT,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  target_completion_date DATE,
  customer_request_notes TEXT,
  sales_order_id UUID REFERENCES public.sales_order_headers(id) ON DELETE SET NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calibration_receipts TO authenticated;
GRANT ALL ON public.calibration_receipts TO service_role;
ALTER TABLE public.calibration_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cal_receipts_all" ON public.calibration_receipts;
CREATE POLICY "cal_receipts_all" ON public.calibration_receipts FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse','sales','purchasing','finance']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse','sales','purchasing','finance']::app_role[]));

DROP TRIGGER IF EXISTS trg_cal_receipts_updated ON public.calibration_receipts;
CREATE TRIGGER trg_cal_receipts_updated BEFORE UPDATE ON public.calibration_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- calibration_instruments
CREATE TABLE IF NOT EXISTS public.calibration_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_receipt_id UUID NOT NULL REFERENCES public.calibration_receipts(id) ON DELETE CASCADE,
  item_number INT NOT NULL,
  instrument_name TEXT NOT NULL,
  brand_model TEXT,
  serial_number TEXT,
  measurement_range TEXT,
  calibration_method TEXT,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  sla_working_days INT NOT NULL DEFAULT 5,
  condition_notes TEXT,
  feasibility_status TEXT NOT NULL DEFAULT 'pending',
  feasibility_notes TEXT,
  certificate_number TEXT UNIQUE,
  certificate_issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calibration_instruments TO authenticated;
GRANT ALL ON public.calibration_instruments TO service_role;
ALTER TABLE public.calibration_instruments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cal_instruments_all" ON public.calibration_instruments;
CREATE POLICY "cal_instruments_all" ON public.calibration_instruments FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse','sales','purchasing','finance']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse','sales','purchasing','finance']::app_role[]));

DROP TRIGGER IF EXISTS trg_cal_instruments_updated ON public.calibration_instruments;
CREATE TRIGGER trg_cal_instruments_updated BEFORE UPDATE ON public.calibration_instruments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- extend tracker tables to support receipts directly
ALTER TABLE public.calibration_tracker_checklists
  ALTER COLUMN sales_order_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS calibration_receipt_id UUID REFERENCES public.calibration_receipts(id) ON DELETE CASCADE;

ALTER TABLE public.calibration_tracker_comments
  ALTER COLUMN sales_order_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS calibration_receipt_id UUID REFERENCES public.calibration_receipts(id) ON DELETE CASCADE;
