import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { generateUniqueKALNumber } from '@/lib/transactionNumberUtils';

export interface CalibrationInstrumentInput {
  instrument_name: string;
  brand_model: string;
  serial_number: string;
  measurement_range: string;
  calibration_method: string;
  unit_price: number;
  sla_working_days: number;
}

export interface CalibrationReceiptRow {
  id: string;
  receipt_number: string;
  spk_number: string | null;
  status: 'draft' | 'spk_issued' | 'spk_signed' | 'converted_to_so' | 'cancelled';
  customer_id: string;
  customer: { id: string; name: string; pic: string | null; phone: string | null } | null;
  service_pic_name: string | null;
  service_pic_phone: string | null;
  service_location: string | null;
  received_date: string;
  target_completion_date: string | null;
  customer_request_notes: string | null;
  sales_order_id: string | null;
  archived: boolean;
  created_at: string;
  instruments: { id: string; instrument_name: string; unit_price: number }[];
}

export function useCalibrationReceipts() {
  const [receipts, setReceipts] = useState<CalibrationReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReceipts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('calibration_receipts')
      .select(`
        *,
        customer:customers(id, name, pic, phone),
        instruments:calibration_instruments(id, instrument_name, unit_price)
      `)
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Gagal memuat data penerimaan kalibrasi');
    } else {
      setReceipts((data || []) as unknown as CalibrationReceiptRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReceipts();

    const channel = supabase
      .channel('calibration_receipts_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calibration_receipts' }, fetchReceipts)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { receipts, loading, refetch: fetchReceipts };
}

export async function updateReceiptStatus(id: string, status: string) {
  const { error } = await supabase
    .from('calibration_receipts')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

export async function createCalibrationReceipt(
  header: {
    customer_id: string;
    service_pic_name: string;
    service_pic_phone: string;
    service_location: string;
    received_date: string;
    target_completion_date: string;
    customer_request_notes: string;
    created_by: string | null;
  },
  instruments: CalibrationInstrumentInput[]
): Promise<{ success: boolean; error?: string; id?: string; receipt_number?: string }> {
  try {
    const receipt_number = await generateUniqueKALNumber();

    const { data, error } = await supabase
      .from('calibration_receipts')
      .insert({
        receipt_number,
        customer_id: header.customer_id,
        service_pic_name: header.service_pic_name || null,
        service_pic_phone: header.service_pic_phone || null,
        service_location: header.service_location || 'Lab Kemika, Tangerang',
        received_date: header.received_date,
        target_completion_date: header.target_completion_date || null,
        customer_request_notes: header.customer_request_notes || null,
        status: 'draft',
        created_by: header.created_by,
      })
      .select('id, receipt_number')
      .single();

    if (error) throw error;
    const receiptId = (data as { id: string; receipt_number: string }).id;
    const receiptNumber = (data as { id: string; receipt_number: string }).receipt_number;

    if (instruments.length > 0) {
      const rows = instruments.map((inst, idx) => ({
        calibration_receipt_id: receiptId,
        item_number: idx + 1,
        instrument_name: inst.instrument_name,
        brand_model: inst.brand_model || null,
        serial_number: inst.serial_number || null,
        measurement_range: inst.measurement_range || null,
        calibration_method: inst.calibration_method || null,
        unit_price: inst.unit_price,
        sla_working_days: inst.sla_working_days || 5,
      }));
      const { error: instError } = await supabase.from('calibration_instruments').insert(rows);
      if (instError) throw instError;
    }

    return { success: true, id: receiptId, receipt_number: receiptNumber };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal menyimpan penerimaan';
    return { success: false, error: message };
  }
}
