-- Dedupe: keep the checked row (or latest) per (plan_order_id, checklist_key)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY plan_order_id, checklist_key
           ORDER BY is_checked DESC, checked_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM public.po_tracker_checklists
)
DELETE FROM public.po_tracker_checklists
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Prevent duplicates going forward
ALTER TABLE public.po_tracker_checklists
  ADD CONSTRAINT po_tracker_checklists_plan_key_unique
  UNIQUE (plan_order_id, checklist_key);