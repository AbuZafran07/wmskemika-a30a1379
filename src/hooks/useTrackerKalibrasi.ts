import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type KalibrasiColumn =
  | 'spk_masuk'
  | 'alat_diterima'
  | 'cek_kelayakan'
  | 'kalibrasi'
  | 'sertifikasi'
  | 'selesai';

export interface KalibrasiChecklist {
  id: string;
  sales_order_id: string;
  checklist_key: string;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
}

export interface KalibrasiCard {
  id: string;
  sales_order_number: string;
  spk_number: string | null;
  order_date: string;
  customer: { name: string } | null;
  sales_name: string;
  target_completion_date: string | null;
  service_location: string | null;
  service_pic_name: string | null;
  service_pic_phone: string | null;
  grand_total: number;
  status: string;
  created_by: string | null;
  notes: string | null;
}

export const KALIBRASI_COLUMNS: { id: KalibrasiColumn; label: string; color: string }[] = [
  { id: 'spk_masuk',     label: 'SPK Masuk',      color: 'bg-blue-600'   },
  { id: 'alat_diterima', label: 'Alat Diterima',  color: 'bg-yellow-600' },
  { id: 'cek_kelayakan', label: 'Cek Kelayakan',  color: 'bg-orange-600' },
  { id: 'kalibrasi',     label: 'Kalibrasi',      color: 'bg-purple-600' },
  { id: 'sertifikasi',   label: 'Sertifikasi',    color: 'bg-teal-600'   },
  { id: 'selesai',       label: 'Selesai',        color: 'bg-green-600'  },
];

// Checklist items shown per column (gates transition to the next column)
export const KALIBRASI_COLUMN_CHECKLISTS: Record<KalibrasiColumn, string[]> = {
  spk_masuk:     ['alat_diterima'],
  alat_diterima: ['kelayakan_selesai'],
  cek_kelayakan: ['kalibrasi_dimulai'],
  kalibrasi:     ['kalibrasi_selesai'],
  sertifikasi:   ['sertifikat_terbit'],
  selesai:       [],
};

export const KALIBRASI_CHECKLIST_LABELS: Record<string, string> = {
  alat_diterima:     'Alat Diterima di Lab',
  kelayakan_selesai: 'Cek Kelayakan Selesai',
  kalibrasi_dimulai: 'Kalibrasi Dimulai',
  kalibrasi_selesai: 'Kalibrasi Selesai',
  sertifikat_terbit: 'Sertifikat Diterbitkan',
};

export const KALIBRASI_CHECKLIST_TOGGLE_ROLES = ['super_admin', 'admin', 'warehouse'];

function computeKalibrasiColumn(
  status: string,
  checklists: KalibrasiChecklist[],
): KalibrasiColumn {
  if (status !== 'approved') return 'spk_masuk';
  const ok = (key: string) => checklists.some((c) => c.checklist_key === key && c.is_checked);
  if (!ok('alat_diterima'))    return 'spk_masuk';
  if (!ok('kelayakan_selesai'))return 'alat_diterima';
  if (!ok('kalibrasi_dimulai'))return 'cek_kelayakan';
  if (!ok('kalibrasi_selesai'))return 'kalibrasi';
  if (!ok('sertifikat_terbit'))return 'sertifikasi';
  return 'selesai';
}

export function useTrackerKalibrasi() {
  const { user, role } = useAuth();
  const [cards, setCards] = useState<KalibrasiCard[]>([]);
  const [checklists, setChecklists] = useState<Record<string, KalibrasiChecklist[]>>({});
  const [loading, setLoading] = useState(true);

  const canToggleChecklist = KALIBRASI_CHECKLIST_TOGGLE_ROLES.includes(role || '');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: orders, error: ordersError } = await supabase
        .from('sales_order_headers')
        .select(`
          id, sales_order_number, spk_number, order_date, sales_name,
          target_completion_date, service_location, service_pic_name, service_pic_phone,
          grand_total, status, created_by, notes,
          customer:customers(name)
        `)
        .eq('order_type', 'service')
        .eq('status', 'approved')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const ordersList = (orders || []) as KalibrasiCard[];
      setCards(ordersList);

      if (ordersList.length === 0) {
        setChecklists({});
        setLoading(false);
        return;
      }

      const orderIds = ordersList.map((o) => o.id);
      const { data: checklistData, error: checklistError } = await supabase
        .from('calibration_tracker_checklists')
        .select('*')
        .in('sales_order_id', orderIds);

      if (checklistError) throw checklistError;

      const grouped: Record<string, KalibrasiChecklist[]> = {};
      for (const c of checklistData || []) {
        if (!grouped[c.sales_order_id]) grouped[c.sales_order_id] = [];
        grouped[c.sales_order_id].push(c as KalibrasiChecklist);
      }
      setChecklists(grouped);
    } catch (err) {
      console.error('[TrackerKalibrasi] fetch error:', err);
      toast.error('Gagal memuat data tracker kalibrasi');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    const soChannel = supabase
      .channel('kal-tracker-so')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_order_headers' }, fetchData)
      .subscribe();

    const chkChannel = supabase
      .channel('kal-tracker-chk')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calibration_tracker_checklists' }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(soChannel);
      supabase.removeChannel(chkChannel);
    };
  }, [fetchData]);

  const getColumnCards = useCallback(
    (col: KalibrasiColumn): KalibrasiCard[] =>
      cards.filter(
        (card) => computeKalibrasiColumn(card.status, checklists[card.id] || []) === col,
      ),
    [cards, checklists],
  );

  const getCardColumn = useCallback(
    (cardId: string): KalibrasiColumn => {
      const card = cards.find((c) => c.id === cardId);
      if (!card) return 'spk_masuk';
      return computeKalibrasiColumn(card.status, checklists[cardId] || []);
    },
    [cards, checklists],
  );

  const toggleChecklist = useCallback(
    async (salesOrderId: string, checklistKey: string) => {
      if (!user?.id || !canToggleChecklist) return;
      const existing = (checklists[salesOrderId] || []).find(
        (c) => c.checklist_key === checklistKey,
      );
      if (existing?.is_checked) return;

      try {
        if (existing) {
          await supabase
            .from('calibration_tracker_checklists')
            .update({
              is_checked: true,
              checked_by: user.id,
              checked_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await supabase.from('calibration_tracker_checklists').insert({
            sales_order_id: salesOrderId,
            checklist_key: checklistKey,
            is_checked: true,
            checked_by: user.id,
            checked_at: new Date().toISOString(),
          });
        }
        await fetchData();
      } catch {
        toast.error('Gagal update checklist');
      }
    },
    [user, canToggleChecklist, checklists, fetchData],
  );

  return {
    cards,
    checklists,
    loading,
    canToggleChecklist,
    getColumnCards,
    getCardColumn,
    toggleChecklist,
    refetch: fetchData,
  };
}
