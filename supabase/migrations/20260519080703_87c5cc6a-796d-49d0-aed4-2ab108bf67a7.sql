-- Fix: recompute sales_order_headers.status after release/undo of stock_out

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

  -- Recompute SO status based on remaining qty_delivered across SO items
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

  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'release_booking', 'stock_out', 'stock_out_headers', p_stock_out_id, v_header.stock_out_number,
    jsonb_build_object('booking_status', 'booked'),
    jsonb_build_object('booking_status', 'released', 'released_reason', trim(p_reason), 'released_at', now(), 'sales_order_status', v_new_status));

  RETURN jsonb_build_object('success', true, 'id', p_stock_out_id, 'booking_status', 'released', 'sales_order_status', v_new_status);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Also fix undo_delivery to recompute SO status
CREATE OR REPLACE FUNCTION public.stock_out_undo_delivery(p_stock_out_id uuid, p_reason text, p_delivery_request_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_header record;
  v_item record;
  v_so_item record;
  v_any_delivered BOOLEAN;
  v_all_delivered BOOLEAN;
  v_new_status TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF NOT has_any_role(v_user_id, ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role]) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: insufficient role');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alasan minimal 20 karakter');
  END IF;

  SELECT * INTO v_header FROM stock_out_headers WHERE id = p_stock_out_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock out tidak ditemukan');
  END IF;

  IF v_header.booking_status <> 'delivered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Hanya pengiriman yang sudah delivered yang bisa di-undo');
  END IF;

  IF COALESCE(v_header.skip_stock_deduction, false) = false THEN
    FOR v_item IN
      SELECT id, stock_out_id, product_id, batch_id, qty_out, sales_order_item_id
      FROM stock_out_items WHERE stock_out_id = p_stock_out_id
    LOOP
      UPDATE inventory_batches
      SET qty_on_hand = qty_on_hand + v_item.qty_out, updated_at = now()
      WHERE id = v_item.batch_id;

      INSERT INTO stock_transactions(
        product_id, batch_id, transaction_type, quantity,
        reference_type, reference_id, reference_number, notes, created_by
      ) VALUES (
        v_item.product_id, v_item.batch_id, 'inbound', v_item.qty_out,
        'stock_out_undo', p_stock_out_id, v_header.stock_out_number,
        'Undo pengiriman: ' || p_reason, v_user_id
      );
    END LOOP;
  END IF;

  FOR v_so_item IN
    SELECT sales_order_item_id, SUM(qty_out)::int AS qty
    FROM stock_out_items WHERE stock_out_id = p_stock_out_id
    GROUP BY sales_order_item_id
  LOOP
    UPDATE sales_order_items
    SET qty_delivered = GREATEST(COALESCE(qty_delivered, 0) - v_so_item.qty, 0)
    WHERE id = v_so_item.sales_order_item_id;
  END LOOP;

  UPDATE stock_out_headers
  SET booking_status = 'booked', delivered_at = NULL,
      delivery_number = NULL, delivery_actual_date = NULL
  WHERE id = p_stock_out_id;

  IF p_delivery_request_id IS NOT NULL THEN
    UPDATE delivery_requests
    SET board_status = 'approval_delivery', moved_by = v_user_id,
        moved_at = now(), updated_at = now()
    WHERE id = p_delivery_request_id;
  END IF;

  -- Recompute SO status
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

  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, get_user_email(v_user_id), 'undo_delivery', 'stock_out', 'stock_out_headers', p_stock_out_id, v_header.stock_out_number,
    jsonb_build_object('booking_status', 'delivered'),
    jsonb_build_object('booking_status', 'booked', 'reason', p_reason, 'sales_order_status', v_new_status));

  RETURN jsonb_build_object('success', true, 'id', p_stock_out_id, 'booking_status', 'booked', 'sales_order_status', v_new_status);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Fix data: SO/20260512.05 stuck at 'delivered' with qty_delivered=0
UPDATE sales_order_headers
SET status = 'approved', updated_at = now()
WHERE sales_order_number = 'SO/20260512.05'
  AND status = 'delivered';
