ALTER TABLE public.stock_out_items
  DROP CONSTRAINT IF EXISTS stock_out_items_sales_order_item_id_fkey;

ALTER TABLE public.stock_out_items
  ADD CONSTRAINT stock_out_items_sales_order_item_id_fkey
  FOREIGN KEY (sales_order_item_id)
  REFERENCES public.sales_order_items(id)
  ON DELETE SET NULL;