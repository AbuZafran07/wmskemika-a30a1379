DROP POLICY IF EXISTS finance_can_delete_delivery_requests ON public.delivery_requests;
CREATE POLICY "admins_finance_can_delete_delivery_requests"
ON public.delivery_requests FOR DELETE
USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role]));

DROP POLICY IF EXISTS delete_checklists ON public.delivery_checklists;
CREATE POLICY "delete_checklists" ON public.delivery_checklists FOR DELETE
USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role]));

DROP POLICY IF EXISTS delete_comments ON public.delivery_comments;
CREATE POLICY "delete_comments" ON public.delivery_comments FOR DELETE
USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role]));

DROP POLICY IF EXISTS delete_card_labels ON public.delivery_card_labels;
CREATE POLICY "delete_card_labels" ON public.delivery_card_labels FOR DELETE
USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'sales'::app_role, 'warehouse'::app_role, 'finance'::app_role]));