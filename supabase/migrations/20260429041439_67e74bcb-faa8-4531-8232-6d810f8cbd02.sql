
-- 1) Backfill delivery_number & delivery_actual_date di stock_out_headers dari delivery_orders
UPDATE public.stock_out_headers soh
SET delivery_number = dord.do_number,
    delivery_actual_date = dord.created_at::date
FROM public.delivery_orders dord
WHERE dord.stock_out_id = soh.id
  AND (soh.delivery_number IS DISTINCT FROM dord.do_number
       OR soh.delivery_actual_date IS DISTINCT FROM dord.created_at::date);

-- 2) Trigger function: ketika delivery_orders dibuat/diupdate, sinkron ke stock_out_headers
CREATE OR REPLACE FUNCTION public.sync_stock_out_delivery_info()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.stock_out_headers
       SET delivery_number = NULL,
           delivery_actual_date = NULL
     WHERE id = OLD.stock_out_id;
    RETURN OLD;
  END IF;

  UPDATE public.stock_out_headers
     SET delivery_number = NEW.do_number,
         delivery_actual_date = NEW.created_at::date
   WHERE id = NEW.stock_out_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_stock_out_delivery_info ON public.delivery_orders;
CREATE TRIGGER trg_sync_stock_out_delivery_info
AFTER INSERT OR UPDATE OR DELETE ON public.delivery_orders
FOR EACH ROW EXECUTE FUNCTION public.sync_stock_out_delivery_info();
