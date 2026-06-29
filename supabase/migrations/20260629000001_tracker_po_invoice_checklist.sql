-- Tambah kolom tanggal pada checklist item (untuk Invoice Received & Invoice Recorded)
ALTER TABLE public.po_tracker_checklists
  ADD COLUMN IF NOT EXISTS checklist_date DATE;
