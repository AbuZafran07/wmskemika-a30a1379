import { supabase } from "@/integrations/supabase/client";

export type TransactionType = 
  | "stockIn"
  | "stockOut"
  | "planOrder"
  | "salesOrder"
  | "stockAdjustment";

interface NumberConfig {
  prefix: string;
}

const configs: Record<TransactionType, NumberConfig> = {
  stockIn: { prefix: "SI" },
  stockOut: { prefix: "DO" },
  planOrder: { prefix: "PO" },
  salesOrder: { prefix: "SO" },
  stockAdjustment: { prefix: "ADJ" },
};

/**
 * Get today's date formatted as YYYYMMDD
 */
function getTodayDateStr(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Generate date prefix for transaction number
 */
export function getDatePrefix(type: TransactionType): string {
  const config = configs[type];
  const dateStr = getTodayDateStr();
  return `${config.prefix}/${dateStr}.`;
}

/**
 * Parse sequence number from transaction number
 */
export function parseSequence(number: string, prefix: string): number {
  const match = number.match(new RegExp(`${prefix.replace("/", "\\/")}(\\d+)`));
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}

/**
 * Format sequence to transaction number
 */
export function formatTransactionNumber(type: TransactionType, sequence: number): string {
  const datePrefix = getDatePrefix(type);
  return `${datePrefix}${String(sequence).padStart(2, "0")}`;
}

// Type-safe duplicate checkers for each transaction type
export async function checkDuplicateStockIn(number: string): Promise<boolean> {
  const { data } = await supabase
    .from("stock_in_headers")
    .select("id")
    .eq("stock_in_number", number)
    .limit(1);
  return (data?.length || 0) > 0;
}

export async function checkDuplicateStockOut(number: string): Promise<boolean> {
  const { data } = await supabase
    .from("stock_out_headers")
    .select("id")
    .eq("stock_out_number", number)
    .limit(1);
  return (data?.length || 0) > 0;
}

export async function checkDuplicatePlanOrder(number: string): Promise<boolean> {
  const { data } = await supabase
    .from("plan_order_headers")
    .select("id")
    .eq("plan_number", number)
    .limit(1);
  return (data?.length || 0) > 0;
}

export async function checkDuplicateSalesOrder(number: string): Promise<boolean> {
  const { data } = await supabase
    .from("sales_order_headers")
    .select("id")
    .eq("sales_order_number", number)
    .limit(1);
  return (data?.length || 0) > 0;
}

export async function checkDuplicateStockAdjustment(number: string): Promise<boolean> {
  const { data } = await supabase
    .from("stock_adjustments")
    .select("id")
    .eq("adjustment_number", number)
    .limit(1);
  return (data?.length || 0) > 0;
}

// Get last number for each transaction type
export async function getLastStockInNumber(prefix: string): Promise<string | null> {
  const { data } = await supabase
    .from("stock_in_headers")
    .select("stock_in_number")
    .like("stock_in_number", `${prefix}%`)
    .order("stock_in_number", { ascending: false })
    .limit(1);
  return data?.[0]?.stock_in_number || null;
}

export async function getLastStockOutNumber(prefix: string): Promise<string | null> {
  const { data } = await supabase
    .from("stock_out_headers")
    .select("stock_out_number")
    .like("stock_out_number", `${prefix}%`)
    .order("stock_out_number", { ascending: false })
    .limit(1);
  return data?.[0]?.stock_out_number || null;
}

export async function getLastPlanOrderNumber(prefix: string): Promise<string | null> {
  const { data } = await supabase
    .from("plan_order_headers")
    .select("plan_number")
    .like("plan_number", `${prefix}%`)
    .order("plan_number", { ascending: false })
    .limit(1);
  return data?.[0]?.plan_number || null;
}

export async function getLastSalesOrderNumber(prefix: string): Promise<string | null> {
  const { data } = await supabase
    .from("sales_order_headers")
    .select("sales_order_number")
    .like("sales_order_number", `${prefix}%`)
    .order("sales_order_number", { ascending: false })
    .limit(1);
  return data?.[0]?.sales_order_number || null;
}

export async function getLastStockAdjustmentNumber(prefix: string): Promise<string | null> {
  const { data } = await supabase
    .from("stock_adjustments")
    .select("adjustment_number")
    .like("adjustment_number", `${prefix}%`)
    .order("adjustment_number", { ascending: false })
    .limit(1);
  return data?.[0]?.adjustment_number || null;
}

/**
 * Generate a unique transaction number with retry mechanism
 */
export async function generateUniqueStockInNumber(maxRetries = 5): Promise<string> {
  const prefix = getDatePrefix("stockIn");
  const lastNumber = await getLastStockInNumber(prefix);
  let sequence = lastNumber ? parseSequence(lastNumber, prefix) + 1 : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const number = formatTransactionNumber("stockIn", sequence + attempt);
    const isDuplicate = await checkDuplicateStockIn(number);
    if (!isDuplicate) return number;
  }

  // Fallback with timestamp
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
}

export async function generateUniqueStockOutNumber(maxRetries = 5): Promise<string> {
  const prefix = getDatePrefix("stockOut");
  const lastNumber = await getLastStockOutNumber(prefix);
  let sequence = lastNumber ? parseSequence(lastNumber, prefix) + 1 : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const number = formatTransactionNumber("stockOut", sequence + attempt);
    const isDuplicate = await checkDuplicateStockOut(number);
    if (!isDuplicate) return number;
  }

  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
}

