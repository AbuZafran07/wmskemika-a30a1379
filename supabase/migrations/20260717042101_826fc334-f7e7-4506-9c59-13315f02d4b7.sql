
-- ============================================================
-- 1) Role guard triggers for transaction header tables
-- ============================================================
-- Guards run only for authenticated app users (auth.uid() NOT NULL).
-- Service-role callers (edge functions, backfills) bypass by design.

CREATE OR REPLACE FUNCTION public.guard_role_write(_allowed app_role[])
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN; -- service role / background job
  END IF;
  IF NOT public.has_any_role(auth.uid(), _allowed) THEN
    RAISE EXCEPTION 'Not authorized: required role missing' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- plan orders → purchasing / admin / super_admin
CREATE OR REPLACE FUNCTION public.trg_guard_plan_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.guard_role_write(ARRAY['super_admin','admin','purchasing']::app_role[]);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_plan_order_headers ON public.plan_order_headers;
CREATE TRIGGER guard_plan_order_headers
  BEFORE INSERT OR UPDATE OR DELETE ON public.plan_order_headers
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_plan_order();

-- sales orders → sales / admin / super_admin
CREATE OR REPLACE FUNCTION public.trg_guard_sales_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.guard_role_write(ARRAY['super_admin','admin','sales']::app_role[]);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_sales_order_headers ON public.sales_order_headers;
CREATE TRIGGER guard_sales_order_headers
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_headers
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_sales_order();

-- stock adjustments → warehouse / admin / super_admin
CREATE OR REPLACE FUNCTION public.trg_guard_stock_adjustment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.guard_role_write(ARRAY['super_admin','admin','warehouse']::app_role[]);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_stock_adjustments ON public.stock_adjustments;
CREATE TRIGGER guard_stock_adjustments
  BEFORE INSERT OR UPDATE OR DELETE ON public.stock_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_stock_adjustment();

-- stock in → warehouse / admin / super_admin
CREATE OR REPLACE FUNCTION public.trg_guard_stock_in() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.guard_role_write(ARRAY['super_admin','admin','warehouse']::app_role[]);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_stock_in_headers ON public.stock_in_headers;
CREATE TRIGGER guard_stock_in_headers
  BEFORE INSERT OR UPDATE OR DELETE ON public.stock_in_headers
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_stock_in();

-- stock out → warehouse / sales / admin / super_admin
CREATE OR REPLACE FUNCTION public.trg_guard_stock_out() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.guard_role_write(ARRAY['super_admin','admin','warehouse','sales']::app_role[]);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_stock_out_headers ON public.stock_out_headers;
CREATE TRIGGER guard_stock_out_headers
  BEFORE INSERT OR UPDATE OR DELETE ON public.stock_out_headers
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_stock_out();

-- ============================================================
-- 2) Calibration RLS tightened (calibration_items, checklists, comments read)
-- ============================================================
DROP POLICY IF EXISTS "calibration_items authenticated all" ON public.calibration_items;
CREATE POLICY "calibration_items read"
  ON public.calibration_items FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse','sales','finance']::app_role[]));
CREATE POLICY "calibration_items write"
  ON public.calibration_items FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse','sales']::app_role[]));
CREATE POLICY "calibration_items update"
  ON public.calibration_items FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse','sales']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse','sales']::app_role[]));
CREATE POLICY "calibration_items delete"
  ON public.calibration_items FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]));

DROP POLICY IF EXISTS "calibration_tracker_checklists authenticated all" ON public.calibration_tracker_checklists;
CREATE POLICY "calibration_tracker_checklists read"
  ON public.calibration_tracker_checklists FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse','sales','finance']::app_role[]));
CREATE POLICY "calibration_tracker_checklists insert"
  ON public.calibration_tracker_checklists FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse']::app_role[]));
CREATE POLICY "calibration_tracker_checklists update"
  ON public.calibration_tracker_checklists FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse']::app_role[]));
CREATE POLICY "calibration_tracker_checklists delete"
  ON public.calibration_tracker_checklists FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]));

DROP POLICY IF EXISTS "calibration_tracker_comments read auth" ON public.calibration_tracker_comments;
CREATE POLICY "calibration_tracker_comments read"
  ON public.calibration_tracker_comments FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse','sales','finance']::app_role[]));

-- ============================================================
-- 3) Restrict overly-open SELECT policies on delivery/PO tracker helper tables
-- ============================================================
DROP POLICY IF EXISTS read_card_labels ON public.delivery_card_labels;
CREATE POLICY read_card_labels ON public.delivery_card_labels FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','sales','warehouse','finance']::app_role[]));

DROP POLICY IF EXISTS read_checklists ON public.delivery_checklists;
CREATE POLICY read_checklists ON public.delivery_checklists FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','sales','warehouse','finance','purchasing']::app_role[]));

DROP POLICY IF EXISTS read_labels ON public.delivery_labels;
CREATE POLICY read_labels ON public.delivery_labels FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','sales','warehouse','finance']::app_role[]));

DROP POLICY IF EXISTS "po_tracker_card_labels read" ON public.po_tracker_card_labels;
CREATE POLICY "po_tracker_card_labels read" ON public.po_tracker_card_labels FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','purchasing','warehouse','finance']::app_role[]));

DROP POLICY IF EXISTS "po_tracker_checklists read" ON public.po_tracker_checklists;
CREATE POLICY "po_tracker_checklists read" ON public.po_tracker_checklists FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','purchasing','warehouse','finance']::app_role[]));

DROP POLICY IF EXISTS "po_tracker_labels read" ON public.po_tracker_labels;
CREATE POLICY "po_tracker_labels read" ON public.po_tracker_labels FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','purchasing','warehouse','finance']::app_role[]));
