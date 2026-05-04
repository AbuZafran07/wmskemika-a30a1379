ALTER TABLE public.stock_out_headers
  ADD COLUMN IF NOT EXISTS booking_status TEXT NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_reason TEXT,
  ADD COLUMN IF NOT EXISTS skip_stock_deduction BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'stock_out_headers_booking_status_check'
  ) THEN
    ALTER TABLE public.stock_out_headers
      ADD CONSTRAINT stock_out_headers_booking_status_check
      CHECK (booking_status IN ('booked','delivered','released'));
  END IF;
END $$;

UPDATE public.stock_out_headers
SET 
  booking_status = 'delivered',
  delivered_at = COALESCE(delivered_at, created_at),
  skip_stock_deduction = true
WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_out_headers_booking_status_booked
  ON public.stock_out_headers(booking_status)
  WHERE booking_status = 'booked';

CREATE OR REPLACE VIEW public.available_stock AS
SELECT 
  ib.id AS batch_id,
  ib.product_id,
  ib.batch_no,
  ib.expired_date,
  ib.qty_on_hand,
  COALESCE((
    SELECT SUM(soi.qty_out)
    FROM public.stock_out_items soi
    JOIN public.stock_out_headers soh ON soh.id = soi.stock_out_id
    WHERE soi.batch_id = ib.id
      AND soh.booking_status = 'booked'
  ), 0)::integer AS qty_booked,
  (ib.qty_on_hand - COALESCE((
    SELECT SUM(soi.qty_out)
    FROM public.stock_out_items soi
    JOIN public.stock_out_headers soh ON soh.id = soi.stock_out_id
    WHERE soi.batch_id = ib.id
      AND soh.booking_status = 'booked'
  ), 0))::integer AS qty_available
FROM public.inventory_batches ib;

COMMENT ON VIEW public.available_stock IS 
  'Stok tersedia = qty_on_hand - jumlah qty_out yang masih booking_status=booked';