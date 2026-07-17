import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getUserFriendlyError, ErrorMessages } from '@/lib/errorHandler';
import { syncSalesOrderToAr } from '@/lib/arApSync';
import {
  syncSalesOrderApprovedToSalesPulse,
  syncSalesOrderUpdatedToSalesPulse,
  syncSalesOrderCancelledToSalesPulse,
  sanitizeCustomerPoNumber,
  sanitizeSalesPulseReference,
} from '@/lib/salesPulseSync';
import {
  salesOrderHeaderSchema,
  salesOrderItemsArraySchema,
  validateData
} from '@/lib/validationSchemas';

// Fetch calibration instruments belonging to a calibration receipt (by receipt id).
// Used by the tracker kalibrasi detail dialog.
export function useCalibrationItems(receiptId: string | null | undefined) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!receiptId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('calibration_instruments')
        .select('*')
        .eq('calibration_receipt_id', receiptId)
        .order('item_number', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('useCalibrationItems error:', error);
        setItems([]);
      } else {
        setItems((data as any[]) || []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [receiptId]);

  return { items, loading };
}

// Log activity to delivery_comments for all delivery cards linked to a SO
async function logSoActivityToDeliveryCards(orderId: string, message: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: cards } = await supabase
      .from('delivery_requests')
      .select('id')
      .eq('sales_order_id', orderId);
    if (!cards || cards.length === 0) return;
    const rows = cards.map((c: { id: string }) => ({
      delivery_request_id: c.id,
      user_id: user.id,
      message,
      type: 'activity',
    }));
    await supabase.from('delivery_comments').insert(rows);
  } catch (e) {
    console.warn('[WMS] Gagal mencatat aktivitas SO ke delivery card:', e);
  }
}

export interface SalesOrderHeader {
  id: string;
  sales_order_number: string;
  order_date: string;
  customer_id: string;
  customer_po_number: string;
  sales_pulse_reference_number?: string | null;
  sales_name: string;
  allocation_type: string;
  project_instansi: string;
  delivery_deadline: string;
  ship_to_address: string | null;
  notes: string | null;
  po_document_url: string | null;
  status: string;
  total_amount: number;
  discount: number;
  tax_rate: number;
  shipping_cost: number;
  grand_total: number;
  created_at: string;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  order_type?: 'product' | 'service';
  customer?: {
    id: string;
    name: string;
    code: string;
    pic: string | null;
    phone: string | null;
    terms_payment: string | null;
    address: string | null;
  };
}

export interface SalesOrderItem {
  id: string;
  sales_order_id: string;
  product_id: string;
  unit_price: number;
  ordered_qty: number;
  qty_delivered: number;
  qty_remaining: number;
  discount: number;
  tax_rate: number;
  subtotal: number;
  notes: string | null;
  product?: {
    id: string;
    name: string;
    sku: string | null;
    category?: { name: string };
    unit?: { name: string };
  };
}

export interface InventoryBatch {
  id: string;
  product_id: string;
  batch_no: string;
  qty_on_hand: number;
  expired_date: string | null;
}


