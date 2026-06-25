
-- po_tracker_labels
CREATE TABLE public.po_tracker_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.po_tracker_labels TO authenticated;
GRANT ALL ON public.po_tracker_labels TO service_role;
ALTER TABLE public.po_tracker_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_tracker_labels read" ON public.po_tracker_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "po_tracker_labels write" ON public.po_tracker_labels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'purchasing') OR public.has_role(auth.uid(), 'warehouse'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'purchasing') OR public.has_role(auth.uid(), 'warehouse'));

-- po_tracker_card_labels
CREATE TABLE public.po_tracker_card_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_order_id uuid NOT NULL REFERENCES public.plan_order_headers(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.po_tracker_labels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_order_id, label_id)
);
CREATE INDEX ON public.po_tracker_card_labels (plan_order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.po_tracker_card_labels TO authenticated;
GRANT ALL ON public.po_tracker_card_labels TO service_role;
ALTER TABLE public.po_tracker_card_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_tracker_card_labels read" ON public.po_tracker_card_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "po_tracker_card_labels write" ON public.po_tracker_card_labels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'purchasing') OR public.has_role(auth.uid(), 'warehouse'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'purchasing') OR public.has_role(auth.uid(), 'warehouse'));

-- po_tracker_comments
CREATE TABLE public.po_tracker_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_order_id uuid NOT NULL REFERENCES public.plan_order_headers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'comment',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.po_tracker_comments (plan_order_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.po_tracker_comments TO authenticated;
GRANT ALL ON public.po_tracker_comments TO service_role;
ALTER TABLE public.po_tracker_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_tracker_comments read" ON public.po_tracker_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "po_tracker_comments insert" ON public.po_tracker_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "po_tracker_comments delete own or admin" ON public.po_tracker_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

-- po_tracker_comment_reads
CREATE TABLE public.po_tracker_comment_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_order_id uuid NOT NULL REFERENCES public.plan_order_headers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_order_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.po_tracker_comment_reads TO authenticated;
GRANT ALL ON public.po_tracker_comment_reads TO service_role;
ALTER TABLE public.po_tracker_comment_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_tracker_comment_reads own" ON public.po_tracker_comment_reads FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- po_tracker_checklists
CREATE TABLE public.po_tracker_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_order_id uuid NOT NULL REFERENCES public.plan_order_headers(id) ON DELETE CASCADE,
  checklist_key text NOT NULL,
  is_checked boolean NOT NULL DEFAULT false,
  checked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_at timestamptz,
  UNIQUE (plan_order_id, checklist_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.po_tracker_checklists TO authenticated;
GRANT ALL ON public.po_tracker_checklists TO service_role;
ALTER TABLE public.po_tracker_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_tracker_checklists read" ON public.po_tracker_checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "po_tracker_checklists write" ON public.po_tracker_checklists FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'purchasing'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'purchasing'));
