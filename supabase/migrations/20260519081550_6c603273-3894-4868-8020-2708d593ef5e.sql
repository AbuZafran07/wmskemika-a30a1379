CREATE OR REPLACE FUNCTION public.stock_out_release_booking(p_stock_out_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_header RECORD;
  v_any_delivered BOOLEAN;
  v_all_delivered BOOLEAN;
  v_new_status TEXT;
  v_card_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT has_any_role(v_user_id, ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role, 'sales'::app_role, 'finance'::app_role]) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient privileges');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason must be at least 20 characters');
  END IF;

  v_user_email := get_user_email(v_user_id);

  SELECT * INTO v_header FROM stock_out_headers WHERE id = p_stock_out_id FOR UPDATE;
  IF v_header.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock out not found');
  END IF;

  IF v_header.booking_status <> 'booked' THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Cannot release, current status: %s (must be booked)', v_header.booking_status));
  END IF;

  IF v_header.skip_stock_deduction = true THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Card existing (legacy) tidak bisa di-release karena stok sudah dikurangi sebelumnya. Lanjutkan ke konfirmasi pengiriman.');
  END IF;

  UPDATE stock_out_headers
  SET booking_status = 'released',
      released_at = now(),
      released_reason = trim(p_reason)
  WHERE id = p_stock_out_id;

  SELECT
    bool_or(COALESCE(qty_delivered, 0) > 0),
    NOT EXISTS (
      SELECT 1 FROM sales_order_items
      WHERE sales_order_id = v_header.sales_order_id
        AND COALESCE(qty_remaining, ordered_qty - COALESCE(qty_delivered, 0)) > 0
    )
  INTO v_any_delivered, v_all_delivered
  FROM sales_order_items
  WHERE sales_order_id = v_header.sales_order_id;

  v_new_status := CASE
    WHEN v_all_delivered THEN 'delivered'
    WHEN v_any_delivered THEN 'partially_delivered'
    ELSE 'approved'
  END;

  UPDATE sales_order_headers
  SET status = v_new_status, updated_at = now()
  WHERE id = v_header.sales_order_id
    AND status IN ('delivered', 'partially_delivered', 'approved');

  -- Pindahkan card delivery yang terhubung ke kolom 'checking' agar bisa di-stockout ulang
  FOR v_card_id IN
    SELECT id FROM delivery_requests
    WHERE sales_order_id = v_header.sales_order_id
      AND board_status NOT IN ('checking', 'delivered', 'delivered_sample', 'archived')
  LOOP
    UPDATE delivery_requests
    SET board_status = 'checking',
        moved_by = v_user_id,
        moved_at = now(),
        updated_at = now()
    WHERE id = v_card_id;

    INSERT INTO delivery_comments (delivery_request_id, user_id, message, type)
    VALUES (v_card_id, v_user_id,
      format('↩️ Booking %s di-release. Card dikembalikan ke Checking agar bisa di-stockout ulang. Alasan: %s',
        v_header.stock_out_number, trim(p_reason)),
      'activity');
  END LOOP;

  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'release_booking', 'stock_out', 'stock_out_headers', p_stock_out_id, v_header.stock_out_number,
    jsonb_build_object('booking_status', 'booked'),
    jsonb_build_object('booking_status', 'released', 'released_reason', trim(p_reason), 'released_at', now(), 'sales_order_status', v_new_status, 'card_moved_to', 'checking'));

  RETURN jsonb_build_object('success', true, 'id', p_stock_out_id, 'booking_status', 'released', 'sales_order_status', v_new_status, 'card_moved_to', 'checking');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;