-- Tracker Purchase Order tables

-- 4a. Checklist (perpindahan kolom)
CREATE TABLE public.po_tracker_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_order_id UUID NOT NULL
    REFERENCES plan_order_headers(id) ON DELETE CASCADE,
  checklist_key TEXT NOT NULL,
  is_checked BOOLEAN DEFAULT false,
  checked_by UUID REFERENCES auth.users(id),
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(plan_order_id, checklist_key)
);

ALTER TABLE public.po_tracker_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_tracker_checklists_select" ON public.po_tracker_checklists
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "po_tracker_checklists_insert" ON public.po_tracker_checklists
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'admin', 'purchasing')
    )
  );

CREATE POLICY "po_tracker_checklists_update" ON public.po_tracker_checklists
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'admin', 'purchasing')
    )
  );

-- 4b. Label master
CREATE TABLE public.po_tracker_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.po_tracker_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_tracker_labels_select" ON public.po_tracker_labels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "po_tracker_labels_insert" ON public.po_tracker_labels
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'admin', 'purchasing')
    )
  );

CREATE POLICY "po_tracker_labels_update" ON public.po_tracker_labels
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "po_tracker_labels_delete" ON public.po_tracker_labels
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'admin')
    )
  );

-- 4c. Junction: plan_order <-> label
CREATE TABLE public.po_tracker_card_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_order_id UUID NOT NULL
    REFERENCES plan_order_headers(id) ON DELETE CASCADE,
  label_id UUID NOT NULL
    REFERENCES po_tracker_labels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_order_id, label_id)
);

ALTER TABLE public.po_tracker_card_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_tracker_card_labels_select" ON public.po_tracker_card_labels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "po_tracker_card_labels_insert" ON public.po_tracker_card_labels
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'admin', 'purchasing', 'warehouse')
    )
  );

CREATE POLICY "po_tracker_card_labels_delete" ON public.po_tracker_card_labels
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'admin', 'purchasing', 'warehouse')
    )
  );

-- 4d. Komentar & aktivitas
CREATE TABLE public.po_tracker_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_order_id UUID NOT NULL
    REFERENCES plan_order_headers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'comment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.po_tracker_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_tracker_comments_select" ON public.po_tracker_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "po_tracker_comments_insert" ON public.po_tracker_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "po_tracker_comments_delete" ON public.po_tracker_comments
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'admin')
    )
  );

-- 4e. Unread comment tracking
CREATE TABLE public.po_tracker_comment_reads (
  plan_order_id UUID NOT NULL
    REFERENCES plan_order_headers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_order_id, user_id)
);

ALTER TABLE public.po_tracker_comment_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_tracker_comment_reads_select" ON public.po_tracker_comment_reads
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "po_tracker_comment_reads_insert" ON public.po_tracker_comment_reads
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "po_tracker_comment_reads_update" ON public.po_tracker_comment_reads
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- 4f. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.po_tracker_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.po_tracker_card_labels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.po_tracker_checklists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.po_tracker_comment_reads;
