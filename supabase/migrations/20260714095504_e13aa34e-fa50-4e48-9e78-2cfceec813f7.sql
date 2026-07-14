
-- Backfill: konfirmasi delivery untuk stock_out yang masih 'booked' 
-- padahal card Kanban-nya sudah berada di kolom Delivered / Delivered Sample.
DO $$
DECLARE
  r RECORD;
  v_item RECORD;
  v_current_qty INTEGER;
BEGIN
  FOR r IN
    SELECT soh.id, soh.stock_out_number, soh.skip_stock_deduction, soh.sales_order_id
    FROM stock_out_headers soh
    WHERE soh.booking_status = 'booked'
      AND EXISTS (
        SELECT 1 FROM delivery_requests dr
        WHERE dr.sales_order_id = soh.sales_order_id
          AND dr.board_status IN ('delivered', 'delivered_sample')
      )
  LOOP
    IF r.skip_stock_deduction = true THEN
      UPDATE stock_out_headers
        SET booking_status = 'delivered', delivered_at = now()
        WHERE id = r.id;

      INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
      VALUES (NULL, 'system-backfill', 'confirm_delivery', 'stock_out', 'stock_out_headers', r.id, r.stock_out_number,
        jsonb_build_object('booking_status', 'booked', 'skip_stock_deduction', true),
        jsonb_build_object('booking_status', 'delivered', 'note', 'Backfill: card sudah di kolom Delivered'));
    ELSE
      FOR v_item IN
        SELECT * FROM stock_out_items WHERE stock_out_id = r.id
      LOOP
        SELECT qty_on_hand INTO v_current_qty FROM inventory_batches WHERE id = v_item.batch_id FOR UPDATE;
        IF v_current_qty IS NULL THEN
          RAISE EXCEPTION 'Batch not found for stock_out %: batch %', r.stock_out_number, v_item.batch_id;
        END IF;
        IF v_current_qty < v_item.qty_out THEN
          RAISE EXCEPTION 'Insufficient stock for stock_out % batch %: available %, requested %',
            r.stock_out_number, v_item.batch_id, v_current_qty, v_item.qty_out;
        END IF;

        UPDATE inventory_batches
          SET qty_on_hand = qty_on_hand - v_item.qty_out, updated_at = now()
          WHERE id = v_item.batch_id;

        INSERT INTO stock_transactions (
          product_id, batch_id, transaction_type, quantity,
          reference_type, reference_id, reference_number, created_by, notes
        ) VALUES (
          v_item.product_id, v_item.batch_id, 'outbound', v_item.qty_out,
          'stock_out', r.id, r.stock_out_number, NULL,
          'Backfill: konfirmasi delivery otomatis (card sudah di kolom Delivered)'
        );
      END LOOP;

      UPDATE stock_out_headers
        SET booking_status = 'delivered', delivered_at = now()
        WHERE id = r.id;

      INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
      VALUES (NULL, 'system-backfill', 'confirm_delivery', 'stock_out', 'stock_out_headers', r.id, r.stock_out_number,
        jsonb_build_object('booking_status', 'booked'),
        jsonb_build_object('booking_status', 'delivered', 'note', 'Backfill: card sudah di kolom Delivered'));
    END IF;
  END LOOP;
END
$$;
