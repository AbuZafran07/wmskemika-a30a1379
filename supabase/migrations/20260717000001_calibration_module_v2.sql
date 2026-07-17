-- ─── Modul Kalibrasi v2: Drop old, create new ────────────────────────────────
-- Migration: 20260717000001_calibration_module_v2.sql

-- ── 1. DROP OLD TABLES (dependency order) ────────────────────────────────────

DROP TABLE IF EXISTS public.calibration_verification_checks CASCADE;
DROP TABLE IF EXISTS public.calibration_spare_parts CASCADE;
DROP TABLE IF EXISTS public.calibration_tracker_comment_reads CASCADE;
DROP TABLE IF EXISTS public.calibration_tracker_comments CASCADE;
DROP TABLE IF EXISTS public.calibration_tracker_checklists CASCADE;
DROP TABLE IF EXISTS public.calibration_card_labels CASCADE;
DROP TABLE IF EXISTS public.calibration_labels CASCADE;
DROP TABLE IF EXISTS public.calibration_items CASCADE;

-- ── 2. DROP OLD SERVICE COLUMNS from sales_order_headers ─────────────────────
-- keep order_type (still used to flag SO as 'service')
ALTER TABLE public.sales_order_headers
  DROP COLUMN IF EXISTS service_location,
  DROP COLUMN IF EXISTS service_pic_name,
  DROP COLUMN IF EXISTS service_pic_phone,
  DROP COLUMN IF EXISTS spk_number,
  DROP COLUMN IF EXISTS spk_issued_at,
  DROP COLUMN IF EXISTS spk_signed_at,
  DROP COLUMN IF EXISTS target_completion_date,
  DROP COLUMN IF EXISTS lab_manager_user_id,
  DROP COLUMN IF EXISTS coordinator_admin_user_id,
  DROP COLUMN IF EXISTS coordinator_teknis_user_id;

-- ── 3. calibration_receipts ───────────────────────────────────────────────────
CREATE TABLE public.calibration_receipts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number          TEXT UNIQUE NOT NULL,
  spk_number              TEXT UNIQUE,
  spk_issued_at           TIMESTAMPTZ,
  spk_signed_at           TIMESTAMPTZ,
  customer_id             UUID NOT NULL REFERENCES public.customers(id),
  service_pic_name        TEXT,
  service_pic_phone       TEXT,
  service_location        TEXT DEFAULT 'Lab Kemika, Tangerang',
  received_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  target_completion_date  DATE,
  customer_request_notes  TEXT,
  status                  TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','spk_issued','spk_signed','converted_to_so','cancelled')),
  sales_order_id          UUID REFERENCES public.sales_order_headers(id),
  lab_manager_user_id     UUID REFERENCES auth.users(id),
  coordinator_admin_user_id UUID REFERENCES auth.users(id),
  archived                BOOLEAN DEFAULT false,
  created_by              UUID REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- ── 4. calibration_instruments ────────────────────────────────────────────────
CREATE TABLE public.calibration_instruments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_receipt_id   UUID NOT NULL
    REFERENCES public.calibration_receipts(id) ON DELETE CASCADE,
  item_number              INTEGER NOT NULL DEFAULT 1,

  -- Basic info
  instrument_name          TEXT NOT NULL,
  brand_model              TEXT,
  serial_number            TEXT,
  measurement_range        TEXT,
  calibration_method       TEXT,
  unit_price               DECIMAL(15,2) NOT NULL DEFAULT 0,
  sla_working_days         INTEGER DEFAULT 5,

  -- Physical check (F-KAL-03)
  physical_condition       TEXT,
  battery_ok               BOOLEAN,
  display_ok               BOOLEAN,
  pump_ok                  BOOLEAN,
  sensor_ok                BOOLEAN,
  accessories_complete     BOOLEAN,
  physical_notes           TEXT,
  feasibility_status       TEXT DEFAULT 'pending'
    CHECK (feasibility_status IN ('pending','feasible','not_feasible')),
  feasibility_notes        TEXT,
  feasibility_checked_by   UUID REFERENCES auth.users(id),
  feasibility_checked_at   TIMESTAMPTZ,

  -- Calibration results
  standard_method          TEXT,
  traceability             TEXT,
  env_temperature          DECIMAL(5,2),
  env_humidity             DECIMAL(5,2),
  calibration_conclusion   TEXT DEFAULT 'within_limits'
    CHECK (calibration_conclusion IN ('within_limits','out_of_limits')),
  calibration_notes        TEXT,
  next_calibration_date    DATE,
  calibration_executed_by  UUID REFERENCES auth.users(id),
  calibration_executed_at  TIMESTAMPTZ,
  technical_review_by      UUID REFERENCES auth.users(id),
  technical_review_at      TIMESTAMPTZ,

  -- Certificate
  certificate_number       TEXT UNIQUE,
  certificate_issued_at    TIMESTAMPTZ,
  certificate_authorized_by UUID REFERENCES auth.users(id),

  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

