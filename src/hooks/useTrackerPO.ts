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
  checker_name?: string;
}

const ACTIVE_STATUSES = ['approved', 'partially_received', 'received'];
const CHECKLIST_CAN_TOGGLE_ROLES = ['super_admin', 'admin', 'purchasing'];

export function useTrackerPO() {
  const { user } = useAuth();
  const [planOrders, setPlanOrders] = useState<PlanOrderHeader[]>([]);
  const [checklists, setChecklists] = useState<Record<string, ChecklistItem[]>>({});
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user role once
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
      // Fetch plan orders with supplier data
      const { data: orders, error: ordersError } = await supabase
        .from('plan_order_headers')
        .select(`
          id, plan_number, plan_date, supplier_id, expected_delivery_date,
          reference_no, notes, status, total_amount, discount, tax_rate,
          shipping_cost, grand_total, created_at, created_by, approved_by,
          approved_at, po_document_url,
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

      // Fetch checklists for all visible POs
      const ids = typedOrders.map((o) => o.id);
      const { data: checklistData, error: checklistError } = await supabase
        .from('po_tracker_checklists')
        .select('id, plan_order_id, checklist_key, is_checked, checked_by, checked_at')
        .in('plan_order_id', ids);

      if (checklistError) throw checklistError;

      // Enrich with checker names
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscriptions
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

  // Determine which kanban column a PO belongs to
  const getColumnCards = useCallback(
    (col: 'plan_order' | 'processing' | 'in_stock') => {
      return planOrders.filter((order) => {
        const submitted = checklists[order.id]?.find(
          (c) => c.checklist_key === 'submitted' && c.is_checked
        );
        const isReceived = order.status === 'received';

        if (col === 'plan_order') {
          return !submitted && !isReceived;
        }
        if (col === 'processing') {
          return !!submitted && !isReceived;
        }
        // in_stock
        return isReceived;
      });
    },
    [planOrders, checklists]
  );

  // Toggle checklist — only one-way (false → true), role-gated
  const toggleChecklist = useCallback(
    async (planOrderId: string, checklistKey: string) => {
      if (!user || !userRole) return;
      if (!CHECKLIST_CAN_TOGGLE_ROLES.includes(userRole)) {
        toast.error('Anda tidak memiliki akses untuk mengubah checklist');
        return;
      }

      const existing = checklists[planOrderId]?.find((c) => c.checklist_key === checklistKey);
      if (existing?.is_checked) return; // Already checked, immutable

      const checkerName = (user as any).name || (user as any).email || 'User';
      const labelMap: Record<string, string> = {
        submitted: 'Submitted',
        vendor_confirmation: 'Vendor Confirmation',
        payment_process: 'Payment Process',
      };

      try {
        const { error } = await supabase.from('po_tracker_checklists').upsert(
          {
            plan_order_id: planOrderId,
            checklist_key: checklistKey,
            is_checked: true,
            checked_by: user.id,
            checked_at: new Date().toISOString(),
          },
          { onConflict: 'plan_order_id,checklist_key' }
        );
        if (error) throw error;

        // Log activity
        await supabase.from('po_tracker_comments').insert({
          plan_order_id: planOrderId,
          user_id: user.id,
          message: `${checkerName} mencentang '${labelMap[checklistKey] ?? checklistKey}'`,
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
  };
}
