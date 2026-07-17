CREATE OR REPLACE FUNCTION public.trg_guard_stock_out() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.guard_role_write(ARRAY['super_admin','admin','warehouse','sales','finance','purchasing']::app_role[]);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;