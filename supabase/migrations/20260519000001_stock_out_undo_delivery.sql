-- =========================================================
-- RPC: stock_out_undo_delivery
-- Membalik efek stock_out_confirm_delivery untuk card yang
-- sudah di-confirm (booking_status='delivered') tapi belum
-- dipindahkan ke kolom 'delivered' di Kanban.
-- Hanya dapat dijalankan oleh super_admin atau admin.
-- =========================================================
CREATE OR REPLACE FUNCTION public.stock_out_undo_delivery(
  p_stock_out_id        uuid,
  p_reason              text,
  p_delivery_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id        UUID;
  v_user_email     TEXT;
  v_header         RECORD;
  v_item           RECORD;
  v_so_item        RECORD;
  v_new_qty        INTEGER;
  v_any_remaining  BOOLEAN;
  v_any_delivered  BOOLEAN;
  v_new_so_status  TEXT;
  v_before_json    JSONB;
  v_after_json     JSONB;
BEGIN
  -- Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Hanya super_admin dan admin
  IF NOT has_any_role(v_user_id, ARRAY['super_admin'::app_role, 'admin'::app_role]) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Hanya super_admin atau admin yang dapat membatalkan pengiriman');
  END IF;

  -- Validasi alasan minimal 20 karakter
  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alasan harus minimal 20 karakter');
  END IF;

  v_user_email := get_user_email(v_user_id);

  -- Lock dan ambil header
  SELECT * INTO v_header FROM stock_out_headers WHERE id = p_stock_out_id FOR UPDATE;
  IF v_header.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock out tidak ditemukan');
  END IF;

  -- Harus status delivered
  IF v_header.booking_status <> 'delivered' THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Tidak dapat membatalkan, status saat ini: %s (harus delivered)', v_header.booking_status));
  END IF;

  -- Blokir legacy card (stok dikurangi secara lama, tidak ditrack normal)
  IF v_header.skip_stock_deduction = true THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Card lama (legacy) tidak dapat di-undo karena stok tidak ditrack secara normal.');
  END IF;

  v_before_json := jsonb_build_object(
    'booking_status', v_header.booking_status,
    'delivered_at', v_header.delivered_at,
    'delivery_actual_date', v_header.delivery_actual_date
  );

  -- 1. Kembalikan qty_on_hand untuk setiap batch item
  FOR v_item IN
    SELECT * FROM stock_out_items WHERE stock_out_id = p_stock_out_id
  LOOP
    UPDATE inventory_batches
    SET qty_on_hand = qty_on_hand + v_item.qty_out,
        updated_at  = now()
    WHERE id = v_item.batch_id;
  END LOOP;

  -- 2. Revert booking_status ke 'booked', hapus timestamp delivery
  UPDATE stock_out_headers
  SET booking_status      = 'booked',
      delivered_at        = NULL,
      delivery_actual_date = NULL,
      updated_at          = now()
  WHERE id = p_stock_out_id;

  -- 3. Recalculate qty_delivered per sales_order_item
  --    (sum dari semua delivery lain yang masih 'delivered', tidak termasuk yang di-undo)
  FOR v_so_item IN
    SELECT DISTINCT sales_order_item_id
    FROM stock_out_items
    WHERE stock_out_id = p_stock_out_id
  LOOP
    SELECT COALESCE(SUM(soi.qty_out), 0) INTO v_new_qty
    FROM stock_out_items soi
    JOIN stock_out_headers soh ON soh.id = soi.stock_out_id
    WHERE soi.sales_order_item_id = v_so_item.sales_order_item_id
      AND soi.stock_out_id        <> p_stock_out_id
      AND soh.booking_status       = 'delivered';

    UPDATE sales_order_items
    SET qty_delivered = v_new_qty
    WHERE id = v_so_item.sales_order_item_id;
  END LOOP;

  -- 4. Recalculate status Sales Order
  SELECT EXISTS (
    SELECT 1 FROM sales_order_items
    WHERE sales_order_id = v_header.sales_order_id
      AND ordered_qty > COALESCE(qty_delivered, 0)
  ) INTO v_any_remaining;

  SELECT EXISTS (
    SELECT 1 FROM sales_order_items
    WHERE sales_order_id = v_header.sales_order_id
      AND COALESCE(qty_delivered, 0) > 0
  ) INTO v_any_delivered;

  IF NOT v_any_remaining THEN
    v_new_so_status := 'delivered';          -- semua item masih fully delivered oleh DO lain
  ELSIF v_any_delivered THEN
    v_new_so_status := 'partially_delivered'; -- sebagian terkirim oleh DO lain
  ELSE
    v_new_so_status := 'approved';           -- belum ada yang terkirim sama sekali
  END IF;

  UPDATE sales_order_headers
  SET status     = v_new_so_status,
      updated_at = now()
  WHERE id = v_header.sales_order_id;

  -- 5. Kembalikan board_status Kanban ke approval_delivery
  IF p_delivery_request_id IS NOT NULL THEN
    UPDATE delivery_requests
    SET board_status = 'approval_delivery',
        moved_at     = now(),
        updated_at   = now()
    WHERE id = p_delivery_request_id;
  END IF;

  -- 6. Audit log
  v_after_json := jsonb_build_object(
    'booking_status',  'booked',
    'undo_reason',     trim(p_reason),
    'undone_at',       now(),
    'new_so_status',   v_new_so_status
  );

  INSERT INTO audit_logs (
    user_id, user_email, action, module,
    ref_table, ref_id, ref_no, old_data, new_data
  )
  VALUES (
    v_user_id, v_user_email, 'undo_delivery', 'stock_out',
    'stock_out_headers', p_stock_out_id, v_header.stock_out_number,
    v_before_json, v_after_json
  );

  RETURN jsonb_build_object(
    'success',        true,
    'id',             p_stock_out_id,
    'booking_status', 'booked',
    'new_so_status',  v_new_so_status
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
