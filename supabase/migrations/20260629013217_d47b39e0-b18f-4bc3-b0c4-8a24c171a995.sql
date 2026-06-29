DROP POLICY IF EXISTS "Authorized users can view plan orders" ON public.plan_order_headers;
CREATE POLICY "Authorized users can view plan orders"
ON public.plan_order_headers FOR SELECT
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role, 'purchasing'::app_role, 'warehouse'::app_role, 'viewer'::app_role]));

DROP POLICY IF EXISTS "Authorized users can view suppliers" ON public.suppliers;
CREATE POLICY "Authorized users can view suppliers"
ON public.suppliers FOR SELECT
USING (auth.uid() IS NOT NULL AND deleted_at IS NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role, 'purchasing'::app_role, 'warehouse'::app_role, 'sales'::app_role, 'viewer'::app_role]));

-- Allow viewer to read plan_order_items as well (likely needed)
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authorized users can view plan order items" ON public.plan_order_items';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
CREATE POLICY "Authorized users can view plan order items"
ON public.plan_order_items FOR SELECT
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role, 'purchasing'::app_role, 'warehouse'::app_role, 'viewer'::app_role]));