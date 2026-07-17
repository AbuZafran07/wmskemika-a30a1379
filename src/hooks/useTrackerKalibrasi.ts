import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type KalibrasiV2Column = 'in_progress' | 'completed' | 'invoiced' | 'selesai';

export interface KalibrasiV2Checklist {
  id: string;
  calibration_receipt_id: string;
  checklist_key: string;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
}

export interface KalibrasiV2Card {
  id: string;
  receipt_number: string;
  spk_number: string | null;
  received_date: string;
  target_completion_date: string | null;
  status: string;
  archived: boolean;
  service_pic_name: string | null;
  customer: { name: string } | null;
  instruments: { id: string; instrument_name: string; unit_price: number }[];
}

export const COLUMN_DEFS: {
  id: KalibrasiV2Column;
  label: string;
  desc: string;
  color: string;
}[] = [
  { id: 'in_progress', label: 'In Progress',  desc: 'SPK aktif, sedang dikalibrasi',      color: 'bg-blue-600'   },
  { id: 'completed',   label: 'Completed',    desc: 'Kalibrasi selesai, sertifikat terbit', color: 'bg-purple-600' },
  { id: 'invoiced',    label: 'Invoiced',     desc: 'Invoice dikirim ke customer',          color: 'bg-orange-600' },
  { id: 'selesai',     label: 'Selesai',      desc: 'Pembayaran lunas',                     color: 'bg-green-600'  },
];

export const COLUMN_CHECKLISTS: Record<KalibrasiV2Column, { key: string; label: string }[]> = {
  in_progress: [
    { key: 'spk_issued',       label: 'SPK diterbitkan' },
    { key: 'physical_check',   label: 'Cek fisik alat selesai' },
    { key: 'calibration_done', label: 'Semua alat selesai dikalibrasi' },
  ],
  completed: [
    { key: 'certificate_issued', label: 'Sertifikat diterbitkan' },
    { key: 'invoice_sent',       label: 'Invoice dikirim ke customer' },
  ],
  invoiced: [
    { key: 'payment_received', label: 'Pembayaran diterima' },
    { key: 'tools_returned',   label: 'Alat dikembalikan ke customer' },
  ],
  selesai: [],
};

export const CHECKLIST_TOGGLE_ROLES = ['super_admin', 'admin', 'warehouse', 'purchasing'];

// Legacy aliases used by TrackerKalibrasiCardDetail
export type KalibrasiCard = KalibrasiV2Card;
export type KalibrasiChecklist = KalibrasiV2Checklist;
export type KalibrasiColumn = KalibrasiV2Column;
export const KALIBRASI_COLUMN_CHECKLISTS = COLUMN_CHECKLISTS;
export const KALIBRASI_CHECKLIST_LABELS: Record<string, string> = Object.values(
  COLUMN_CHECKLISTS,
).flat().reduce((acc, cur) => {
  acc[cur.key] = cur.label;
  return acc;
}, {} as Record<string, string>);

function computeColumn(checklists: KalibrasiV2Checklist[]): KalibrasiV2Column {
  const ok = (key: string) => checklists.some((c) => c.checklist_key === key && c.is_checked);
  if (!ok('spk_issued') || !ok('physical_check') || !ok('calibration_done')) return 'in_progress';
  if (!ok('certificate_issued') || !ok('invoice_sent')) return 'completed';
  if (!ok('payment_received') || !ok('tools_returned')) return 'invoiced';
  return 'selesai';
}

export function useTrackerKalibrasi() {
  const { user } = useAuth();
  const role = user?.role;
  const [cards, setCards] = useState<KalibrasiV2Card[]>([]);
  const [checklists, setChecklists] = useState<Record<string, KalibrasiV2Checklist[]>>({});
  const [loading, setLoading] = useState(true);

  const canToggle = CHECKLIST_TOGGLE_ROLES.includes(role || '');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: receipts, error: receiptsError } = await supabase
        .from('calibration_receipts')
        .select(`
          id, receipt_number, spk_number, received_date, target_completion_date,
          status, archived, service_pic_name,
          customer:customers(name),
          instruments:calibration_instruments(id, instrument_name, unit_price)
        `)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });

      if (receiptsError) throw receiptsError;

      const list = (receipts || []) as unknown as KalibrasiV2Card[];
      setCards(list);

      if (list.length === 0) {
        setChecklists({});
        setLoading(false);
        return;
      }

      const ids = list.map((c) => c.id);
      const { data: chkData, error: chkError } = await supabase
        .from('calibration_tracker_checklists')
        .select('*')
        .in('calibration_receipt_id', ids);

      if (chkError) throw chkError;

      const grouped: Record<string, KalibrasiV2Checklist[]> = {};
      for (const c of (chkData || []) as KalibrasiV2Checklist[]) {
        if (!grouped[c.calibration_receipt_id]) grouped[c.calibration_receipt_id] = [];
        grouped[c.calibration_receipt_id].push(c);
      }
      setChecklists(grouped);
    } catch (err) {
      console.error('[TrackerKalibrasi] fetch error:', err);
      toast.error('Gagal memuat tracker kalibrasi');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    const ch1 = supabase
      .channel('kal-v2-receipts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calibration_receipts' }, fetchData)
      .subscribe();

    const ch2 = supabase
      .channel('kal-v2-checklists')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calibration_tracker_checklists' }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [fetchData]);

  const getColumnCards = useCallback(
    (col: KalibrasiV2Column): KalibrasiV2Card[] =>
      cards.filter((card) => computeColumn(checklists[card.id] || []) === col),
    [cards, checklists],
  );

  const getCardColumn = useCallback(
    (cardId: string): KalibrasiV2Column => computeColumn(checklists[cardId] || []),
    [checklists],
  );

  const toggleChecklist = useCallback(
    async (receiptId: string, checklistKey: string) => {
      if (!user?.id || !canToggle) return;

      const existing = (checklists[receiptId] || []).find(
        (c) => c.checklist_key === checklistKey,
      );
      const newValue = existing ? !existing.is_checked : true;

      // Optimistic update
      setChecklists((prev) => {
        const current = prev[receiptId] || [];
        if (existing) {
          return {
            ...prev,
            [receiptId]: current.map((c) =>
              c.checklist_key === checklistKey
                ? { ...c, is_checked: newValue, checked_by: newValue ? user.id : null }
                : c,
            ),
          };
        }
        return {
          ...prev,
          [receiptId]: [
            ...current,
            {
              id: `temp-${checklistKey}`,
              calibration_receipt_id: receiptId,
              checklist_key: checklistKey,
              is_checked: true,
              checked_by: user.id,
              checked_at: new Date().toISOString(),
            },
          ],
        };
      });

      try {
        if (existing) {
          await supabase
            .from('calibration_tracker_checklists')
            .update({
              is_checked: newValue,
              checked_by: newValue ? user.id : null,
              checked_at: newValue ? new Date().toISOString() : null,
            })
            .eq('id', existing.id);
        } else {
          await supabase.from('calibration_tracker_checklists').insert({
            calibration_receipt_id: receiptId,
            checklist_key: checklistKey,
            is_checked: true,
            checked_by: user.id,
            checked_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error('toggleChecklist error:', err);
        toast.error('Gagal update checklist');
        fetchData();
      }
    },
    [user, canToggle, checklists, fetchData],
  );

  return {
    cards,
    checklists,
    loading,
    canToggle,
    getColumnCards,
    getCardColumn,
    toggleChecklist,
    refetch: fetchData,
  };
}
