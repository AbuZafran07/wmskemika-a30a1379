CREATE OR REPLACE FUNCTION public.stock_out_undo_delivery(
  p_stock_out_id uuid,
  p_reason text,
  p_delivery_request_id uuid DEFAULT NULL
)
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
BEGIN
  -- Auth check
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF NOT has_any_role(v_user_id, ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role]) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: insufficient role');
  END IF;

  -- Validate reason
  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alasan minimal 20 karakter');
  END IF;

  -- Load header
  SELECT * INTO v_header FROM stock_out_headers WHERE id = p_stock_out_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock out tidak ditemukan');
  END IF;

  IF v_header.booking_status <> 'delivered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Hanya pengiriman yang sudah delivered yang bisa di-undo');
  END IF;

  -- Restore stock + record reversing stock transactions (skip if delivery did not deduct stock)
  IF COALESCE(v_header.skip_stock_deduction, false) = false THEN
    FOR v_item IN
      SELECT id, stock_out_id, product_id, batch_id, qty_out, sales_order_item_id
      FROM stock_out_items
      WHERE stock_out_id = p_stock_out_id
    LOOP
      UPDATE inventory_batches
      SET qty_on_hand = qty_on_hand + v_item.qty_out,
          updated_at = now()
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

  -- Recalculate qty_delivered on sales_order_items for this SO
  -- Subtract this stock_out's quantities per SO item
  FOR v_so_item IN
    SELECT sales_order_item_id, SUM(qty_out)::int AS qty
    FROM stock_out_items
    WHERE stock_out_id = p_stock_out_id
    GROUP BY sales_order_item_id
  LOOP
    UPDATE sales_order_items
    SET qty_delivered = GREATEST(COALESCE(qty_delivered, 0) - v_so_item.qty, 0)
    WHERE id = v_so_item.sales_order_item_id;
  END LOOP;

  -- Flip stock out back to booked
  UPDATE stock_out_headers
  SET booking_status = 'booked',
      delivered_at = NULL,
      delivery_number = NULL,
      delivery_actual_date = NULL
  WHERE id = p_stock_out_id;

  -- Move kanban card back to approval_delivery
  IF p_delivery_request_id IS NOT NULL THEN
    UPDATE delivery_requests
    SET board_status = 'approval_delivery',
        moved_by = v_user_id,
        moved_at = now(),
        updated_at = now()
    WHERE id = p_delivery_request_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.stock_out_undo_delivery(uuid, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.stock_out_undo_delivery(uuid, text, uuid) TO authenticated;