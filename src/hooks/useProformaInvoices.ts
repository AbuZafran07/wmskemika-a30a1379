import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ProformaInvoice {
  id: string;
  pi_number: string;
  sales_order_id: string;
  customer_id: string;
  delivery_request_id: string | null;
  subtotal: number;
  discount: number;
  tax_rate: number;
  tax_amount: number;
  shipping_cost: number;
  other_costs: number;
  materai_amount: number;
  grand_total: number;
  customer_type: string | null;
  payment_terms: string | null;
  status: string;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  dp_percent?: number | null;
  term_days?: number | null;
  payment_note?: string | null;
  // Joined
  customer?: { name: string; code: string; customer_type: string | null };
  sales_order?: { sales_order_number: string; customer_po_number: string; sales_name: string };
  items?: ProformaInvoiceItem[];
  approved_by_profile?: { full_name: string | null; email?: string | null } | null;
  created_by_profile?: { full_name: string | null; email?: string | null } | null;
  payment_labels?: string[];
}

export interface ProformaInvoiceItem {
  id: string;
  proforma_invoice_id: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  discount: number;
  subtotal: number;
  notes: string | null;
}

const MATERAI_THRESHOLD = 5000000;
const DEFAULT_MATERAI_AMOUNT = 10000;

export function useMateraiSetting() {
  return useQuery({
    queryKey: ['settings', 'materai_amount'],
    queryFn: async () => {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'materai_amount')
        .maybeSingle();
      return data?.value ? Number(data.value) : DEFAULT_MATERAI_AMOUNT;
    },
  });
}

export function calculateMaterai(
  customerType: string | null | undefined,
  subtotal: number,
  otherCosts: number,
  taxAmount: number,
  materaiAmount: number = DEFAULT_MATERAI_AMOUNT
): number {
  // Government customers are exempt from materai
  if (customerType?.toLowerCase() === 'government') return 0;
  
  const total = subtotal + otherCosts + taxAmount;
  if (total > MATERAI_THRESHOLD) return materaiAmount;
  return 0;
}

export function useProformaInvoices() {
  return useQuery({
    queryKey: ['proforma_invoices'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('proforma_invoices' as any)
        .select(`
          *,
          customer:customers!customer_id(name, code, customer_type),
          sales_order:sales_order_headers!sales_order_id(sales_order_number, customer_po_number, sales_name)
        `)
        .order('created_at', { ascending: false }) as any);
      
      if (error) throw error;
      return (data || []) as ProformaInvoice[];
    },
  });
}

export function useProformaInvoiceDetail(id: string | null) {
  return useQuery({
    queryKey: ['proforma_invoice', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('proforma_invoices' as any)
        .select(`
          *,
          customer:customers!customer_id(name, code, customer_type, address, city, pic),
          sales_order:sales_order_headers!sales_order_id(sales_order_number, customer_po_number, sales_name)
        `)
        .eq('id', id!)
        .single() as any);
      
      if (error) throw error;

      // Fetch items
      const { data: items } = await (supabase
        .from('proforma_invoice_items' as any)
        .select('*, product:products!product_id(sku, unit:units!unit_id(name))')
        .eq('proforma_invoice_id', id!) as any);

      // Fetch profiles & signature
      let approvedByProfile = null;
      let createdByProfile = null;
      let approverSignatureUrl: string | null = null;
      
      if (data.approved_by) {
        const { data: p } = await supabase.from('profiles').select('full_name').eq('id', data.approved_by).maybeSingle();
        approvedByProfile = p;
        // Fetch approver signature
        const { data: sig } = await supabase.from('user_signatures').select('signature_path').eq('user_id', data.approved_by).maybeSingle();
        if (sig?.signature_path) {
          const { data: urlData } = await supabase.storage.from('signatures').createSignedUrl(sig.signature_path, 3600);
          approverSignatureUrl = urlData?.signedUrl || null;
        }
      }
      if (data.created_by) {
        const { data: p } = await supabase.from('profiles').select('full_name').eq('id', data.created_by).maybeSingle();
        createdByProfile = p;
      }

      // Fetch payment labels (CBD / DP + Termin) from linked delivery_request
      let paymentLabels: string[] = [];
      if (data.delivery_request_id) {
        const { data: cardLabels } = await supabase
          .from('delivery_card_labels')
          .select('label_id')
          .eq('delivery_request_id', data.delivery_request_id);
        const labelIds = (cardLabels || []).map((l: any) => l.label_id);
        if (labelIds.length) {
          const { data: labels } = await supabase
            .from('delivery_labels')
            .select('name')
            .in('id', labelIds);
          paymentLabels = (labels || []).map((l: any) => l.name);
        }
      }

      return { ...data, items: items || [], approved_by_profile: approvedByProfile, created_by_profile: createdByProfile, approver_signature_url: approverSignatureUrl, payment_labels: paymentLabels } as ProformaInvoice & { approver_signature_url: string | null };
    },
  });
}

