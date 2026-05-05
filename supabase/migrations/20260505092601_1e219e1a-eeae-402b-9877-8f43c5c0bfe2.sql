ALTER TABLE public.proforma_invoices
  ADD COLUMN IF NOT EXISTS dp_percent numeric,
  ADD COLUMN IF NOT EXISTS term_days integer,
  ADD COLUMN IF NOT EXISTS payment_note text;