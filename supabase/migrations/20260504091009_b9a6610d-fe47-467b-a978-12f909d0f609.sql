
-- =========================================================
-- 1) MODIFIKASI stock_out_create -> BOOKING ONLY
-- =========================================================
CREATE OR REPLACE FUNCTION public.stock_out_create(header_data jsonb, items_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header_id UUID;
  v_user_id UUID;
  v_user_email TEXT;
  v_item JSONB;
  v_batch JSONB;
  v_sales_order_id UUID;
  v_after_json JSONB;
  v_items_result JSONB;
  v_qty_available INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT has_any_role(v_user_id, ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role, 'sales'::app_role]) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient privileges');
  END IF;

  v_user_email := get_user_email(v_user_id);
  v_sales_order_id := (header_data->>'sales_order_id')::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM sales_order_headers
    WHERE id = v_sales_order_id
      AND status IN ('approved', 'partially_delivered')
      AND (is_deleted = false OR is_deleted IS NULL)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sales order not found or not in approved/partially_delivered status');
  END IF;

  -- Insert header sebagai BOOKING (belum potong stok)
  INSERT INTO stock_out_headers (
    stock_out_number, sales_order_id, delivery_date,
    delivery_note_url, notes, created_by,
    booking_status, skip_stock_deduction
  )
  VALUES (
    header_data->>'stock_out_number',
    v_sales_order_id,
    COALESCE((header_data->>'delivery_date')::date, CURRENT_DATE),
    NULLIF(header_data->>'delivery_note_url', ''),
    NULLIF(header_data->>'notes', ''),
    v_user_id,
    'booked',
    false
  )
  RETURNING id INTO v_header_id;

  -- Loop items: validasi available stock & insert items (TANPA kurangi qty_on_hand)
  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    FOR v_batch IN SELECT * FROM jsonb_array_elements(v_item->'batches')
    LOOP
      -- Validasi pakai available_stock (qty_on_hand - total booking aktif)
      SELECT qty_available INTO v_qty_available
      FROM available_stock
      WHERE batch_id = (v_batch->>'batch_id')::uuid;

      IF v_qty_available IS NULL THEN
        RAISE EXCEPTION 'Batch not found: %', v_batch->>'batch_id';
      END IF;

      IF v_qty_available < (v_batch->>'qty_out')::integer THEN
        RAISE EXCEPTION 'Insufficient available stock in batch. Available: %, Requested: %',
          v_qty_available, (v_batch->>'qty_out')::integer;
      END IF;

      INSERT INTO stock_out_items (
        stock_out_id, sales_order_item_id, product_id, batch_id, qty_out
      )
      VALUES (
        v_header_id,
        (v_item->>'sales_order_item_id')::uuid,
        (v_item->>'product_id')::uuid,
        (v_batch->>'batch_id')::uuid,
        (v_batch->>'qty_out')::integer
      );
      -- TIDAK update inventory_batches
      -- TIDAK insert stock_transactions
    END LOOP;
    -- TIDAK update sales_order_items.qty_delivered (akan di confirm_delivery)
  END LOOP;
  -- TIDAK update sales_order_headers.status

  SELECT jsonb_agg(row_to_json(i)) INTO v_items_result
  FROM stock_out_items i WHERE i.stock_out_id = v_header_id;

  v_after_json := jsonb_build_object(
    'header', (SELECT row_to_json(h) FROM stock_out_headers h WHERE h.id = v_header_id),
    'items', COALESCE(v_items_result, '[]'::jsonb),
    'note', 'BOOKING ONLY - stock not deducted yet'
  );

  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'create_booking', 'stock_out', 'stock_out_headers', v_header_id, header_data->>'stock_out_number', NULL, v_after_json);

  RETURN jsonb_build_object('success', true, 'id', v_header_id, 'booking_status', 'booked');

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock out number already exists');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- =========================================================
-- 2) RPC BARU: stock_out_confirm_delivery
-- =========================================================
CREATE OR REPLACE FUNCTION public.stock_out_confirm_delivery(p_stock_out_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_header RECORD;
  v_item RECORD;
  v_current_qty INTEGER;
  v_so_qty_delivered INTEGER;
  v_total_per_item RECORD;
  v_all_delivered BOOLEAN;
  v_after_json JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT has_any_role(v_user_id, ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role, 'sales'::app_role]) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient privileges');
  END IF;

  v_user_email := get_user_email(v_user_id);

  SELECT * INTO v_header FROM stock_out_headers WHERE id = p_stock_out_id FOR UPDATE;
  IF v_header.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock out not found');
  END IF;

  IF v_header.booking_status <> 'booked' THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Cannot confirm delivery, current status: %s (must be booked)', v_header.booking_status));
  END IF;

  -- Jika skip_stock_deduction (existing card hasil migrasi), JANGAN kurangi stok lagi
  IF v_header.skip_stock_deduction = true THEN
    UPDATE stock_out_headers
    SET booking_status = 'delivered', delivered_at = now()
    WHERE id = p_stock_out_id;

    INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
    VALUES (v_user_id, v_user_email, 'confirm_delivery', 'stock_out', 'stock_out_headers', p_stock_out_id, v_header.stock_out_number,
      jsonb_build_object('booking_status', 'booked', 'skip_stock_deduction', true),
      jsonb_build_object('booking_status', 'delivered', 'note', 'Skipped deduction (legacy card)'));

    RETURN jsonb_build_object('success', true, 'id', p_stock_out_id, 'booking_status', 'delivered', 'skipped_deduction', true);
  END IF;

  -- Booking baru: kurangi stok per batch + insert stock_transactions
  FOR v_item IN
    SELECT * FROM stock_out_items WHERE stock_out_id = p_stock_out_id
  LOOP
    SELECT qty_on_hand INTO v_current_qty FROM inventory_batches WHERE id = v_item.batch_id FOR UPDATE;
    IF v_current_qty IS NULL THEN
      RAISE EXCEPTION 'Batch not found: %', v_item.batch_id;
    END IF;
    IF v_current_qty < v_item.qty_out THEN
      RAISE EXCEPTION 'Insufficient stock at delivery time. Batch %: available %, requested %',
        v_item.batch_id, v_current_qty, v_item.qty_out;
    END IF;

    UPDATE inventory_batches
    SET qty_on_hand = qty_on_hand - v_item.qty_out, updated_at = now()
    WHERE id = v_item.batch_id;

    INSERT INTO stock_transactions (
      product_id, batch_id, transaction_type, quantity,
      reference_type, reference_id, reference_number, created_by, notes
    )
    VALUES (
      v_item.product_id, v_item.batch_id, 'outbound', -v_item.qty_out,
      'stock_out', p_stock_out_id, v_header.stock_out_number, v_user_id,
      'Confirmed delivery from booking'
    );
  END LOOP;

  -- Update qty_delivered per sales_order_item (sum semua batch)
  FOR v_total_per_item IN
    SELECT sales_order_item_id, SUM(qty_out)::int AS total_qty
    FROM stock_out_items
    WHERE stock_out_id = p_stock_out_id
    GROUP BY sales_order_item_id
  LOOP
    SELECT COALESCE(qty_delivered, 0) INTO v_so_qty_delivered
    FROM sales_order_items WHERE id = v_total_per_item.sales_order_item_id;

    UPDATE sales_order_items
    SET qty_delivered = COALESCE(v_so_qty_delivered, 0) + v_total_per_item.total_qty
    WHERE id = v_total_per_item.sales_order_item_id;
  END LOOP;

  -- Update status sales order
  SELECT NOT EXISTS (
    SELECT 1 FROM sales_order_items
    WHERE sales_order_id = v_header.sales_order_id
      AND COALESCE(qty_remaining, ordered_qty - COALESCE(qty_delivered, 0)) > 0
  ) INTO v_all_delivered;

  UPDATE sales_order_headers
  SET status = CASE WHEN v_all_delivered THEN 'delivered' ELSE 'partially_delivered' END,
      updated_at = now()
  WHERE id = v_header.sales_order_id;

  -- Mark header delivered
  UPDATE stock_out_headers
  SET booking_status = 'delivered', delivered_at = now(), delivery_actual_date = CURRENT_DATE
  WHERE id = p_stock_out_id;

  v_after_json := jsonb_build_object(
    'booking_status', 'delivered',
    'delivered_at', now(),
    'sales_order_status', CASE WHEN v_all_delivered THEN 'delivered' ELSE 'partially_delivered' END
  );

  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'confirm_delivery', 'stock_out', 'stock_out_headers', p_stock_out_id, v_header.stock_out_number,
    jsonb_build_object('booking_status', 'booked'), v_after_json);

  RETURN jsonb_build_object('success', true, 'id', p_stock_out_id, 'booking_status', 'delivered');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- =========================================================
-- 3) RPC BARU: stock_out_release_booking
-- =========================================================
CREATE OR REPLACE FUNCTION public.stock_out_release_booking(p_stock_out_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_header RECORD;
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

  -- BLOKIR release untuk legacy card (stok sudah dikurangi sebelumnya)
  IF v_header.skip_stock_deduction = true THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Card existing (legacy) tidak bisa di-release karena stok sudah dikurangi sebelumnya. Lanjutkan ke konfirmasi pengiriman.');
  END IF;

  UPDATE stock_out_headers
  SET booking_status = 'released',
      released_at = now(),
      released_reason = trim(p_reason)
  WHERE id = p_stock_out_id;

  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'release_booking', 'stock_out', 'stock_out_headers', p_stock_out_id, v_header.stock_out_number,
    jsonb_build_object('booking_status', 'booked'),
    jsonb_build_object('booking_status', 'released', 'released_reason', trim(p_reason), 'released_at', now()));

  RETURN jsonb_build_object('success', true, 'id', p_stock_out_id, 'booking_status', 'released');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
