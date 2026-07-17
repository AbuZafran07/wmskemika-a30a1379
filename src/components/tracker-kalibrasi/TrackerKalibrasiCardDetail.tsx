import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  FlaskConical, X, Send, Loader2, CheckSquare, Square,
  MapPin, Phone, User, CalendarDays, MessageSquare, Wrench, Info, ClipboardList,
  FileText, Download,
} from "lucide-react";
import { generateSPKPdf, generateCertificatePdf } from "@/lib/calibrationPdf";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  COLUMN_DEFS,
  COLUMN_CHECKLISTS,
  KalibrasiV2Checklist,
} from "@/hooks/useTrackerKalibrasi";

// ─── types ────────────────────────────────────────────────────────────────────

interface ReceiptDetail {
  id: string;
  receipt_number: string;
  spk_number: string | null;
  spk_issued_at: string | null;
  spk_signed_at: string | null;
  status: string;
  archived: boolean;
  received_date: string;
  target_completion_date: string | null;
  service_location: string | null;
  service_pic_name: string | null;
  service_pic_phone: string | null;
  customer_request_notes: string | null;
  created_at: string;
  created_by: string | null;
  customer: { id: string; name: string; code: string; pic: string | null; phone: string | null; address: string | null } | null;
}

interface InstrumentDetail {
  id: string;
  item_number: number;
  instrument_name: string;
  brand_model: string | null;
  serial_number: string | null;
  measurement_range: string | null;
  calibration_method: string | null;
  unit_price: number;
  sla_working_days: number | null;
  feasibility_status: string | null;
  physical_condition: string | null;
  calibration_conclusion: string | null;
  certificate_number: string | null;
}

interface KomComment {
  id: string;
  calibration_receipt_id: string;
  user_id: string;
  message: string;
  type: string;
  created_at: string;
  user_name?: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatRupiah(v: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v || 0);
}

function fmtDate(d: string | null) {
  if (!d) return "-";
  try { return format(new Date(d.includes("T") ? d : d + "T00:00:00"), "dd MMM yyyy", { locale: idLocale }); } catch { return d; }
}

function fmtDateTime(d: string | null) {
  if (!d) return "-";
  try { return format(new Date(d), "dd MMM yyyy, HH:mm", { locale: idLocale }); } catch { return d; }
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  spk_issued: "SPK Diterbitkan",
  spk_signed: "SPK Ditandatangani",
  converted_to_so: "Converted to SO",
  cancelled: "Dibatalkan",
};

