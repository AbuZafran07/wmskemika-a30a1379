import React, { useState, useRef, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import usePermissions from '@/hooks/usePermissions';
import {
  useProformaInvoices,
  useProformaInvoiceDetail,
  useApprovePI,
  useRejectPI,
  useCancelPI,
  ProformaInvoice as PIType,
} from '@/hooks/useProformaInvoices';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Eye, CheckCircle, XCircle, Ban, Receipt, FileText, Printer, Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { toast } from 'sonner';
import { exportSectionBasedPdf } from '@/lib/pdfSectionExport';
import { sanitizeHtml } from '@/lib/printUtils';
import { PdfGeneratingOverlay } from '@/components/PdfGeneratingOverlay';
import PiPdfTemplate, { PiPdfData } from '@/components/reports/PiPdfTemplate';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Menunggu Approval', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Ditolak', variant: 'destructive' },
  cancelled: { label: 'Dibatalkan', variant: 'outline' },
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatDateID(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatDateTimeID(d: Date) {
  const date = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

function numberToWords(num: number): string {
  if (num === 0) return 'Nol';
  const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  const convert = (n: number): string => {
    if (n < 12) return satuan[n];
    if (n < 20) return satuan[n - 10] + ' Belas';
    if (n < 100) return satuan[Math.floor(n / 10)] + ' Puluh' + (n % 10 ? ' ' + satuan[n % 10] : '');
    if (n < 200) return 'Seratus' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 1000) return satuan[Math.floor(n / 100)] + ' Ratus' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 2000) return 'Seribu' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 1000000) return convert(Math.floor(n / 1000)) + ' Ribu' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 1000000000) return convert(Math.floor(n / 1000000)) + ' Juta' + (n % 1000000 ? ' ' + convert(n % 1000000) : '');
    if (n < 1000000000000) return convert(Math.floor(n / 1000000000)) + ' Miliar' + (n % 1000000000 ? ' ' + convert(n % 1000000000) : '');
    return convert(Math.floor(n / 1000000000000)) + ' Triliun' + (n % 1000000000000 ? ' ' + convert(n % 1000000000000) : '');
  };
  return convert(Math.round(num));
}

