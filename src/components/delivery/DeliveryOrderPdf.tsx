import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Printer, X, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { exportSectionBasedPdf } from '@/lib/pdfSectionExport';
import { PdfGeneratingOverlay } from '@/components/PdfGeneratingOverlay';
import { securePrint } from '@/lib/printUtils';

export interface DeliveryOrderData {
  id: string;
  delivery_number: string | null;
  stock_out_number: string;
  delivery_date: string;
  delivery_actual_date: string | null;
  notes: string | null;
  sales_order_number: string;
  customer_name: string;
  customer_po_number: string;
  customer_address: string | null;
  project_instansi: string;
  ship_to_address: string | null;
  sales_name: string;
  customer_pic: string | null;
  customer_phone: string | null;
  items: {
    id: string;
    product_name: string;
    sku: string | null;
    qty_out: number;
    batch_no: string;
    expired_date: string | null;
    unit_name: string | null;
  }[];
}

interface DeliveryOrderPdfProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DeliveryOrderData | null;
}

export function DeliveryOrderPdf({ open, onOpenChange, data }: DeliveryOrderPdfProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  if (!data) return null;

  const doNumber = data.delivery_number || data.stock_out_number;
  const doDate = data.delivery_actual_date || data.delivery_date;

  const formatDate = (dateStr: string) => format(new Date(dateStr), 'dd MMM yyyy', { locale: localeId });

  const handleSavePdf = async () => {
    if (!contentRef.current) return;
    setIsPrinting(true);
    setPdfProgress(0);

    try {
      await exportSectionBasedPdf({
        element: contentRef.current,
        filename: `DO-${doNumber}.pdf`,
        onProgress: setPdfProgress,
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('Gagal membuat PDF. Silakan coba lagi.');
    } finally {
      setIsPrinting(false);
      setPdfProgress(0);
    }
  };

  const handleBrowserPrint = () => {
    if (!contentRef.current) return;
    securePrint({
      title: `Delivery Order - ${doNumber}`,
      styles: `
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #111; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; font-size: 11px; }
        th { background: #166534 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print { body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { size: A4; margin: 0; } }
      `,
      content: contentRef.current.innerHTML,
    });
  };

  const shipAddress = data.ship_to_address || data.customer_address || '-';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5" />
            Delivery Order - {doNumber}
          </DialogTitle>
        </DialogHeader>

        {isPrinting && <PdfGeneratingOverlay isVisible={isPrinting} progress={pdfProgress} />}

        {/* PDF Content */}
        <div ref={contentRef} style={{ backgroundColor: '#ffffff' }}>
          <div data-pdf-root className="bg-white text-gray-900" style={{
            fontFamily: 'Arial, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '267mm',
            padding: '8mm 15mm 15mm 15mm',
            WebkitPrintColorAdjust: 'exact' as any,
          }}>

            {/* Section 1: Header */}
            <div data-pdf-section>
              {/* Top space for letterhead logo */}
              <div style={{ height: '95px' }}></div>

              {/* Title - right aligned but shifted left to avoid green kop surat */}
              <div style={{ textAlign: 'right', marginBottom: '2px', marginRight: '12mm' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px', color: '#111', margin: 0 }}>DELIVERY ORDER</h1>
              </div>
              <div style={{ borderBottom: '2px solid #111', marginBottom: '20px', marginRight: '12mm' }}></div>

              {/* Info two-column layout */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px', marginBottom: '24px', fontSize: '12px', color: '#111', lineHeight: '1.8' }}>
                {/* Left column */}
                <div>
                  <div style={{ display: 'flex' }}>
                    <span style={{ width: '90px', flexShrink: 0 }}>No. DO</span>
                    <span style={{ fontWeight: 'bold' }}>: {doNumber}</span>
                  </div>
                  <div style={{ display: 'flex' }}>
                    <span style={{ width: '90px', flexShrink: 0 }}>Date</span>
                    <span style={{ fontWeight: 'bold' }}>: {formatDate(doDate)}</span>
                  </div>
                  <div style={{ display: 'flex' }}>
                    <span style={{ width: '90px', flexShrink: 0 }}>No. SO</span>
                    <span>: {data.sales_order_number}</span>
                  </div>
                  <div style={{ display: 'flex' }}>
                    <span style={{ width: '90px', flexShrink: 0 }}>Customer</span>
                    <span style={{ fontWeight: 'bold' }}>: {data.customer_name}</span>
                  </div>
                  <div style={{ display: 'flex' }}>
                    <span style={{ width: '90px', flexShrink: 0 }}>PIC</span>
                    <span>: {data.customer_pic || '-'}</span>
                  </div>
                  <div style={{ display: 'flex' }}>
                    <span style={{ width: '90px', flexShrink: 0 }}>Phone</span>
                    <span>: {data.customer_phone || '-'}</span>
                  </div>
                </div>
                {/* Right column */}
                <div>
                  <div style={{ display: 'flex' }}>
                    <span style={{ width: '100px', flexShrink: 0 }}>No. PO</span>
                    <span style={{ fontWeight: 'bold' }}>: {data.customer_po_number}</span>
                  </div>
                  <div style={{ display: 'flex', marginTop: '4px' }}>
                    <span style={{ width: '100px', flexShrink: 0, textDecoration: 'underline' }}>Ship Address</span>
                    <span>:</span>
                  </div>
                  <div style={{ paddingLeft: '0', marginTop: '2px', fontSize: '12px', lineHeight: '1.6' }}>
                    {shipAddress}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Items Table */}
            <div data-pdf-section>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '7px 8px', textAlign: 'center', width: '35px', WebkitPrintColorAdjust: 'exact' as any }}>No.</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '7px 8px', textAlign: 'left', width: '80px', WebkitPrintColorAdjust: 'exact' as any }}>SKU</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '7px 8px', textAlign: 'left', WebkitPrintColorAdjust: 'exact' as any }}>Nama Produk</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '7px 8px', textAlign: 'center', width: '50px', WebkitPrintColorAdjust: 'exact' as any }}>Qty</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '7px 8px', textAlign: 'center', width: '60px', WebkitPrintColorAdjust: 'exact' as any }}>Satuan</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '7px 8px', textAlign: 'left', width: '90px', WebkitPrintColorAdjust: 'exact' as any }}>Batch No</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '7px 8px', textAlign: 'left', width: '80px', WebkitPrintColorAdjust: 'exact' as any }}>Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, idx) => (
                    <tr key={item.id}>
                      <td style={{ border: '1px solid #d1d5db', padding: '6px 8px', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '6px 8px', fontWeight: 500, color: '#166534' }}>{item.sku || '-'}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '6px 8px' }}>{item.product_name}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>{item.qty_out}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '6px 8px', textAlign: 'center' }}>{item.unit_name || '-'}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '6px 8px' }}>{item.batch_no}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '6px 8px' }}>{item.expired_date ? formatDate(item.expired_date) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section 3: Separator + Notes + Signature — pushed to bottom */}
            <div data-pdf-section data-pdf-bottom style={{ marginTop: 'auto' }}>
              {/* Separator line */}
              <div style={{ borderBottom: '1.5px solid #111', marginBottom: '16px' }}></div>

              {/* Notes box */}
              <div style={{ border: '1px solid #999', padding: '10px 14px', marginBottom: '20px', minHeight: '55px' }}>
                <p style={{ fontWeight: 600, fontSize: '12px', color: '#111', margin: '0 0 4px 0' }}>Note :</p>
                <p style={{ fontSize: '11px', color: '#333', margin: 0, whiteSpace: 'pre-wrap' }}>{data.notes || ''}</p>
              </div>

              {/* Signature Section - 4 columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', border: '1px solid #000' }}>
                {['Received by', 'Shipped by', 'Warehouse by', 'Approved by'].map((label, i) => (
                  <div key={label} style={{ borderRight: i < 3 ? '1px solid #000' : 'none' }}>
                    <div style={{ borderBottom: '1px solid #000', padding: '8px 10px', fontSize: '11px' }}>
                      Date :
                    </div>
                    <div style={{ padding: '8px 10px', fontSize: '11px', fontStyle: 'italic' }}>
                      {label},
                    </div>
                    <div style={{ height: '90px' }}></div>
                    <div style={{ padding: '4px 10px 12px', textAlign: 'center', fontSize: '10px', color: '#333' }}>
                      (........................................)
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom space for footnote/kop surat */}
              <div style={{ height: '65px' }}></div>
            </div>

          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" />
            Tutup
          </Button>
          <Button variant="outline" onClick={handleBrowserPrint}>
            <Printer className="w-4 h-4 mr-2" />
            Print Langsung
          </Button>
          <Button onClick={handleSavePdf} disabled={isPrinting}>
            {isPrinting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Simpan PDF
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