export function useSalesOrders() {
  const [salesOrders, setSalesOrders] = useState<SalesOrderHeader[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSalesOrders = async () => {
    setLoading(true);
    
    // Fetch sales orders with customer data
    const { data, error } = await supabase
      .from('sales_order_headers')
      .select(`
        *,
        customer:customers(id, name, code, pic, phone, terms_payment, address)
      `)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error(getUserFriendlyError(error, ErrorMessages.load.error('sales orders')));
      setLoading(false);
      return;
    }

    // Collect all user IDs (approvers + creators)
    const ordersWithApprover = data || [];
    const approverIds = [...new Set(ordersWithApprover
      .filter(o => o.approved_by)
      .map(o => o.approved_by))] as string[];
    const creatorIds = [...new Set(ordersWithApprover
      .filter(o => o.created_by)
      .map(o => o.created_by))] as string[];
    const allUserIds = [...new Set([...approverIds, ...creatorIds])];

    if (allUserIds.length > 0) {
      // Fetch profiles and signatures in parallel for all users
      const [profilesResult, signaturesResult] = await Promise.all([
        supabase.from('profiles_chat_view').select('id, full_name').in('id', allUserIds),
        supabase.from('user_signatures').select('user_id, signature_path').in('user_id', allUserIds)
      ]);

      const profileMap = new Map(profilesResult.data?.map(p => [p.id as string, p]) || []);
      const signatureMap = new Map(signaturesResult.data?.map(s => [s.user_id, s.signature_path]) || []);

      // Get signed URLs for signatures
      const signatureUrlMap = new Map<string, string>();
      for (const [userId, path] of signatureMap.entries()) {
        if (path) {
          const { data: urlData } = await supabase.storage
            .from('signatures')
            .createSignedUrl(path, 3600);
          if (urlData?.signedUrl) {
            signatureUrlMap.set(userId, urlData.signedUrl);
          }
        }
      }

      const enrichedOrders = ordersWithApprover.map(order => ({
        ...order,
        approver: order.approved_by ? {
          ...profileMap.get(order.approved_by),
          signature_url: signatureUrlMap.get(order.approved_by) || null
        } : null,
        creator: order.created_by ? {
          ...profileMap.get(order.created_by),
          signature_url: signatureUrlMap.get(order.created_by) || null
        } : null
      }));

      setSalesOrders(enrichedOrders as any);
    } else {
      setSalesOrders(ordersWithApprover as any);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchSalesOrders();

    // Realtime subscription for sales orders
    const channel = supabase
      .channel('sales-orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_order_headers' }, () => {
        fetchSalesOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { salesOrders, loading, refetch: fetchSalesOrders };
}

export function useSalesOrderItems(salesOrderId: string | null) {
  const [items, setItems] = useState<SalesOrderItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = async () => {
    if (!salesOrderId) {
      setItems([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('sales_order_items')
      .select(`
        *,
        product:products(
          id, name, sku,
          category:categories(name),
          unit:units(name)
        )
      `)
      .eq('sales_order_id', salesOrderId);

    if (error) {
      toast.error(getUserFriendlyError(error, ErrorMessages.load.error('items')));
    } else {
      setItems(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, [salesOrderId]);

  return { items, loading, refetch: fetchItems };
}


export async function getProductStock(productId: string): Promise<number> {
  const { data, error } = await supabase
    .from('inventory_batches')
    .select('qty_on_hand')
    .eq('product_id', productId);

  if (error) {
    console.error(error);
    return 0;
  }

  return (data || []).reduce((sum, batch) => sum + batch.qty_on_hand, 0);
}

export async function getProductBatches(productId: string): Promise<InventoryBatch[]> {
  const { data, error } = await supabase
    .from('inventory_batches')
    .select('*')
    .eq('product_id', productId)
    .gt('qty_on_hand', 0)
    .order('expired_date', { ascending: true, nullsFirst: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];
}

// Internal helper: ambil data SO dari DB & kirim event SO Updated ke Sales Pulse.
// Hanya akan kirim jika SO sudah pernah di-approve (status approved/partially_delivered/completed)
// dan punya reference number yang valid (REF- prefix).
async function syncSalesOrderUpdatedFromDb(orderId: string): Promise<void> {
  const { data: soData } = await supabase
    .from('sales_order_headers')
    .select(`
      id, sales_order_number, customer_po_number, sales_pulse_reference_number,
      order_date, grand_total, status,
      customer:customers(name)
    `)
    .eq('id', orderId)
    .single();

  if (!soData) return;

  const eligibleStatuses = ['approved', 'partially_delivered', 'completed'];
  if (!eligibleStatuses.includes(soData.status)) return;

  const reference = sanitizeSalesPulseReference(
    soData.sales_pulse_reference_number || soData.customer_po_number,
  );
  if (!reference) return;

  const { data: soItemsData } = await supabase
    .from('sales_order_items')
    .select(`
      ordered_qty, unit_price,
      product:products(sku, name, category:categories(name), unit:units(name))
    `)
    .eq('sales_order_id', orderId);

  const customer = soData.customer as unknown as { name: string } | null;
  const items = (soItemsData || []).map((item) => {
    const product = item.product as unknown as {
      sku: string | null;
      name: string;
      category?: { name?: string | null } | null;
      unit?: { name?: string | null } | null;
    } | null;
    return {
      sku: product?.sku || null,
      product_name: product?.name || 'Produk',
      category: product?.category?.name || null,
      unit: product?.unit?.name || 'pcs',
      qty: Number(item.ordered_qty ?? 0),
      price_per_unit: Number(item.unit_price ?? 0),
      other_cost: 0,
    };
  }).filter((item) => item.qty > 0 && item.price_per_unit >= 0);

  await syncSalesOrderUpdatedToSalesPulse({
    sales_order_id: soData.id,
    so_number: soData.sales_order_number,
    reference_number: reference,
    so_date: soData.order_date,
    total_value: Number(soData.grand_total ?? 0),
    customer_name: customer?.name || null,
    customer_po: sanitizeCustomerPoNumber(soData.customer_po_number),
    items,
  });
  console.log('[WMS] Sales Pulse SO Updated sync berhasil:', soData.sales_order_number);
}

export async function createSalesOrder(
  header: Omit<SalesOrderHeader, 'id' | 'created_at' | 'customer'>,
  items: Array<{
    product_id: string;
    unit_price: number;
    ordered_qty: number;
    discount?: number;
    tax_rate?: number;
    notes?: string;
  }>
): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    // Validate header data
    const headerValidation = validateData(salesOrderHeaderSchema, header);
    if (headerValidation.success === false) {
      return { success: false, error: headerValidation.errors.join(', ') };
    }

    // Validate items data
    const itemsValidation = validateData(salesOrderItemsArraySchema, items);
    if (itemsValidation.success === false) {
      return { success: false, error: itemsValidation.errors.join(', ') };
    }

    const validatedHeader = headerValidation.data;
    const validatedItems = itemsValidation.data;
    const salesPulseReferenceNumber = validatedHeader.sales_pulse_reference_number?.trim()
      || (sanitizeSalesPulseReference(validatedHeader.customer_po_number) ?? null);

    // Use RPC function to handle insert (avoids generated column issues)
    const { data, error } = await supabase.rpc('sales_order_create', {
      header_data: {
        sales_order_number: validatedHeader.sales_order_number,
        order_date: validatedHeader.order_date,
        customer_id: validatedHeader.customer_id,
        customer_po_number: validatedHeader.customer_po_number,
        sales_pulse_reference_number: salesPulseReferenceNumber,
        sales_name: validatedHeader.sales_name,
        allocation_type: validatedHeader.allocation_type,
        project_instansi: validatedHeader.project_instansi,
        delivery_deadline: validatedHeader.delivery_deadline,
        ship_to_address: validatedHeader.ship_to_address || null,
        notes: validatedHeader.notes || null,
        po_document_url: validatedHeader.po_document_url || null,
        status: validatedHeader.status || 'draft',
        total_amount: validatedHeader.total_amount || 0,
        discount: validatedHeader.discount || 0,
        tax_rate: validatedHeader.tax_rate || 0,
        shipping_cost: validatedHeader.shipping_cost || 0,
        grand_total: validatedHeader.grand_total || 0,
      },
      items_data: validatedItems.map(item => ({
        product_id: item.product_id,
        unit_price: item.unit_price,
        ordered_qty: item.ordered_qty,
        discount: item.discount || 0,
        notes: item.notes || null,
      })),
    });

    if (error) throw error;
    
    const result = data as { success: boolean; error?: string; id?: string };
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create sales order';
    return { success: false, error: message };
  }
}


export async function updateSalesOrder(
  orderId: string,
  header: Partial<SalesOrderHeader>,
  items: Array<{ product_id: string; unit_price: number; ordered_qty: number; discount?: number; }>
): Promise<{ success: boolean; error?: string }> {
  try {
    const salesPulseReferenceNumber = header.sales_pulse_reference_number?.trim()
      || (sanitizeSalesPulseReference(header.customer_po_number) ?? null);
    const { data, error } = await supabase.rpc('sales_order_update', {
      order_id: orderId,
      header_data: {
        ...header,
        sales_pulse_reference_number: salesPulseReferenceNumber,
      },
      items_data: items,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };

    // Sync ke Sales Pulse jika SO sudah pernah di-approve (so_number sudah ada di CRM)
    if (result.success) {
      await logSoActivityToDeliveryCards(orderId, '✏️ Sales Order diupdate (data SO berubah).');
      try {
        await syncSalesOrderUpdatedFromDb(orderId);
      } catch (syncErr) {
        console.warn('[WMS] Gagal sync update SO ke Sales Pulse:', syncErr);
      }
    }

    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update';
    return { success: false, error: message };
  }
}

export async function approveSalesOrder(orderId: string, approveReason?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sales_order_approve', { order_id: orderId, approve_reason: approveReason || null });
    if (error) throw error;

    const result = data as { success: boolean; error?: string };

    // Auto-sync ke AR/AP System setelah SO di-approve
    if (result.success) {
      try {
        const { data: soData } = await supabase
          .from('sales_order_headers')
          .select(`
            id, sales_order_number, customer_po_number, sales_pulse_reference_number, order_date, grand_total, sales_name, notes, order_type,
            customer:customers(name, terms_payment)
          `)
          .eq('id', orderId)
          .single();

const { data: soItemsData, error: soItemsError } = await supabase
          .from('sales_order_items')
          .select(`
            ordered_qty, unit_price,
            product:products(
              sku, name,
              category:categories(name),
              unit:units(name)
            )
          `)
          .eq('sales_order_id', orderId);

        if (soItemsError) {
          console.warn('[WMS] Gagal mengambil item SO untuk Sales Pulse:', soItemsError);
        }

        if (soData) {
          const customer = soData.customer as unknown as { name: string; terms_payment: string | null } | null;
          const salesPulseItems = (soItemsData || []).map((item) => {
            const product = item.product as unknown as {
              sku: string | null;
              name: string;
              category?: { name?: string | null } | null;
              unit?: { name?: string | null } | null;
            } | null;

            return {
              sku: product?.sku || null,
              product_name: product?.name || 'Produk',
              category: product?.category?.name || null,
              unit: product?.unit?.name || 'pcs',
              qty: Number(item.ordered_qty ?? 0),
              price_per_unit: Number(item.unit_price ?? 0),
              other_cost: 0,
            };
          }).filter((item) => item.qty > 0 && item.price_per_unit >= 0);

          const syncResult = await syncSalesOrderToAr({
            customerName: customer?.name || '',
            salesOrderNumber: soData.sales_order_number,
            customerPoNumber: soData.customer_po_number,
            invoiceNumber: soData.sales_order_number,
            orderDate: soData.order_date,
            grandTotal: soData.grand_total ?? 0,
            salesName: soData.sales_name,
            paymentTerms: customer?.terms_payment,
            notes: soData.notes,
          });

          if (syncResult.success) {
            console.log('[WMS] AR Invoice berhasil dibuat dari SO:', soData.sales_order_number);
          } else {
            console.warn('[WMS] Gagal sync SO ke AR/AP:', syncResult.error);
          }

          const salesPulseReference = sanitizeSalesPulseReference(
            soData.sales_pulse_reference_number || soData.customer_po_number,
          );
          if (salesPulseReference) {
            try {
              await syncSalesOrderApprovedToSalesPulse({
                sales_order_id: soData.id,
                reference_number: salesPulseReference,
                so_number: soData.sales_order_number,
                so_date: soData.order_date,
                total_value: Number(soData.grand_total ?? 0),
                customer_name: customer?.name || null,
                customer_po: sanitizeCustomerPoNumber(soData.customer_po_number),
                items: salesPulseItems,
              });
              console.log('[WMS] Sales Pulse sync berhasil:', soData.sales_order_number);
            } catch (salesPulseErr) {
              console.warn('[WMS] Gagal sync SO ke Sales Pulse:', salesPulseErr);
            }
          }
        }
      } catch (syncErr) {
        console.warn('[WMS] Error saat sync ke AR/AP:', syncErr);
      }
    }

    return result;
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to approve' };
  }
}

export async function cancelSalesOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Ambil data SO dulu untuk dapat reference & so_number sebelum stage berubah
    const { data: soBefore } = await supabase
      .from('sales_order_headers')
      .select('id, sales_order_number, customer_po_number, sales_pulse_reference_number, status')
      .eq('id', orderId)
      .single();

    const { data, error } = await supabase.rpc('sales_order_cancel', { order_id: orderId });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };

    // Auto-archive kanban card when SO is cancelled
    if (result.success) {
      try {
        await supabase
          .from('delivery_requests')
          .update({ board_status: 'archived', moved_at: new Date().toISOString() })
          .eq('sales_order_id', orderId);
      } catch (archiveErr) {
        console.warn('Failed to auto-archive delivery card:', archiveErr);
      }

      // Sync ke Sales Pulse (soft cancel) jika SO sudah pernah di-approve
      if (soBefore && ['approved', 'partially_delivered', 'completed'].includes(soBefore.status)) {
        const reference = sanitizeSalesPulseReference(
          soBefore.sales_pulse_reference_number || soBefore.customer_po_number,
        );
        if (reference) {
          try {
            await syncSalesOrderCancelledToSalesPulse({
              sales_order_id: soBefore.id,
              so_number: soBefore.sales_order_number,
              reference_number: reference,
              cancelled_at: new Date().toISOString(),
              reason: 'SO dibatalkan dari WMS',
            });
            console.log('[WMS] Sales Pulse SO Cancelled sync berhasil:', soBefore.sales_order_number);
          } catch (cancelSyncErr) {
            console.warn('[WMS] Gagal sync cancel SO ke Sales Pulse:', cancelSyncErr);
          }
        }
      }
    }

    return result;
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to cancel' };
  }
}

export async function deleteSalesOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sales_order_soft_delete', { order_id: orderId });
    if (error) throw error;
    return data as { success: boolean; error?: string };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete' };
  }
}

// Revision Request - any user can request
export async function requestSalesOrderRevision(orderId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sales_order_request_revision', { order_id: orderId, revision_reason: reason });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    if (result.success) {
      await logSoActivityToDeliveryCards(orderId, `📝 Revisi SO diminta. Alasan: ${reason}`);
    }
    return result;
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to request revision' };
  }
}

// Approve Revision - admin/super_admin only
export async function approveSalesOrderRevision(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sales_order_approve_revision', { order_id: orderId });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };

    // Sync revisi yang sudah di-approve ke Sales Pulse
    if (result.success) {
      await logSoActivityToDeliveryCards(orderId, '✅ Revisi SO disetujui.');
      try {
        await syncSalesOrderUpdatedFromDb(orderId);
      } catch (syncErr) {
        console.warn('[WMS] Gagal sync approve revision SO ke Sales Pulse:', syncErr);
      }
    }

    return result;
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to approve revision' };
  }
}

// Reject Revision - admin/super_admin only
export async function rejectSalesOrderRevision(orderId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sales_order_reject_revision', { order_id: orderId, reject_reason: reason || null });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    if (result.success) {
      await logSoActivityToDeliveryCards(orderId, `❌ Revisi SO ditolak${reason ? `. Alasan: ${reason}` : '.'}`);
    }
    return result;
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to reject revision' };
  }
}
