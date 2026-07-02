
-- Recovery: Release DO/20260626.03 (SO/20260605.01, Altosid 50 pcs, batch 2504035296)
-- Kartu Kanban sudah dihapus, tapi stock out masih delivered. Kembalikan stok & reset SO.

-- 1. Kembalikan stok ke inventory
UPDATE public.inventory_batches
SET qty_on_hand = qty_on_hand + 50, updated_at = now()
WHERE id = 'e35831b3-bd55-402c-9a32-70ea903ddbd4';

-- 2. Catat stock transaction sebagai adjustment (audit trail)
INSERT INTO public.stock_transactions (product_id, batch_id, transaction_type, quantity, reference_type, reference_id, reference_number, notes)
VALUES (
  '14683bfc-efde-4727-a949-b32836b5da54',
  'e35831b3-bd55-402c-9a32-70ea903ddbd4',
  'adjustment',
  50,
  'stock_out_release',
  '9b3f3267-a12b-4403-b4bf-36c80bff5a17',
  'DO/20260626.03',
  'Recovery release: kartu Kanban dihapus, stock out dibatalkan. Stok dikembalikan.'
);

-- 3. Reset qty_delivered pada sales_order_items
UPDATE public.sales_order_items
SET qty_delivered = GREATEST(qty_delivered - 50, 0)
WHERE sales_order_id = '5d919f18-e7e4-401c-b155-63c8775e50eb'
  AND product_id = '14683bfc-efde-4727-a949-b32836b5da54';

-- 4. Reset status SO kembali ke approved
UPDATE public.sales_order_headers
SET status = 'approved', updated_at = now()
WHERE id = '5d919f18-e7e4-401c-b155-63c8775e50eb';

-- 5. Hapus delivery order (surat jalan) & stock out
DELETE FROM public.delivery_orders WHERE stock_out_id = '9b3f3267-a12b-4403-b4bf-36c80bff5a17';
DELETE FROM public.stock_out_items WHERE stock_out_id = '9b3f3267-a12b-4403-b4bf-36c80bff5a17';
DELETE FROM public.stock_out_headers WHERE id = '9b3f3267-a12b-4403-b4bf-36c80bff5a17';
