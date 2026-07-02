import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { PlanOrderHeader } from './usePlanOrders';

export interface ChecklistItem {
  id: string;
  plan_order_id: string;
  checklist_key: string;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  checklist_date: string | null;
  checker_name?: string;
}

const ACTIVE_STATUSES = ['approved', 'partially_received', 'received', 'cancelled'];
const CHECKLIST_CAN_TOGGLE_ROLES = ['super_admin', 'admin', 'purchasing'];

// Checklist keys yang membutuhkan input tanggal
export const CHECKLIST_NEEDS_DATE: Record<string, boolean> = {
  invoice_received: true,
  invoice_recorded: true,
};

const LABEL_MAP: Record<string, string> = {
  submitted: 'Submitted',
  vendor_confirmation: 'Vendor Confirmation',
  payment_process: 'Payment Process',
  invoice_received: 'Invoice Received',
  invoice_recorded: 'Invoice Recorded',
};

export type TrackerColumn = 'plan_order' | 'processing' | 'in_stock' | 'po_closed' | 'cancelled';

export function useTrackerPO() {
  const { user } = useAuth();
  const [planOrders, setPlanOrders] = useState<PlanOrderHeader[]>([]);
  const [checklists, setChecklists] = useState<Record<string, ChecklistItem[]>>({});
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setUserRole(data?.role ?? null));
  }, [user]);

  const fetchData = useCallback(async () => {
    try {
      const { data: orders, error: ordersError } = await supabase
        .from('plan_order_headers')
        .select(`
          id, plan_number, plan_date, supplier_id, expected_delivery_date,
          reference_no, notes, status, total_amount, discount, tax_rate,
          shipping_cost, grand_total, created_at, created_by, approved_by,
          approved_at, po_document_url, cancel_reason, cancelled_at,
          supplier:suppliers(id, name, code, address, contact_person, phone, terms_payment)
        `)
        .in('status', ACTIVE_STATUSES)
        .order('plan_date', { ascending: false });

      if (ordersError) throw ordersError;

      const typedOrders = (orders || []) as unknown as PlanOrderHeader[];
      setPlanOrders(typedOrders);

      if (typedOrders.length === 0) {
        setChecklists({});
        return;
      }

      const ids = typedOrders.map((o) => o.id);
      const { data: checklistData, error: checklistError } = await supabase
        .from('po_tracker_checklists')
        .select('id, plan_order_id, checklist_key, is_checked, checked_by, checked_at, checklist_date')
        .in('plan_order_id', ids);

      if (checklistError) throw checklistError;

      const checkerIds = [...new Set(
        (checklistData || []).map((c: any) => c.checked_by).filter(Boolean)
      )] as string[];

      const { data: profiles } = checkerIds.length > 0
        ? await supabase.from('profiles').select('id, full_name').in('id', checkerIds)
        : { data: [] };

      const profileMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name; });

      const byPO: Record<string, ChecklistItem[]> = {};
      (checklistData || []).forEach((c: any) => {
        const item: ChecklistItem = {
          id: c.id,
          plan_order_id: c.plan_order_id,
          checklist_key: c.checklist_key,
          is_checked: c.is_checked,
          checked_by: c.checked_by,
          checked_at: c.checked_at,
          checklist_date: c.checklist_date ?? null,
          checker_name: c.checked_by ? profileMap[c.checked_by] : undefined,
        };
        if (!byPO[c.plan_order_id]) byPO[c.plan_order_id] = [];
        byPO[c.plan_order_id].push(item);
      });
      setChecklists(byPO);
    } catch (err) {
      console.error('TrackerPO fetchData error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channelOrders = supabase
      .channel('tracker-po-plan-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_order_headers' }, () => fetchData())
      .subscribe();

    const channelChecklists = supabase
      .channel('tracker-po-checklists')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'po_tracker_checklists' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channelOrders);
      supabase.removeChannel(channelChecklists);
    };
  }, [fetchData]);

  // ─── Column logic ─────────────────────────────────────────────────────────

  const isInvoiceDone = useCallback((planOrderId: string) => {
    const items = checklists[planOrderId] || [];
    const invReceived = items.find(c => c.checklist_key === 'invoice_received' && c.is_checked);
    const invRecorded = items.find(c => c.checklist_key === 'invoice_recorded' && c.is_checked);
    return !!invReceived && !!invRecorded;
  }, [checklists]);

  const getColumnCards = useCallback(
    (col: TrackerColumn) => {
      return planOrders.filter((order) => {
        if (col === 'cancelled') return order.status === 'cancelled';
        if (order.status === 'cancelled') return false;

        const submitted = checklists[order.id]?.find(
          (c) => c.checklist_key === 'submitted' && c.is_checked
        );
        const isReceived = order.status === 'received';
        const invoiceDone = isInvoiceDone(order.id);

        if (col === 'plan_order') return !submitted && !isReceived;
        if (col === 'processing') return !!submitted && !isReceived;
        if (col === 'in_stock')  return isReceived && !invoiceDone;
        if (col === 'po_closed') return isReceived && invoiceDone;
        return false;
      });
    },
    [planOrders, checklists, isInvoiceDone]
  );

  // ─── Toggle checklist (one-way, with optional date) ───────────────────────

  const toggleChecklist = useCallback(
    async (planOrderId: string, checklistKey: string, checklistDate?: string) => {
      if (!user || !userRole) return;
      if (!CHECKLIST_CAN_TOGGLE_ROLES.includes(userRole)) {
        toast.error('Anda tidak memiliki akses untuk mengubah checklist');
        return;
      }

      const existing = checklists[planOrderId]?.find((c) => c.checklist_key === checklistKey);
      if (existing?.is_checked) return;

      // Jika checklist butuh tanggal, wajib diisi
      if (CHECKLIST_NEEDS_DATE[checklistKey] && !checklistDate) {
        toast.error('Tanggal harus diisi terlebih dahulu');
        return;
      }

      const checkerName = (user as any).name || (user as any).email || 'User';

      try {
        const payload: Record<string, unknown> = {
          plan_order_id: planOrderId,
          checklist_key: checklistKey,
          is_checked: true,
          checked_by: user.id,
          checked_at: new Date().toISOString(),
        };
        if (checklistDate) payload.checklist_date = checklistDate;

        const { data: savedChecklist, error } = await supabase
          .from('po_tracker_checklists')
          .upsert(payload as any, { onConflict: 'plan_order_id,checklist_key' })
          .select('id, plan_order_id, checklist_key, is_checked, checked_by, checked_at, checklist_date')
          .single();
        if (error) throw error;

        const optimisticItem: ChecklistItem = {
          id: (savedChecklist as any)?.id ?? existing?.id ?? `${planOrderId}_${checklistKey}`,
          plan_order_id: planOrderId,
          checklist_key: checklistKey,
          is_checked: true,
          checked_by: user.id,
          checked_at: (savedChecklist as any)?.checked_at ?? (payload.checked_at as string),
          checklist_date: (savedChecklist as any)?.checklist_date ?? checklistDate ?? null,
          checker_name: checkerName,
        };

        setChecklists((prev) => {
          const current = prev[planOrderId] || [];
          const exists = current.some((c) => c.checklist_key === checklistKey);
          return {
            ...prev,
            [planOrderId]: exists
              ? current.map((c) => c.checklist_key === checklistKey ? optimisticItem : c)
              : [...current, optimisticItem],
          };
        });

        const dateLabel = checklistDate
          ? ` (${new Date(checklistDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })})`
          : '';

        await supabase.from('po_tracker_comments').insert({
          plan_order_id: planOrderId,
          user_id: user.id,
          message: `${checkerName} mencentang '${LABEL_MAP[checklistKey] ?? checklistKey}'${dateLabel}`,
          type: 'activity',
        });

        await fetchData();
      } catch (err) {
        console.error('toggleChecklist error:', err);
        toast.error('Gagal mengupdate checklist');
      }
    },
    [user, userRole, checklists, fetchData]
  );

  const canToggleChecklist = userRole
    ? CHECKLIST_CAN_TOGGLE_ROLES.includes(userRole)
    : false;

  return {
    planOrders,
    checklists,
    loading,
    userRole,
    fetchData,
    getColumnCards,
    toggleChecklist,
    canToggleChecklist,
    isInvoiceDone,
  };
}
