-- ─── Modul Kalibrasi: Calibration Module ──────────────────────────────────
-- Migration: 20260716000001_calibration_module.sql

-- ── 1. ALTER sales_order_headers ──────────────────────────────────────────
ALTER TABLE public.sales_order_headers
  ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'product'
    CHECK (order_type IN ('product', 'service')),
  ADD COLUMN IF NOT EXISTS service_location TEXT,
  ADD COLUMN IF NOT EXISTS service_pic_name TEXT,
  ADD COLUMN IF NOT EXISTS service_pic_phone TEXT,
  ADD COLUMN IF NOT EXISTS spk_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS spk_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS spk_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS target_completion_date DATE,
  ADD COLUMN IF NOT EXISTS lab_manager_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS coordinator_admin_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS coordinator_teknis_user_id UUID REFERENCES auth.users(id);

-- ── 2. calibration_items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calibration_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL
    REFERENCES public.sales_order_headers(id) ON DELETE CASCADE,
  item_number INTEGER NOT NULL DEFAULT 1,
  instrument_name TEXT NOT NULL,
  brand_model TEXT,
  serial_number TEXT,
  measurement_range TEXT,
  calibration_method TEXT,
  sla_working_days INTEGER DEFAULT 5,
  unit_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  received_date DATE,
  condition_notes TEXT,
  feasibility_status TEXT DEFAULT 'pending'
    CHECK (feasibility_status IN ('pending', 'feasible', 'not_feasible')),
  feasibility_notes TEXT,
  feasibility_checked_by UUID REFERENCES auth.users(id),
  feasibility_checked_at TIMESTAMPTZ,
  standard_method TEXT,
  traceability TEXT,
  env_temperature DECIMAL(5,2),
  env_humidity DECIMAL(5,2),
  next_calibration_date DATE,
  calibration_conclusion TEXT DEFAULT 'within_limits'
    CHECK (calibration_conclusion IN ('within_limits', 'out_of_limits')),
  calibration_notes TEXT,
  calibration_executed_by UUID REFERENCES auth.users(id),
  calibration_executed_at TIMESTAMPTZ,
  technical_review_by UUID REFERENCES auth.users(id),
  technical_review_at TIMESTAMPTZ,
  certificate_number TEXT UNIQUE,
  certificate_issued_at TIMESTAMPTZ,
  certificate_authorized_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 3. calibration_verification_checks ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calibration_verification_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_item_id UUID NOT NULL
    REFERENCES public.calibration_items(id) ON DELETE CASCADE,
  check_number INTEGER NOT NULL,
  standard_applied TEXT NOT NULL,
  monitoring_reading TEXT NOT NULL,
  correction TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 4. calibration_spare_parts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calibration_spare_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_item_id UUID NOT NULL
    REFERENCES public.calibration_items(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  qty_used INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(15,2) DEFAULT 0,
  stock_out_id UUID REFERENCES public.stock_out_headers(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 5. calibration_tracker_checklists ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calibration_tracker_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL
    REFERENCES public.sales_order_headers(id) ON DELETE CASCADE,
  checklist_key TEXT NOT NULL,
  is_checked BOOLEAN DEFAULT false,
  checked_by UUID REFERENCES auth.users(id),
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sales_order_id, checklist_key)
);

-- ── 6. calibration_tracker_comments & reads ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.calibration_tracker_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL
    REFERENCES public.sales_order_headers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'comment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calibration_tracker_comment_reads (
  sales_order_id UUID NOT NULL
    REFERENCES public.sales_order_headers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sales_order_id, user_id)
);

-- ── 7. calibration_labels ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calibration_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calibration_card_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL
    REFERENCES public.sales_order_headers(id) ON DELETE CASCADE,
  label_id UUID NOT NULL
    REFERENCES public.calibration_labels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sales_order_id, label_id)
);

-- ── 8. Enable RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.calibration_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_verification_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_spare_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_tracker_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_tracker_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_tracker_comment_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_card_labels ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies: calibration_items ──────────────────────────────────────
CREATE POLICY "cal_items_select" ON public.calibration_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cal_items_insert" ON public.calibration_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'sales', 'purchasing', 'warehouse')
    )
  );

CREATE POLICY "cal_items_update" ON public.calibration_items
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'sales', 'purchasing', 'warehouse')
    )
  );

CREATE POLICY "cal_items_delete" ON public.calibration_items
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- ── RLS Policies: calibration_verification_checks ────────────────────────
CREATE POLICY "cal_vc_select" ON public.calibration_verification_checks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cal_vc_insert" ON public.calibration_verification_checks
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('purchasing', 'warehouse', 'admin', 'super_admin')
    )
  );

CREATE POLICY "cal_vc_update" ON public.calibration_verification_checks
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('purchasing', 'warehouse', 'admin', 'super_admin')
    )
  );

CREATE POLICY "cal_vc_delete" ON public.calibration_verification_checks
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('purchasing', 'warehouse', 'admin', 'super_admin')
    )
  );

-- ── RLS Policies: calibration_spare_parts ────────────────────────────────
CREATE POLICY "cal_sp_select" ON public.calibration_spare_parts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cal_sp_insert" ON public.calibration_spare_parts
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('purchasing', 'warehouse', 'admin', 'super_admin')
    )
  );

CREATE POLICY "cal_sp_update" ON public.calibration_spare_parts
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('purchasing', 'warehouse', 'admin', 'super_admin')
    )
  );

CREATE POLICY "cal_sp_delete" ON public.calibration_spare_parts
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('purchasing', 'warehouse', 'admin', 'super_admin')
    )
  );

-- ── RLS Policies: calibration_tracker_checklists ─────────────────────────
CREATE POLICY "cal_chk_select" ON public.calibration_tracker_checklists
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cal_chk_insert" ON public.calibration_tracker_checklists
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "cal_chk_update" ON public.calibration_tracker_checklists
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- ── RLS Policies: calibration_tracker_comments ───────────────────────────
CREATE POLICY "cal_cmt_select" ON public.calibration_tracker_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cal_cmt_insert" ON public.calibration_tracker_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cal_cmt_delete" ON public.calibration_tracker_comments
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- ── RLS Policies: calibration_tracker_comment_reads ──────────────────────
CREATE POLICY "cal_reads_select" ON public.calibration_tracker_comment_reads
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "cal_reads_insert" ON public.calibration_tracker_comment_reads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cal_reads_update" ON public.calibration_tracker_comment_reads
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ── RLS Policies: calibration_labels ─────────────────────────────────────
CREATE POLICY "cal_lbl_select" ON public.calibration_labels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cal_lbl_insert" ON public.calibration_labels
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'sales')
    )
  );

CREATE POLICY "cal_lbl_update" ON public.calibration_labels
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "cal_lbl_delete" ON public.calibration_labels
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- ── RLS Policies: calibration_card_labels ────────────────────────────────
CREATE POLICY "cal_cl_select" ON public.calibration_card_labels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cal_cl_insert" ON public.calibration_card_labels
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'sales', 'purchasing', 'warehouse')
    )
  );

CREATE POLICY "cal_cl_delete" ON public.calibration_card_labels
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'sales', 'purchasing', 'warehouse')
    )
  );

-- ── 9. Enable Realtime ────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime
  ADD TABLE public.calibration_tracker_comments,
            public.calibration_tracker_checklists,
            public.calibration_card_labels,
            public.calibration_items;