export default function ProformaInvoicePage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const permissions = usePermissions();
  const { data: invoices = [], isLoading } = useProformaInvoices();
  
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [cancelDialogId, setCancelDialogId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  
  const printRef = useRef<HTMLDivElement>(null);
  
  const { data: detail, isLoading: detailLoading } = useProformaInvoiceDetail(selectedId);
  const approveMutation = useApprovePI();
  const rejectMutation = useRejectPI();
  const cancelMutation = useCancelPI();

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    return (
      inv.pi_number?.toLowerCase().includes(q) ||
      (inv.customer as any)?.name?.toLowerCase().includes(q) ||
      (inv.sales_order as any)?.sales_order_number?.toLowerCase().includes(q)
    );
  });

  const canApprove = permissions.canPerformAction('proforma_invoice', 'approve');
  const canCancel = permissions.canPerformAction('proforma_invoice', 'cancel');
  const canPrint = permissions.canPerformAction('proforma_invoice', 'print');

  const handleApprove = (id: string) => {
    if (confirm('Apakah Anda yakin ingin meng-approve Proforma Invoice ini?')) {
      approveMutation.mutate(id);
      setSelectedId(null);
    }
  };

  const handleReject = () => {
    if (!reason.trim()) return;
    rejectMutation.mutate({ piId: rejectDialogId!, reason });
    setRejectDialogId(null);
    setReason('');
    setSelectedId(null);
  };

  const handleCancel = () => {
    if (!reason.trim()) return;
    cancelMutation.mutate({ piId: cancelDialogId!, reason });
    setCancelDialogId(null);
    setReason('');
    setSelectedId(null);
  };

  const piMargins = { top: 0, right: 0, bottom: 0, left: 0 };

  const handlePrintPI = async () => {
    if (!printRef.current || !detail) return;
    setIsSavingPdf(true);
    setPdfProgress(0);
    try {
      const filename = `PI_${detail.pi_number.replace(/[^a-zA-Z0-9.-]/g, "_")}.pdf`;
      await exportSectionBasedPdf({
        element: printRef.current,
        filename,
        onProgress: setPdfProgress,
        backgroundImage: `${window.location.origin}/kop-surat-pi-bg.jpg`,
        margins: piMargins,
        mode: "print",
      });
    } catch (err: any) {
      toast.error('Gagal mencetak');
    } finally {
      setIsSavingPdf(false);
    }
  };

  const handleSaveAsPDF = async () => {
    if (!printRef.current || !detail) return;
    setIsSavingPdf(true);
    setPdfProgress(0);
    try {
      const filename = `PI_${detail.pi_number.replace(/[^a-zA-Z0-9.-]/g, "_")}.pdf`;
      await exportSectionBasedPdf({
        element: printRef.current,
        filename,
        onProgress: setPdfProgress,
        backgroundImage: `${window.location.origin}/kop-surat-pi-bg.jpg`,
        margins: piMargins,
      });
      toast.success('PDF berhasil disimpan');
    } catch (err: any) {
      toast.error('Gagal menyimpan PDF');
    } finally {
      setIsSavingPdf(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="w-6 h-6" />
            Proforma Invoice
          </h1>
          <p className="text-sm text-muted-foreground">Invoice CBD - Cash Before Delivery</p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari nomor PI, customer, atau nomor SO..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. PI</TableHead>
                <TableHead>No. SO</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead className="text-right">Grand Total</TableHead>
                <TableHead className="text-right">Materai</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead className="text-center">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Memuat data...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Tidak ada data Proforma Invoice
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((inv) => {
                  const status = statusConfig[inv.status] || statusConfig.pending;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono font-medium">{inv.pi_number}</TableCell>
                      <TableCell className="font-mono text-sm">{(inv.sales_order as any)?.sales_order_number || '-'}</TableCell>
                      <TableCell>{(inv.customer as any)?.name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {inv.customer_type || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(inv.grand_total)}</TableCell>
                      <TableCell className="text-right">{inv.materai_amount > 0 ? formatCurrency(inv.materai_amount) : '-'}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {inv.created_at ? format(new Date(inv.created_at), 'dd MMM yyyy', { locale: localeId }) : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setSelectedId(inv.id)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canApprove && inv.status === 'pending' && (
                            <>
                              <Button size="sm" variant="ghost" className="text-green-600" onClick={() => handleApprove(inv.id)}>
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { setRejectDialogId(inv.id); setReason(''); }}>
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {canCancel && inv.status === 'approved' && (
                            <Button size="sm" variant="ghost" className="text-orange-600" onClick={() => { setCancelDialogId(inv.id); setReason(''); }}>
                              <Ban className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Detail Proforma Invoice
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <p className="text-center py-8 text-muted-foreground">Memuat...</p>
          ) : detail ? (
            <div className="space-y-4">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">No. PI</p>
                  <p className="font-mono font-medium">{detail.pi_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant={statusConfig[detail.status]?.variant || 'secondary'}>
                    {statusConfig[detail.status]?.label || detail.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">No. SO</p>
                  <p className="font-mono">{(detail.sales_order as any)?.sales_order_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p>{(detail.customer as any)?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tipe Customer</p>
                  <p>{detail.customer_type || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment Terms</p>
                  <p>{detail.payment_terms || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sales</p>
                  <p>{(detail.sales_order as any)?.sales_name || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Dibuat Oleh</p>
                  <p>{detail.created_by_profile?.full_name || detail.created_by_profile?.email || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tanggal</p>
                  <p>{detail.created_at ? format(new Date(detail.created_at), 'dd MMM yyyy HH:mm', { locale: localeId }) : '-'}</p>
                </div>
                {detail.approved_by_profile && (
                  <div>
                    <p className="text-muted-foreground">Di-approve Oleh</p>
                    <p>{detail.approved_by_profile.full_name || detail.approved_by_profile.email}</p>
                  </div>
                )}
              </div>

              {/* Items table */}
              <div>
                <h3 className="font-semibold mb-2">Detail Produk</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No</TableHead>
                      <TableHead>Produk</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Harga</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items?.map((item, idx) => (
                      <TableRow key={item.id}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell className="text-right">{item.qty}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.subtotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Financial summary */}
              {/* Financial summary — match PDF layout */}
              {(() => {
                const dpPercent = Number(detail.dp_percent) || 0;
                const dpAmount = dpPercent > 0 ? Math.round((detail.grand_total * dpPercent) / 100) : 0;
                const balance = detail.grand_total - dpAmount;
                const dppPengganti = detail.tax_amount > 0 ? Math.round(detail.subtotal * 11 / 12) : detail.subtotal;
                return (
                  <div className="border-t pt-4 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>DPP</span>
                      <span>{formatCurrency(detail.subtotal)}</span>
                    </div>
                    {detail.tax_amount > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>DPP Pengganti</span>
                        <span>{formatCurrency(dppPengganti)}</span>
                      </div>
                    )}
                    {detail.tax_amount > 0 && (
                      <div className="flex justify-between">
                        <span>Pajak (PPN 12%)</span>
                        <span>{formatCurrency(detail.tax_amount)}</span>
                      </div>
                    )}
                    {detail.shipping_cost > 0 && (
                      <div className="flex justify-between">
                        <span>Biaya Pengantaran</span>
                        <span>{formatCurrency(detail.shipping_cost)}</span>
                      </div>
                    )}
                    {detail.other_costs > 0 && (
                      <div className="flex justify-between">
                        <span>Biaya Lainnya</span>
                        <span>{formatCurrency(detail.other_costs)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold border-t pt-2">
                      <span>Sub Total</span>
                      <span>{formatCurrency(detail.grand_total - (detail.materai_amount || 0))}</span>
                    </div>
                    {detail.materai_amount > 0 && (
                      <div className="flex justify-between">
                        <span>Bea Materai</span>
                        <span>{formatCurrency(detail.materai_amount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Down Payment{dpPercent > 0 ? ` (${dpPercent}%)` : ''}</span>
                      <span>{dpAmount > 0 ? formatCurrency(dpAmount) : '-'}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base border-y py-2 mt-1">
                      <span>Saldo</span>
                      <span>{formatCurrency(balance)}</span>
                    </div>
                    {detail.payment_note && (
                      <div className="mt-2 p-2 rounded border-l-4 border-primary bg-primary/5 text-xs">
                        <span className="font-semibold">Note: </span>
                        <span>{detail.payment_note}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Rejection/Cancel reason */}
              {detail.rejected_reason && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                  <p className="text-sm font-medium text-destructive">Alasan Penolakan:</p>
                  <p className="text-sm">{detail.rejected_reason}</p>
                </div>
              )}
              {detail.cancel_reason && (
                <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-400">Alasan Pembatalan:</p>
                  <p className="text-sm">{detail.cancel_reason}</p>
                </div>
              )}

              {detail.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Catatan:</p>
                  <p className="text-sm">{detail.notes}</p>
                </div>
              )}
            </div>
          ) : null}
          
          <DialogFooter className="gap-2 flex-wrap">
            {detail?.status === 'pending' && canApprove && (
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" onClick={() => { setRejectDialogId(detail.id); setReason(''); }}>
                  <XCircle className="w-4 h-4 mr-1" /> Tolak
                </Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApprove(detail.id)}>
                  <CheckCircle className="w-4 h-4 mr-1" /> Approve
                </Button>
              </div>
            )}
            {detail?.status === 'approved' && canCancel && (
              <Button variant="outline" size="sm" className="text-orange-600" onClick={() => { setCancelDialogId(detail.id); setReason(''); }}>
                <Ban className="w-4 h-4 mr-1" /> Cancel PI
              </Button>
            )}
            {detail && canPrint && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsPdfPreviewOpen(true)}>
                  <Eye className="w-4 h-4 mr-1" /> Preview PDF
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Preview Dialog */}
      <Dialog open={isPdfPreviewOpen} onOpenChange={setIsPdfPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview PDF - Proforma Invoice</DialogTitle>
            <DialogDescription>Lihat dokumen sebelum mencetak atau menyimpan sebagai PDF</DialogDescription>
          </DialogHeader>

          <div className="bg-white p-4 rounded border overflow-x-auto">
            <style dangerouslySetInnerHTML={{ __html: `.pdf-preview-pi th[style*="background"] { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }` }} />
            <div className="pdf-preview-pi" dangerouslySetInnerHTML={{ __html: sanitizeHtml(printRef.current?.innerHTML || "") }} />
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setIsPdfPreviewOpen(false)}>Tutup</Button>
            <Button variant="success" onClick={handleSaveAsPDF} disabled={isSavingPdf}>
              {isSavingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Simpan PDF
            </Button>
            <Button onClick={handlePrintPI} disabled={isSavingPdf}>
              <Printer className="w-4 h-4 mr-2" /> Cetak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden Print Template */}
      <div className="hidden">
        {detail && (() => {
          const customer = detail.customer as any;
          const so = detail.sales_order as any;
          // Build items with correct subtotal (after discount)
          const pdfItems = (detail.items || []).map((item, idx) => {
            const baseAmount = item.qty * item.unit_price;
            const discountNominal = item.discount || 0;
            const discountPercent = baseAmount > 0 ? parseFloat(((discountNominal / baseAmount) * 100).toFixed(2)) : 0;
            const subtotalAfterDiscount = baseAmount - discountNominal;
            return {
              no: idx + 1,
              code: (item as any).product?.sku || '-',
              name: item.product_name,
              qty: item.qty,
              unit: (item as any).product?.unit?.name || 'unit',
              price: Math.round(item.unit_price),
              discount: discountPercent,
              subtotal: Math.round(subtotalAfterDiscount),
              taxPercent: '12%',
            };
          });

          // DPP = sum of item subtotals after discount (recalculated for accuracy)
          const dpp = pdfItems.reduce((sum, it) => sum + it.subtotal, 0);
          const dppPenggantiCalc = Math.round(dpp * 11 / 12);
          const pajak = Math.round(dppPenggantiCalc * 0.12);
          const biayaPengantaran = Math.round(detail.shipping_cost || 0);
          const subTotalCalc = Math.round(dpp + pajak + biayaPengantaran);
          const materai = Math.round(detail.materai_amount || 0);
          const grossTotal = Math.round(subTotalCalc + materai);

          // DP + Termin scheme: DP nominal goes to Down Payment row; Saldo = sisa
          const dpPercent = (detail as any).dp_percent ? Number((detail as any).dp_percent) : 0;
          const dpAmount = dpPercent > 0 ? Math.round((grossTotal * dpPercent) / 100) : 0;
          const saldo = grossTotal - dpAmount;
          const paymentNote = (detail as any).payment_note || null;

          const pdfData: PiPdfData = {
            company: {
              name: "PT. KEMIKA KARYA PRATAMA",
              address: "Jl. Raya Ciledug No. 10, Tangerang, Banten 15154",
              phone: "(021) 7310808",
              website: "www.kemika.co.id",
              bankName: "Mandiri KCP Tangerang Ciledug",
              bankAccount: "155-005-755-575-0",
              npwp: "71.608.326.6-416.000",
            },
            invoice: {
              number: detail.pi_number,
              date: detail.created_at ? formatDateID(detail.created_at) : '-',
              currency: "IDR - (Rupiah)",
              soNumber: so?.sales_order_number || '-',
              customerPoNumber: so?.customer_po_number || '-',
              term: detail.payment_terms || '-',
              amountInWords: numberToWords(saldo) + " Rupiah",
            },
            customer: {
              companyName: customer?.name || '-',
              picName: customer?.pic || so?.sales_name || '-',
              address: customer?.address || '-',
            },
            items: pdfItems,
            summary: {
              dpp,
              dppPengganti: dppPenggantiCalc,
              tax: pajak,
              deliveryFee: biayaPengantaran,
              subTotal: subTotalCalc,
              stampDuty: materai,
              downPayment: dpAmount,
              balance: saldo,
            },
            signatory: {
              name: detail.approved_by_profile?.full_name || null,
              position: "FINANCE",
              signatureUrl: (detail as any).approver_signature_url || null,
              isApproved: !!detail.approved_by && !!detail.approved_at,
            },
            paymentNote,
          };

          return <PiPdfTemplate ref={printRef} data={pdfData} />;
        })()}
      </div>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialogId} onOpenChange={(open) => !open && setRejectDialogId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak Proforma Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea placeholder="Alasan penolakan..." value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogId(null)}>Batal</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!reason.trim()}>Tolak</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={!!cancelDialogId} onOpenChange={(open) => !open && setCancelDialogId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan Proforma Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea placeholder="Alasan pembatalan..." value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogId(null)}>Batal</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={!reason.trim()}>Batalkan PI</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Generating Overlay */}
      <PdfGeneratingOverlay isVisible={isSavingPdf} progress={pdfProgress} language="id" />
    </div>
  );
}
