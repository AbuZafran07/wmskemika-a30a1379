-- =========================================================
-- Fix: sales_order_request_revision
-- Sebelumnya: blokir jika ADA stock_out record (apapun statusnya)
-- Sesudahnya : blokir hanya jika ada stock_out AKTIF
--              (booking_status = 'booked' atau 'delivered')
-- Record dengan booking_status = 'released' DIABAIKAN karena
-- sudah tidak mempengaruhi stok — sehingga SO yang sudah di-undo
-- delivery-nya (→ released) tetap bisa diajukan revisi.
-- =========================================================
CREATE OR REPLACE FUNCTION public.sales_order_request_revision(order_id uuid, revision_reason text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id        uuid;
  v_user_email     text;
  v_order_number   text;
  v_current_status text;
  v_has_active_stock_out boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF revision_reason IS NULL OR trim(revision_reason) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Revision reason is required');
  END IF;

  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, sales_order_number
    INTO v_current_status, v_order_number
    FROM sales_order_headers
   WHERE id = order_id
     AND (is_deleted = false OR is_deleted IS NULL);

  IF v_current_status IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_current_status != 'approved' THEN
    RETURN json_build_object('success', false, 'error', 'Only approved orders can request revision');
  END IF;

  -- Blokir hanya jika masih ada stock_out yang aktif (booked atau delivered).
  -- Released = sudah dilepas/di-undo, tidak memblokir revisi.
  SELECT EXISTS(
    SELECT 1 FROM stock_out_headers
     WHERE sales_order_id  = order_id
       AND booking_status IN ('booked', 'delivered')
  ) INTO v_has_active_stock_out;

  IF v_has_active_stock_out THEN
    RETURN json_build_object(
      'success', false,
      'error',   'Tidak dapat revisi: masih ada stock out aktif (booked/delivered). Lepas booking atau batalkan pengiriman terlebih dahulu.'
    );
  END IF;

  UPDATE sales_order_headers
     SET status     = 'revision_requested',
         updated_at = now()
   WHERE id = order_id;

  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data)
  VALUES (v_user_id, v_user_email, 'REVISION_REQUEST', 'Sales Order', 'sales_order_headers', order_id, v_order_number,
    json_build_object('status', 'revision_requested', 'reason', revision_reason));

  RETURN json_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;
