import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Printer, X, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface StockOutRecord {
  id: string;
  stock_out_number: string;
  delivery_date: string;
  delivery_number?: string | null;
  delivery_actual_date?: string | null;
  notes?: string | null;
  sales_order: {
    sales_order_number: string;
    customer: { name: string } | null;
  } | null;
  items: {
    id: string;
    qty_out: number;
    batch: { batch_no: string; expired_date: string | null } | null;
    product: { name: string; sku: string | null } | null;
  }[];
}

interface OutboundPdfPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: StockOutRecord | null;
}

export function OutboundPdfPreview({ open, onOpenChange, record }: OutboundPdfPreviewProps) {
  const { language } = useLanguage();
  const [isPrinting, setIsPrinting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  if (!record) return null;

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd MMM yyyy', { locale: localeId });
  };

  const displayNo = record.delivery_number || record.stock_out_number;
  const displayDate = record.delivery_actual_date || record.delivery_date;

  const handlePrint = async () => {
    if (!contentRef.current) return;
    
    setIsPrinting(true);
    
    try {
      // Create off-screen container for A4 rendering
      const offscreenContainer = document.createElement('div');
      offscreenContainer.style.position = 'absolute';
      offscreenContainer.style.left = '-9999px';
      offscreenContainer.style.top = '0';
      offscreenContainer.style.width = '210mm';
      offscreenContainer.style.minHeight = '297mm';
      offscreenContainer.style.padding = '15mm';
      offscreenContainer.style.backgroundColor = '#ffffff';
      offscreenContainer.style.boxSizing = 'border-box';
      document.body.appendChild(offscreenContainer);

      // Clone content
      const clonedContent = contentRef.current.cloneNode(true) as HTMLElement;
      clonedContent.style.width = '100%';
      offscreenContainer.appendChild(clonedContent);

      // Wait for images
      const images = offscreenContainer.querySelectorAll('img');
      await Promise.all(
        Array.from(images).map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) {
                resolve();
              } else {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              }
            })
        )
      );

      // Capture with html2canvas
      const canvas = await html2canvas(offscreenContainer, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      // Generate PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, Math.min(pdfHeight, 297));
      pdf.save(`${displayNo.replace(/\//g, '-')}-Delivery-Report.pdf`);

      // Cleanup
      document.body.removeChild(offscreenContainer);
    } catch (error) {
      console.error('PDF generation error:', error);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5" />
            {language === 'en' ? 'Print Outbound Report' : 'Cetak Laporan Pengiriman'}
          </DialogTitle>
        </DialogHeader>

        {/* PDF Preview Content */}
        <div className="border rounded-lg p-6 bg-white" ref={contentRef}>
          {/* Header */}
          <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-gray-800">
            <div className="flex items-center gap-4">
              <img 
                src="/logo-kemika.png" 
                alt="Kemika Logo" 
                className="h-14 object-contain"
                crossOrigin="anonymous"
              />
              <div>
                <h1 className="text-xl font-bold text-gray-900">PT. KEMIKA KARYA PRATAMA</h1>
                <p className="text-sm text-gray-600">Warehouse Management System</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-bold text-gray-900">OUTBOUND REPORT</h2>
              <p className="text-sm text-gray-600">Delivery Document</p>
            </div>
          </div>

          {/* Info Section */}
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div className="space-y-2">
              <div className="flex">
                <span className="w-28 text-gray-600">No. DO</span>
                <span className="font-semibold">: {displayNo}</span>
              </div>
              <div className="flex">
                <span className="w-28 text-gray-600">Tanggal Kirim</span>
                <span className="font-semibold">: {formatDate(displayDate)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex">
                <span className="w-28 text-gray-600">Sales Order</span>
                <span className="font-semibold">: {record.sales_order?.sales_order_number || '-'}</span>
              </div>
              <div className="flex">
                <span className="w-28 text-gray-600">Customer</span>
                <span className="font-semibold">: {record.sales_order?.customer?.name || '-'}</span>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-6">
            <h3 className="font-bold text-gray-900 mb-2">Detail Item Dikirim</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-800 text-white">
                  <th className="border border-gray-300 px-2 py-2 text-left w-8">No</th>
                  <th className="border border-gray-300 px-2 py-2 text-left">Produk</th>
                  <th className="border border-gray-300 px-2 py-2 text-left">SKU</th>
                  <th className="border border-gray-300 px-2 py-2 text-center w-16">Qty</th>
                  <th className="border border-gray-300 px-2 py-2 text-left">Batch No</th>
                  <th className="border border-gray-300 px-2 py-2 text-left">Expiry</th>
                </tr>
              </thead>
              <tbody>
                {record.items.map((item, idx) => (
                  <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-300 px-2 py-2">{idx + 1}</td>
                    <td className="border border-gray-300 px-2 py-2 font-medium">{item.product?.name || '-'}</td>
                    <td className="border border-gray-300 px-2 py-2 text-gray-600">{item.product?.sku || '-'}</td>
                    <td className="border border-gray-300 px-2 py-2 text-center font-semibold">{item.qty_out}</td>
                    <td className="border border-gray-300 px-2 py-2">{item.batch?.batch_no || '-'}</td>
                    <td className="border border-gray-300 px-2 py-2">{item.batch?.expired_date ? formatDate(item.batch.expired_date) : '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan={3} className="border border-gray-300 px-2 py-2 text-right">Total Qty:</td>
                  <td className="border border-gray-300 px-2 py-2 text-center">
                    {record.items.reduce((sum, item) => sum + item.qty_out, 0)}
                  </td>
                  <td colSpan={2} className="border border-gray-300 px-2 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Delivery Checklist */}
          <div className="mb-6">
            <h3 className="font-bold text-gray-900 mb-2">Delivery Checklist</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-800 text-white">
                  <th className="border border-gray-300 px-3 py-2 text-left w-8">No</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Item Pemeriksaan</th>
                  <th className="border border-gray-300 px-3 py-2 text-center w-40">Status</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white">
                  <td className="border border-gray-300 px-3 py-3">1</td>
                  <td className="border border-gray-300 px-3 py-3">Kesesuaian Barang dengan SO</td>
                  <td className="border border-gray-300 px-3 py-3">
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', whiteSpace: 'nowrap' }}>
                      <span className="text-gray-600">☐ Sesuai</span>
                      <span className="text-gray-600">☐ Tidak</span>
                    </div>
                  </td>
                  <td className="border border-gray-300 px-3 py-3"></td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 px-3 py-3">2</td>
                  <td className="border border-gray-300 px-3 py-3">Kondisi Kemasan</td>
                  <td className="border border-gray-300 px-3 py-3">
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                      <span className="text-gray-600">☐ Baik</span>
                      <span className="text-gray-600">☐ Rusak</span>
                      <span className="text-gray-600">☐ Bocor</span>
                    </div>
                  </td>
                  <td className="border border-gray-300 px-3 py-3"></td>
                </tr>
                <tr className="bg-white">
                  <td className="border border-gray-300 px-3 py-3">3</td>
                  <td className="border border-gray-300 px-3 py-3">Label & Batch Terbaca</td>
                  <td className="border border-gray-300 px-3 py-3">
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', whiteSpace: 'nowrap' }}>
                      <span className="text-gray-600">☐ Ya</span>
                      <span className="text-gray-600">☐ Tidak</span>
                    </div>
                  </td>
                  <td className="border border-gray-300 px-3 py-3"></td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 px-3 py-3">4</td>
                  <td className="border border-gray-300 px-3 py-3">Qty Sesuai dengan Dokumen</td>
                  <td className="border border-gray-300 px-3 py-3">
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', whiteSpace: 'nowrap' }}>
                      <span className="text-gray-600">☐ Ya</span>
                      <span className="text-gray-600">☐ Tidak</span>
                    </div>
                  </td>
                  <td className="border border-gray-300 px-3 py-3"></td>
                </tr>
                <tr className="bg-white">
                  <td className="border border-gray-300 px-3 py-3">5</td>
                  <td className="border border-gray-300 px-3 py-3">Dokumen Lengkap (SJ, Invoice)</td>
                  <td className="border border-gray-300 px-3 py-3">
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', whiteSpace: 'nowrap' }}>
                      <span className="text-gray-600">☐ Ya</span>
                      <span className="text-gray-600">☐ Tidak</span>
                    </div>
                  </td>
                  <td className="border border-gray-300 px-3 py-3"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Notes Section */}
          <div className="mb-8">
            <h3 className="font-bold text-gray-900 mb-2">Catatan Pengiriman</h3>
            <div className="border border-gray-300 rounded p-3 min-h-[80px] bg-gray-50">
              <p className="text-gray-400 text-sm italic">Tuliskan catatan pengiriman di sini...</p>
            </div>
          </div>

          {/* Signature Section */}
          <div className="grid grid-cols-3 gap-6 mt-8 pt-4 border-t">
            <div className="text-center">
              <p className="font-semibold text-gray-900 mb-16">Disiapkan Oleh</p>
              <div className="border-t border-gray-400 pt-2 mx-4">
                <p className="text-sm text-gray-600">Warehouse</p>
              </div>
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-900 mb-16">Dikirim Oleh</p>
              <div className="border-t border-gray-400 pt-2 mx-4">
                <p className="text-sm text-gray-600">Driver</p>
              </div>
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-900 mb-16">Diterima Oleh</p>
              <div className="border-t border-gray-400 pt-2 mx-4">
                <p className="text-sm text-gray-600">Customer</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t text-center text-xs text-gray-500">
            <p>Dicetak pada: {format(new Date(), 'dd MMM yyyy HH:mm', { locale: localeId })}</p>
            <p>© {new Date().getFullYear()} PT. Kemika Karya Pratama</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Close' : 'Tutup'}
          </Button>
          <Button onClick={handlePrint} disabled={isPrinting}>
            {isPrinting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {language === 'en' ? 'Generating...' : 'Memproses...'}
              </>
            ) : (
              <>
                <Printer className="w-4 h-4 mr-2" />
                {language === 'en' ? 'Print / Save PDF' : 'Cetak / Simpan PDF'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