const FEASIBILITY_CFG: Record<string, { label: string; className: string }> = {
  pending:      { label: "Menunggu",      className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  feasible:     { label: "Layak",         className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  not_feasible: { label: "Tidak Layak",   className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

function FeasibilityBadge({ status }: { status: string | null }) {
  const cfg = FEASIBILITY_CFG[status ?? "pending"] ?? FEASIBILITY_CFG.pending;
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", cfg.className)}>{cfg.label}</span>;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "-"}</span>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

interface Props {
  receiptId: string | null;
  checklists: KalibrasiV2Checklist[];
  canToggle: boolean;
  onToggle: (receiptId: string, key: string) => void;
  onClose: () => void;
}

export default function TrackerKalibrasiCardDetail({
  receiptId,
  checklists,
  canToggle,
  onToggle,
  onClose,
}: Props) {
  const { user } = useAuth();

  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [instruments, setInstruments] = useState<InstrumentDetail[]>([]);
  const [comments, setComments] = useState<KomComment[]>([]);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<"spk" | "cert" | null>(null);
  const commentEndRef = useRef<HTMLDivElement>(null);

  // ── fetch receipt + instruments ─────────────────────────────────────────

  useEffect(() => {
    if (!receiptId) { setReceipt(null); setInstruments([]); return; }
    setLoadingReceipt(true);

    (async () => {
      const [{ data: rcpt }, { data: inst }] = await Promise.all([
        supabase
          .from("calibration_receipts")
          .select(`
            id, receipt_number, spk_number, spk_issued_at, spk_signed_at,
            status, archived, received_date, target_completion_date,
            service_location, service_pic_name, service_pic_phone,
            customer_request_notes, created_at, created_by,
            customer:customers(id, name, code, pic, phone, address)
          `)
          .eq("id", receiptId)
          .single(),
        supabase
          .from("calibration_instruments")
          .select(`
            id, item_number, instrument_name, brand_model, serial_number,
            measurement_range, calibration_method, unit_price, sla_working_days,
            feasibility_status, physical_condition, calibration_conclusion, certificate_number
          `)
          .eq("calibration_receipt_id", receiptId)
          .order("item_number", { ascending: true }),
      ]);

      setReceipt((rcpt as unknown as ReceiptDetail) ?? null);
      setInstruments((inst || []) as unknown as InstrumentDetail[]);
      setLoadingReceipt(false);
    })();
  }, [receiptId]);

  // ── fetch comments ──────────────────────────────────────────────────────

  const fetchComments = useCallback(async () => {
    if (!receiptId) return;
    setLoadingComments(true);
    const { data, error } = await supabase
      .from("calibration_tracker_comments")
      .select("*")
      .eq("calibration_receipt_id", receiptId)
      .order("created_at", { ascending: true });

    if (error) { toast.error("Gagal memuat komentar"); setLoadingComments(false); return; }

    const rawComments = (data || []) as KomComment[];

    // Enrich with user names
    const userIds = [...new Set(rawComments.map((c) => c.user_id))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles_chat_view")
        .select("id, full_name")
        .in("id", userIds);
      const profileMap = new Map((profiles || []).map((p) => [p.id, p.full_name]));
      setComments(rawComments.map((c) => ({ ...c, user_name: profileMap.get(c.user_id) ?? "Pengguna" })));
    } else {
      setComments(rawComments);
    }
    setLoadingComments(false);
  }, [receiptId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  // Realtime comments
  useEffect(() => {
    if (!receiptId) return;
    const ch = supabase
      .channel(`kal-comments-${receiptId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calibration_tracker_comments", filter: `calibration_receipt_id=eq.${receiptId}` }, fetchComments)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [receiptId, fetchComments]);

  useEffect(() => {
    commentEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  // ── send comment ────────────────────────────────────────────────────────

  const sendComment = async () => {
    if (!newComment.trim() || !user?.id || !receiptId) return;
    setSending(true);
    const { error } = await supabase.from("calibration_tracker_comments").insert({
      calibration_receipt_id: receiptId,
      user_id: user.id,
      message: newComment.trim(),
      type: "comment",
    });
    setSending(false);
    if (error) { toast.error("Gagal kirim komentar"); return; }
    setNewComment("");
  };

  // ── checklist helpers ───────────────────────────────────────────────────

  const isChecked = (key: string) => checklists.some((c) => c.checklist_key === key && c.is_checked);
  const checkedBy = (key: string) => {
    const c = checklists.find((c) => c.checklist_key === key && c.is_checked);
    return c?.checked_at ? fmtDateTime(c.checked_at) : null;
  };

  const totalValue = instruments.reduce((s, i) => s + (i.unit_price ?? 0), 0);

  if (!receiptId) return null;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/30" />
      <div
        className="w-full max-w-2xl bg-background border-l shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── header ── */}
        {loadingReceipt ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between p-4 border-b flex-shrink-0">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="font-semibold text-base leading-tight">
                    {receipt?.receipt_number ?? "-"}
                  </h2>
                  <p className="text-sm text-muted-foreground">{receipt?.customer?.name ?? "-"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  {STATUS_LABEL[receipt?.status ?? ""] ?? receipt?.status ?? "-"}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* ── tabs ── */}
            <Tabs defaultValue="info" className="flex flex-col flex-1 overflow-hidden">
              <TabsList className="flex-shrink-0 w-full rounded-none border-b bg-transparent justify-start px-4 gap-1 h-10">
                <TabsTrigger value="info" className="text-xs gap-1.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                  <Info className="w-3.5 h-3.5" /> Info
                </TabsTrigger>
                <TabsTrigger value="alat" className="text-xs gap-1.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                  <Wrench className="w-3.5 h-3.5" /> Alat ({instruments.length})
                </TabsTrigger>
                <TabsTrigger value="checklist" className="text-xs gap-1.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                  <ClipboardList className="w-3.5 h-3.5" /> Checklist
                </TabsTrigger>
                <TabsTrigger value="komentar" className="text-xs gap-1.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                  <MessageSquare className="w-3.5 h-3.5" /> Komentar ({comments.length})
                </TabsTrigger>
              </TabsList>

              {/* ── INFO ── */}
              <TabsContent value="info" className="flex-1 overflow-y-auto p-4 space-y-4 mt-0">
                {/* Customer & PIC */}
                <div className="rounded-lg border p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow label="Nama Customer" value={receipt?.customer?.name} />
                    <InfoRow label="Kode" value={receipt?.customer?.code} />
                    <InfoRow label="Alamat" value={receipt?.customer?.address} />
                  </div>
                </div>

                {/* PIC & Lokasi */}
                <div className="rounded-lg border p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">PIC & Lokasi</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-start gap-2">
                      <User className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                      <InfoRow label="Nama PIC" value={receipt?.service_pic_name} />
                    </div>
                    <div className="flex items-start gap-2">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                      <InfoRow label="No. HP PIC" value={receipt?.service_pic_phone} />
                    </div>
                    <div className="col-span-2 flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                      <InfoRow label="Lokasi Kalibrasi" value={receipt?.service_location} />
                    </div>
                  </div>
                </div>

                {/* Tanggal & SPK */}
                <div className="rounded-lg border p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Jadwal & SPK</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-start gap-2">
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                      <InfoRow label="Tanggal Terima" value={fmtDate(receipt?.received_date ?? null)} />
                    </div>
                    <div className="flex items-start gap-2">
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                      <InfoRow label="Target Selesai" value={fmtDate(receipt?.target_completion_date ?? null)} />
                    </div>
                    <InfoRow label="Nomor SPK" value={receipt?.spk_number} />
                    <InfoRow label="SPK Diterbitkan" value={fmtDate(receipt?.spk_issued_at ?? null)} />
                    <InfoRow label="SPK Ditandatangani" value={fmtDate(receipt?.spk_signed_at ?? null)} />
                  </div>
                </div>

                {/* Ringkasan Nilai */}
                <div className="rounded-lg border p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ringkasan</h3>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Jumlah Alat</span>
                    <span className="font-semibold">{instruments.length} alat</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Nilai</span>
                    <span className="font-semibold text-primary">{formatRupiah(totalValue)}</span>
                  </div>
                </div>

                {/* Catatan */}
                {receipt?.customer_request_notes && (
                  <div className="rounded-lg border p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" /> Catatan Customer
                    </h3>
                    <p className="text-sm text-muted-foreground">{receipt.customer_request_notes}</p>
                  </div>
                )}

                {/* PDF Dokumen */}
                <div className="rounded-lg border p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" /> Dokumen PDF
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!receiptId || pdfLoading !== null}
                      onClick={async () => {
                        if (!receiptId) return;
                        setPdfLoading("spk");
                        try { await generateSPKPdf(receiptId); }
                        catch (e) { toast.error("Gagal generate SPK PDF"); console.error(e); }
                        finally { setPdfLoading(null); }
                      }}
                      className="gap-1.5 text-xs"
                    >
                      {pdfLoading === "spk"
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <FileText className="w-3.5 h-3.5" />
                      }
                      SPK (F-KAL-02)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!receiptId || pdfLoading !== null || instruments.length === 0}
                      onClick={async () => {
                        if (!receiptId) return;
                        setPdfLoading("cert");
                        try { await generateCertificatePdf(receiptId); }
                        catch (e) { toast.error("Gagal generate Sertifikat PDF"); console.error(e); }
                        finally { setPdfLoading(null); }
                      }}
                      className="gap-1.5 text-xs"
                    >
                      {pdfLoading === "cert"
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <FileText className="w-3.5 h-3.5" />
                      }
                      Sertifikat (F-KAL-05)
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* ── ALAT ── */}
              <TabsContent value="alat" className="flex-1 overflow-y-auto mt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs w-8">No.</th>
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs min-w-[140px]">Nama Alat</th>
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">Merk/Model</th>
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">No. Seri</th>
                        <th className="px-3 py-2.5 text-right font-medium text-muted-foreground text-xs">Harga</th>
                        <th className="px-3 py-2.5 text-center font-medium text-muted-foreground text-xs">Kelayakan</th>
                        <th className="px-3 py-2.5 text-center font-medium text-muted-foreground text-xs">Kesimpulan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {instruments.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                            Belum ada data alat
                          </td>
                        </tr>
                      ) : instruments.map((inst) => (
                        <tr key={inst.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2.5 text-muted-foreground text-center text-xs">{inst.item_number}</td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium">{inst.instrument_name}</p>
                            {inst.measurement_range && (
                              <p className="text-xs text-muted-foreground">{inst.measurement_range}</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground text-sm">{inst.brand_model ?? "-"}</td>
                          <td className="px-3 py-2.5 text-muted-foreground text-sm font-mono text-xs">{inst.serial_number ?? "-"}</td>
                          <td className="px-3 py-2.5 text-right text-sm">{formatRupiah(inst.unit_price)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <FeasibilityBadge status={inst.feasibility_status} />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {inst.calibration_conclusion ? (
                              <span className={cn(
                                "text-xs px-2 py-0.5 rounded-full font-medium",
                                inst.calibration_conclusion === "within_limits"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                              )}>
                                {inst.calibration_conclusion === "within_limits" ? "In Limit" : "Out of Limit"}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {instruments.length > 0 && (
                      <tfoot className="bg-muted/30 border-t">
                        <tr>
                          <td colSpan={4} className="px-3 py-2.5 text-xs font-semibold text-right">Total</td>
                          <td className="px-3 py-2.5 text-right text-sm font-semibold">{formatRupiah(totalValue)}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </TabsContent>

              {/* ── CHECKLIST ── */}
              <TabsContent value="checklist" className="flex-1 overflow-y-auto p-4 space-y-4 mt-0">
                {COLUMN_DEFS.filter((col) => col.id !== "selesai").map((col) => {
                  const items = COLUMN_CHECKLISTS[col.id] ?? [];
                  const doneCount = items.filter((item) => isChecked(item.key)).length;
                  const allDone = items.length > 0 && doneCount === items.length;
                  return (
                    <div key={col.id} className="rounded-lg border overflow-hidden">
                      <div className={cn("h-1", col.color)} />
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold">{col.label}</h3>
                          <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full",
                            allDone
                              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                              : "bg-muted text-muted-foreground",
                          )}>
                            {doneCount}/{items.length}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {items.map((item) => {
                            const checked = isChecked(item.key);
                            const checkedAt = checkedBy(item.key);
                            return (
                              <button
                                key={item.key}
                                disabled={!canToggle || !receiptId}
                                onClick={() => receiptId && onToggle(receiptId, item.key)}
                                className={cn(
                                  "flex items-start gap-2.5 w-full text-left rounded-lg p-2 transition-colors",
                                  canToggle ? "hover:bg-muted/40 cursor-pointer" : "cursor-default",
                                  checked && "bg-muted/30",
                                )}
                              >
                                {checked
                                  ? <CheckSquare className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                  : <Square className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                                }
                                <div className="flex-1 min-w-0">
                                  <p className={cn("text-sm", checked && "line-through text-muted-foreground")}>
                                    {item.label}
                                  </p>
                                  {checked && checkedAt && (
                                    <p className="text-xs text-muted-foreground mt-0.5">✓ {checkedAt}</p>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </TabsContent>

              {/* ── KOMENTAR ── */}
              <TabsContent value="komentar" className="flex-1 flex flex-col overflow-hidden mt-0">
                {/* Comment list */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingComments ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : comments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                      <MessageSquare className="w-8 h-8 opacity-20" />
                      <p className="text-sm">Belum ada komentar</p>
                    </div>
                  ) : (
                    comments.map((c) => (
                      <div key={c.id} className={cn(
                        "flex gap-2.5",
                        c.user_id === user?.id && "flex-row-reverse",
                      )}>
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-semibold text-muted-foreground">
                          {(c.user_name ?? "?")[0].toUpperCase()}
                        </div>
                        <div className={cn(
                          "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                          c.user_id === user?.id
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-muted rounded-tl-sm",
                        )}>
                          {c.user_id !== user?.id && (
                            <p className="text-xs font-semibold mb-0.5 opacity-70">{c.user_name ?? "Pengguna"}</p>
                          )}
                          <p className="whitespace-pre-wrap break-words">{c.message}</p>
                          <p className={cn(
                            "text-[10px] mt-1 opacity-60",
                            c.user_id === user?.id ? "text-right" : "",
                          )}>
                            {fmtDateTime(c.created_at)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={commentEndRef} />
                </div>

                {/* Comment input */}
                <div className="border-t p-3 flex gap-2 flex-shrink-0">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Tulis komentar..."
                    className="min-h-[40px] max-h-[100px] resize-none text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendComment();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={sendComment}
                    disabled={!newComment.trim() || sending}
                    className="flex-shrink-0 h-10 w-10"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
