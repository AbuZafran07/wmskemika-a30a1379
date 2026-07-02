ALTER TABLE public.po_tracker_checklists
  ADD COLUMN IF NOT EXISTS checklist_date date;

COMMENT ON COLUMN public.po_tracker_checklists.checklist_date IS 'Tanggal terkait checklist Tracker PO, digunakan untuk invoice received dan invoice recorded.';