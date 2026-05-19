// src/lib/arApSync.ts
// Integrasi WMS → AR/AP System (Auto-sync)

import { supabase } from '@/integrations/supabase/client';

// Reset cache (kept as no-op for backward compatibility).
// API key sekarang disimpan server-side; tidak ada cache client.
export function clearApiKeyCache() {
  /* no-op: API key is now server-side in the arap-sync-proxy edge function */
}

interface SyncResult {
  success: boolean;
  error?: string;
  data?: any;
}

async function sendToArAp(
  entity: string,
  action: string,
  data: Record<string, any>
): Promise<SyncResult> {
  try {
    const { data: result, error } = await supabase.functions.invoke(
      'arap-sync-proxy',
      { body: { entity, action, data } },
    );

    if (error) {
      console.error(`[AR/AP Sync] ${entity} failed:`, error);
      return { success: false, error: error.message || 'Sync failed' };
    }
    if (result && result.success === false) {
      return { success: false, error: result.error || 'Sync failed' };
    }
    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    console.error(`[AR/AP Sync] ${entity} error:`, message);
    return { success: false, error: message };
  }
}

// ============================================
// 1. SYNC CUSTOMER (WMS → AR)
// ============================================
export async function syncCustomerToArAp(customer: {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}): Promise<SyncResult> {
  return sendToArAp('customer', 'upsert', {
    customer_name: customer.name,
    address: customer.address || null,
    phone: customer.phone || null,
    billing_email: customer.email || null,
  });
}

// ============================================
// 2. SYNC VENDOR/SUPPLIER (WMS → AP)
// ============================================
export async function syncVendorToArAp(supplier: {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}): Promise<SyncResult> {
  return sendToArAp('vendor', 'upsert', {
    vendor_name: supplier.name,
    address: supplier.address || null,
    phone: supplier.phone || null,
    email: supplier.email || null,
  });
}

// ============================================
// 3. SALES ORDER → AR INVOICE (otomatis saat SO approved)
// ============================================
export async function syncSalesOrderToAr(order: {
  customerName: string;
  salesOrderNumber: string;
  customerPoNumber?: string | null;
  invoiceNumber: string;
  orderDate: string;
  grandTotal: number;
  salesName?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
}): Promise<SyncResult> {
  return sendToArAp('sales_order', 'upsert', {
    customer_name: order.customerName,
    order_number: order.salesOrderNumber,
    customer_po_number: order.customerPoNumber || null,
    invoice_number: order.invoiceNumber,
    invoice_date: order.orderDate,
    sp_po_date: order.orderDate,
    invoice_amount: order.grandTotal,
    sales_name: order.salesName || null,
    payment_terms_name: order.paymentTerms || null,
    notes: order.notes || `Auto-sync from WMS SO: ${order.salesOrderNumber}`,
  });
}

// ============================================
// 4. PLAN ORDER → AP INVOICE (otomatis saat PO approved)
// ============================================
export async function syncPlanOrderToAp(order: {
  supplierName: string;
  planNumber: string;
  vendorInvoiceNumber: string;
  planDate: string;
  grandTotal: number;
  paymentTerms?: string | null;
  notes?: string | null;
}): Promise<SyncResult> {
  return sendToArAp('plan_order', 'upsert', {
    vendor_name: order.supplierName,
    po_number: order.planNumber,
    vendor_invoice_number: order.vendorInvoiceNumber,
    invoice_date: order.planDate,
    sp_po_date: order.planDate,
    invoice_amount: order.grandTotal,
    payment_terms_name: order.paymentTerms || null,
    notes: order.notes || `Auto-sync from WMS PO: ${order.planNumber}`,
  });
}

// ============================================
// 5. BATCH SYNC
// ============================================
export async function batchSyncCustomers(
  customers: Array<{
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  }>
): Promise<SyncResult> {
  const data = customers.map((c) => ({
    customer_name: c.name,
    address: c.address || null,
    phone: c.phone || null,
    billing_email: c.email || null,
  }));
  return sendToArAp('customer', 'sync_batch', data as any);
}

export async function batchSyncVendors(
  suppliers: Array<{
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  }>
): Promise<SyncResult> {
  const data = suppliers.map((s) => ({
    vendor_name: s.name,
    address: s.address || null,
    phone: s.phone || null,
    email: s.email || null,
  }));
  return sendToArAp('vendor', 'sync_batch', data as any);
}