export async function generateUniquePlanOrderNumber(maxRetries = 5): Promise<string> {
  const prefix = getDatePrefix("planOrder");
  const lastNumber = await getLastPlanOrderNumber(prefix);
  let sequence = lastNumber ? parseSequence(lastNumber, prefix) + 1 : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const number = formatTransactionNumber("planOrder", sequence + attempt);
    const isDuplicate = await checkDuplicatePlanOrder(number);
    if (!isDuplicate) return number;
  }

  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
}

export async function generateUniqueSalesOrderNumber(maxRetries = 5): Promise<string> {
  const prefix = getDatePrefix("salesOrder");
  const lastNumber = await getLastSalesOrderNumber(prefix);
  let sequence = lastNumber ? parseSequence(lastNumber, prefix) + 1 : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const number = formatTransactionNumber("salesOrder", sequence + attempt);
    const isDuplicate = await checkDuplicateSalesOrder(number);
    if (!isDuplicate) return number;
  }

  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
}

export async function generateUniqueStockAdjustmentNumber(maxRetries = 5): Promise<string> {
  const prefix = getDatePrefix("stockAdjustment");
  const lastNumber = await getLastStockAdjustmentNumber(prefix);
  let sequence = lastNumber ? parseSequence(lastNumber, prefix) + 1 : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const number = formatTransactionNumber("stockAdjustment", sequence + attempt);
    const isDuplicate = await checkDuplicateStockAdjustment(number);
    if (!isDuplicate) return number;
  }

  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
}

/**
 * Generate unique Delivery Order number with format DO/YYYYMMDD.XX
 */
/**
 * Format a Date object as YYYYMMDD
 */
function formatDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Generate unique Delivery Order number with format DO/YYYYMMDD.XX
 * @param deliveryDate - optional Date to use instead of today
 */
export async function generateUniqueDONumber(deliveryDate?: Date, maxRetries = 5): Promise<string> {
  const dateStr = deliveryDate ? formatDateStr(deliveryDate) : getTodayDateStr();
  const prefix = `DO/${dateStr}.`;

  const { data } = await supabase
    .from("delivery_orders")
    .select("do_number")
    .like("do_number", `${prefix}%`)
    .order("do_number", { ascending: false })
    .limit(1);

  const lastNumber = data?.[0]?.do_number || null;
  let sequence = lastNumber ? parseSequence(lastNumber, prefix) + 1 : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const number = `${prefix}${String(sequence + attempt).padStart(2, "0")}`;
    const { data: existing } = await supabase
      .from("delivery_orders")
      .select("id")
      .eq("do_number", number)
      .limit(1);
    if (!existing?.length) return number;
  }

  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
}

// ─── SPK & Certificate Number Generators ─────────────────────────────────────
// Format: LAB-SPK-YYYYMMDD.001 / LAB-SK-YYYYMMDD.001

async function getLastSPKNumber(prefix: string): Promise<string | null> {
  const { data } = await supabase
    .from("sales_order_headers")
    .select("spk_number")
    .like("spk_number", `${prefix}%`)
    .order("spk_number", { ascending: false })
    .limit(1);
  return (data?.[0] as any)?.spk_number || null;
}

async function checkDuplicateSPK(number: string): Promise<boolean> {
  const { data } = await supabase
    .from("sales_order_headers")
    .select("id")
    .eq("spk_number", number)
    .limit(1);
  return (data?.length || 0) > 0;
}

async function getLastCertNumber(prefix: string): Promise<string | null> {
  const { data } = await supabase
    .from("calibration_items")
    .select("certificate_number")
    .like("certificate_number", `${prefix}%`)
    .order("certificate_number", { ascending: false })
    .limit(1);
  return (data?.[0] as any)?.certificate_number || null;
}

async function checkDuplicateCert(number: string): Promise<boolean> {
  const { data } = await supabase
    .from("calibration_items")
    .select("id")
    .eq("certificate_number", number)
    .limit(1);
  return (data?.length || 0) > 0;
}

export async function generateUniqueSPKNumber(maxRetries = 5): Promise<string> {
  const prefix = `LAB-SPK-${getTodayDateStr()}.`;
  const lastNumber = await getLastSPKNumber(prefix);
  let sequence = lastNumber
    ? parseInt(lastNumber.slice(prefix.length), 10) + 1
    : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const number = `${prefix}${String(sequence + attempt).padStart(3, "0")}`;
    const isDuplicate = await checkDuplicateSPK(number);
    if (!isDuplicate) return number;
  }

  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
}

export async function generateUniqueCertNumber(maxRetries = 5): Promise<string> {
  const prefix = `LAB-SK-${getTodayDateStr()}.`;
  const lastNumber = await getLastCertNumber(prefix);
  let sequence = lastNumber
    ? parseInt(lastNumber.slice(prefix.length), 10) + 1
    : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const number = `${prefix}${String(sequence + attempt).padStart(3, "0")}`;
    const isDuplicate = await checkDuplicateCert(number);
    if (!isDuplicate) return number;
  }

  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
}

/**
 * Get the date for a delivery column (pengiriman_senin..jumat) in the current week
 */
export function getColumnDeliveryDate(boardStatus: string): Date {
  const dayMap: Record<string, number> = {
    pengiriman_senin: 1,  // Monday
    pengiriman_selasa: 2, // Tuesday
    pengiriman_rabu: 3,   // Wednesday
    pengiriman_kamis: 4,  // Thursday
    pengiriman_jumat: 5,  // Friday
  };

  const targetDay = dayMap[boardStatus];
  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun, 1=Mon...
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);

  if (targetDay !== undefined) {
    const result = new Date(monday);
    result.setDate(monday.getDate() + (targetDay - 1));
    return result;
  }

  return now; // fallback for delivered/delivered_sample
}