export function useApprovePI() {
  const qc = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (piId: string) => {
      // Fetch PI details for system comment
      const { data: piRow } = await (supabase
        .from('proforma_invoices' as any)
        .select('pi_number, delivery_request_id')
        .eq('id', piId)
        .single() as any);

      const { error } = await (supabase
        .from('proforma_invoices' as any)
        .update({
          status: 'approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', piId) as any);
      if (error) throw error;

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        user_email: user?.email,
        action: 'approve',
        module: 'proforma_invoice',
        ref_id: piId,
        ref_table: 'proforma_invoices',
      });

      // Add system comment to Kanban card
      if (piRow?.delivery_request_id && user?.id) {
        await supabase.from('delivery_comments').insert({
          delivery_request_id: piRow.delivery_request_id,
          user_id: user.id,
          message: `✅ Proforma Invoice ${piRow.pi_number || piId} telah di-approve.`,
          type: 'activity',
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proforma_invoices'] });
      qc.invalidateQueries({ queryKey: ['proforma_invoice'] });
      toast.success('Proforma Invoice berhasil di-approve');
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useRejectPI() {
  const qc = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ piId, reason }: { piId: string; reason: string }) => {
      // Fetch PI details first for the system comment
      const { data: piRow } = await (supabase
        .from('proforma_invoices' as any)
        .select('pi_number, delivery_request_id')
        .eq('id', piId)
        .single() as any);

      const { error } = await (supabase
        .from('proforma_invoices' as any)
        .update({
          status: 'rejected',
          rejected_reason: reason,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', piId) as any);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        user_email: user?.email,
        action: 'reject',
        module: 'proforma_invoice',
        ref_id: piId,
        ref_table: 'proforma_invoices',
      });

      // Add system comment to Kanban card
      if (piRow?.delivery_request_id && user?.id) {
        const reasonText = reason ? `\nAlasan: ${reason}` : '';
        await supabase.from('delivery_comments').insert({
          delivery_request_id: piRow.delivery_request_id,
          user_id: user.id,
          message: `❌ Proforma Invoice ${piRow.pi_number || piId} ditolak.${reasonText}`,
          type: 'activity',
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proforma_invoices'] });
      qc.invalidateQueries({ queryKey: ['proforma_invoice'] });
      toast.success('Proforma Invoice ditolak');
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useCancelPI() {
  const qc = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ piId, reason }: { piId: string; reason: string }) => {
      // Fetch PI details for system comment
      const { data: piRow } = await (supabase
        .from('proforma_invoices' as any)
        .select('pi_number, delivery_request_id')
        .eq('id', piId)
        .single() as any);

      const { error } = await (supabase
        .from('proforma_invoices' as any)
        .update({
          status: 'cancelled',
          cancelled_by: user?.id,
          cancelled_at: new Date().toISOString(),
          cancel_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', piId) as any);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        user_email: user?.email,
        action: 'cancel',
        module: 'proforma_invoice',
        ref_id: piId,
        ref_table: 'proforma_invoices',
      });

      // Add system comment to Kanban card
      if (piRow?.delivery_request_id && user?.id) {
        const reasonText = reason ? `\nAlasan: ${reason}` : '';
        await supabase.from('delivery_comments').insert({
          delivery_request_id: piRow.delivery_request_id,
          user_id: user.id,
          message: `🚫 Proforma Invoice ${piRow.pi_number || piId} dibatalkan.${reasonText}`,
          type: 'activity',
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proforma_invoices'] });
      qc.invalidateQueries({ queryKey: ['proforma_invoice'] });
      toast.success('Proforma Invoice dibatalkan');
    },
    onError: (err: any) => toast.error(err.message),
  });
}

/**
 * Generate unique PI number: PI/YYYYMMDD.XX
 */
export async function generateUniquePINumber(): Promise<string> {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const prefix = `PI/${dateStr}.`;

  const { data } = await (supabase
    .from('proforma_invoices' as any)
    .select('pi_number')
    .like('pi_number', `${prefix}%`)
    .order('pi_number', { ascending: false })
    .limit(1) as any);

  const lastNumber = data?.[0]?.pi_number || null;
  let sequence = 1;
  if (lastNumber) {
    const match = lastNumber.match(/\.(\d+)$/);
    if (match) sequence = parseInt(match[1], 10) + 1;
  }

  return `${prefix}${String(sequence).padStart(2, '0')}`;
}