-- ── 5. calibration_verification_checks ───────────────────────────────────────
CREATE TABLE public.calibration_verification_checks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id       UUID NOT NULL
    REFERENCES public.calibration_instruments(id) ON DELETE CASCADE,
  check_number        INTEGER NOT NULL,
  standard_applied    TEXT NOT NULL,
  monitoring_reading  TEXT NOT NULL,
  correction          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ── 6. calibration_spare_parts ────────────────────────────────────────────────
CREATE TABLE public.calibration_spare_parts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID NOT NULL
    REFERENCES public.calibration_instruments(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES public.products(id),
  qty_used      INTEGER NOT NULL DEFAULT 1,
  unit_price    DECIMAL(15,2) DEFAULT 0,
  notes         TEXT,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 7. calibration_tracker_checklists ────────────────────────────────────────
CREATE TABLE public.calibration_tracker_checklists (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_receipt_id UUID NOT NULL
    REFERENCES public.calibration_receipts(id) ON DELETE CASCADE,
  checklist_key          TEXT NOT NULL,
  is_checked             BOOLEAN DEFAULT false,
  checked_by             UUID REFERENCES auth.users(id),
  checked_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT now(),
  UNIQUE(calibration_receipt_id, checklist_key)
);

-- ── 8. calibration_tracker_comments ──────────────────────────────────────────
CREATE TABLE public.calibration_tracker_comments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_receipt_id UUID NOT NULL
    REFERENCES public.calibration_receipts(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message                TEXT NOT NULL,
  type                   TEXT NOT NULL DEFAULT 'comment',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.calibration_tracker_comment_reads (
  calibration_receipt_id UUID NOT NULL
    REFERENCES public.calibration_receipts(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (calibration_receipt_id, user_id)
);

-- ── 9. calibration_labels & card_labels ──────────────────────────────────────
CREATE TABLE public.calibration_labels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#3b82f6',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.calibration_card_labels (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_receipt_id UUID NOT NULL
    REFERENCES public.calibration_receipts(id) ON DELETE CASCADE,
  label_id               UUID NOT NULL
    REFERENCES public.calibration_labels(id) ON DELETE CASCADE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(calibration_receipt_id, label_id)
);

-- ── 10. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.calibration_receipts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_instruments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_verification_checks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_spare_parts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_tracker_checklists    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_tracker_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_tracker_comment_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_labels                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_card_labels           ENABLE ROW LEVEL SECURITY;

-- calibration_receipts
CREATE POLICY "kal_receipts_select" ON public.calibration_receipts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kal_receipts_insert" ON public.calibration_receipts
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin','sales','purchasing'))
  );
CREATE POLICY "kal_receipts_update" ON public.calibration_receipts
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin','sales','purchasing'))
  );
CREATE POLICY "kal_receipts_delete" ON public.calibration_receipts
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin'))
  );

-- calibration_instruments
CREATE POLICY "kal_instruments_select" ON public.calibration_instruments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kal_instruments_insert" ON public.calibration_instruments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin','sales','purchasing','warehouse'))
  );
CREATE POLICY "kal_instruments_update" ON public.calibration_instruments
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin','sales','purchasing','warehouse'))
  );
CREATE POLICY "kal_instruments_delete" ON public.calibration_instruments
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin'))
  );

-- calibration_verification_checks
CREATE POLICY "kal_verif_select" ON public.calibration_verification_checks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kal_verif_write" ON public.calibration_verification_checks
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin','purchasing','warehouse'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin','purchasing','warehouse'))
  );

-- calibration_spare_parts
CREATE POLICY "kal_spare_select" ON public.calibration_spare_parts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kal_spare_write" ON public.calibration_spare_parts
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin','purchasing','warehouse'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin','purchasing','warehouse'))
  );

-- calibration_tracker_checklists
CREATE POLICY "kal_chk_select" ON public.calibration_tracker_checklists
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kal_chk_write" ON public.calibration_tracker_checklists
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- calibration_tracker_comments
CREATE POLICY "kal_comments_select" ON public.calibration_tracker_comments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kal_comments_insert" ON public.calibration_tracker_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "kal_comments_delete" ON public.calibration_tracker_comments
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin')
    )
  );

-- calibration_tracker_comment_reads
CREATE POLICY "kal_reads_all" ON public.calibration_tracker_comment_reads
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- calibration_labels
CREATE POLICY "kal_labels_select" ON public.calibration_labels
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kal_labels_insert" ON public.calibration_labels
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin','sales'))
  );
CREATE POLICY "kal_labels_write" ON public.calibration_labels
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin'))
  );

-- calibration_card_labels
CREATE POLICY "kal_card_labels_select" ON public.calibration_card_labels
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kal_card_labels_write" ON public.calibration_card_labels
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin','sales','purchasing','warehouse'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','admin','sales','purchasing','warehouse'))
  );

-- ── 11. REALTIME ──────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.calibration_receipts,
  public.calibration_instruments,
  public.calibration_tracker_checklists,
  public.calibration_tracker_comments,
  public.calibration_card_labels;
