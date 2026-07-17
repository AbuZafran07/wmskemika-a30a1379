import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FlaskConical, ExternalLink, Send, Loader2,
  CheckCircle2, Clock, MapPin, Phone, CalendarDays, User,
  MessageSquare, ClipboardList, Wrench, Info, FileDown, Award,
} from "lucide-react";
import { format, isPast, differenceInDays } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCalibrationItems } from "@/hooks/useSalesOrders";
import { generateSPKPdf, generateCertificatePdf } from "@/lib/calibrationPdf";
import type {
  KalibrasiCard,
  KalibrasiChecklist,
  KalibrasiColumn,
} from "@/hooks/useTrackerKalibrasi";
import {
  KALIBRASI_COLUMN_CHECKLISTS,
  KALIBRASI_CHECKLIST_LABELS,
} from "@/hooks/useTrackerKalibrasi";

// ── helpers ────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Math.round(v || 0));
}

function formatDateID(d: string) {
  try { return format(new Date(d), "dd MMM yyyy", { locale: idLocale }); } catch { return d; }
}

function formatDateTime(d: string) {
  try { return format(new Date(d), "dd MMM yyyy, HH:mm", { locale: idLocale }); } catch { return d; }
}

// ── sub-components ─────────────────────────────────────────────────────────

function InfoItem({ label, value, children }: { label: string; value?: string | null; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      {children ?? <p className="font-medium text-sm">{value || "-"}</p>}
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function FeasibilityBadge({ status }: { status: string | null }) {
  if (!status || status === "pending")
    return <Badge variant="secondary" className="text-[10px] h-5">Menunggu</Badge>;
  if (status === "feasible")
    return <Badge className="text-[10px] h-5 bg-green-600">Layak</Badge>;
  return <Badge variant="destructive" className="text-[10px] h-5">Tidak Layak</Badge>;
}

function DeadlineBadge({ date }: { date: string | null }) {
  if (!date) return null;
  const d = new Date(date);
  const daysLeft = differenceInDays(d, new Date());
  const past = isPast(d);
  return (
    <span className={cn(
      "text-xs font-medium",
      past ? "text-red-500" : daysLeft <= 7 ? "text-orange-500" : "text-muted-foreground",
    )}>
      {past
        ? `Terlambat ${Math.abs(daysLeft)} hari`
        : daysLeft === 0
        ? "Hari ini!"
        : `${daysLeft} hari lagi`}
    </span>
  );
}

// ── types ──────────────────────────────────────────────────────────────────

interface TrackerComment {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  user_name: string;
}

interface Props {
  card: KalibrasiCard;
  col: KalibrasiColumn;
  checklists: KalibrasiChecklist[];
  canToggle: boolean;
  onToggle: (key: string) => void;
  onClose: () => void;
}

// ── main component ─────────────────────────────────────────────────────────

export default function TrackerKalibrasiCardDetail({
  card,
  col,
  checklists,
  canToggle,
  onToggle,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items: calibItems, loading: calibLoading } = useCalibrationItems(card.id);

  const [comments, setComments] = useState<TrackerComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const commentsBottomRef = useRef<HTMLDivElement>(null);

  const [downloadingSPK, setDownloadingSPK] = useState(false);
  const [downloadingCert, setDownloadingCert] = useState(false);

  const handleDownloadSPK = async () => {
    setDownloadingSPK(true);
    try {
      await generateSPKPdf(card.id);
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat SPK PDF");
    } finally {
      setDownloadingSPK(false);
    }
  };

  const handleDownloadCert = async () => {
    setDownloadingCert(true);
    try {
      await generateCertificatePdf(card.id);
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat Sertifikat PDF");
    } finally {
      setDownloadingCert(false);
    }
  };

  const fetchComments = useCallback(async () => {
    setCommentsLoading(true);
    const { data, error } = await supabase
      .from("calibration_tracker_comments")
      .select("id, user_id, message, created_at")
      .eq("sales_order_id", card.id)
      .order("created_at", { ascending: true });

    if (error) {
      setCommentsLoading(false);
      return;
    }

    const userIds = [...new Set((data || []).map((c) => c.user_id))];
    let names: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of profiles || []) names[p.id] = p.full_name || "Unknown";
    }

    setComments((data || []).map((c) => ({ ...c, user_name: names[c.user_id] || "Unknown" })));
    setCommentsLoading(false);
  }, [card.id]);

  useEffect(() => {
    fetchComments();

    const channel = supabase
      .channel(`kal-detail-${card.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "calibration_tracker_comments",
        filter: `sales_order_id=eq.${card.id}`,
      }, () => fetchComments())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [card.id, fetchComments]);

  useEffect(() => {
    commentsBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const handleSendComment = async () => {
    if (!user?.id || !newComment.trim()) return;
    setSendingComment(true);
    const { error } = await supabase.from("calibration_tracker_comments").insert({
      sales_order_id: card.id,
      user_id: user.id,
      message: newComment.trim(),
      type: "comment",
    });
    if (error) toast.error("Gagal mengirim komentar");
    else setNewComment("");
    setSendingComment(false);
  };

  const allChecklistKeys = Object.keys(KALIBRASI_CHECKLIST_LABELS);
  const colChecklistKeys = KALIBRASI_COLUMN_CHECKLISTS[col];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <FlaskConical className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
              {card.spk_number || card.sales_order_number}
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              — {card.customer?.name || "-"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="info" className="flex-1 flex flex-col min-h-0 px-6">
          <TabsList className="shrink-0 grid grid-cols-4 w-full mt-3 mb-0">
            <TabsTrigger value="info" className="text-xs gap-1">
              <Info className="w-3 h-3" />Info SPK
            </TabsTrigger>
            <TabsTrigger value="alat" className="text-xs gap-1">
              <Wrench className="w-3 h-3" />Alat ({calibItems.length})
            </TabsTrigger>
            <TabsTrigger value="checklist" className="text-xs gap-1">
              <ClipboardList className="w-3 h-3" />Progress
            </TabsTrigger>
            <TabsTrigger value="komentar" className="text-xs gap-1">
              <MessageSquare className="w-3 h-3" />
              Komentar
              {comments.length > 0 && (
                <span className="text-[9px] bg-primary/10 text-primary rounded-full px-1 ml-0.5">
                  {comments.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Info SPK ─────────────────────────────────────────────── */}
          <TabsContent value="info" className="flex-1 overflow-y-auto py-4 data-[state=inactive]:hidden">
            <div className="space-y-4">
              {card.spk_number && (
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-0.5">No. SPK</p>
                  <p className="font-mono font-bold text-blue-700 dark:text-blue-300 text-base">
                    {card.spk_number}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <InfoItem label="No. SO" value={card.sales_order_number} />
                <InfoItem label="Tanggal Order" value={formatDateID(card.order_date)} />
                <InfoItem label="Customer" value={card.customer?.name} />
                <InfoItem label="Sales" value={card.sales_name} />

                <InfoItem label="Target Selesai">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {card.target_completion_date ? formatDateID(card.target_completion_date) : "-"}
                    </span>
                    <DeadlineBadge date={card.target_completion_date} />
                  </div>
                </InfoItem>

                <InfoItem label="Lokasi Servis">
                  <div className="flex items-center gap-1">
                    {card.service_location && <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />}
                    <span className="font-medium text-sm">{card.service_location || "-"}</span>
                  </div>
                </InfoItem>

                {card.service_pic_name && (
                  <InfoItem label="PIC Customer">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">{card.service_pic_name}</span>
                    </div>
                  </InfoItem>
                )}

                {card.service_pic_phone && (
                  <InfoItem label="Telepon PIC">
                    <div className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">{card.service_pic_phone}</span>
                    </div>
                  </InfoItem>
                )}

                <InfoItem label="Grand Total">
                  <p className="font-semibold text-primary text-sm">{formatCurrency(card.grand_total)}</p>
                </InfoItem>
              </div>

              {card.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Catatan</p>
                  <p className="text-sm bg-muted/40 rounded-lg p-2.5">{card.notes}</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Alat Kalibrasi ───────────────────────────────────────── */}
          <TabsContent value="alat" className="flex-1 overflow-y-auto py-4 data-[state=inactive]:hidden">
            {calibLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : calibItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">Tidak ada alat kalibrasi</p>
            ) : (
              <div className="space-y-3">
                {calibItems.map((item) => (
                  <div key={item.id} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] text-muted-foreground bg-background border rounded px-1.5 py-0.5 font-mono shrink-0">
                          #{item.item_number}
                        </span>
                        <span className="font-semibold text-sm truncate">{item.instrument_name}</span>
                      </div>
                      <FeasibilityBadge status={item.feasibility_status} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs p-3">
                      <DetailPair label="Merk/Model" value={item.brand_model} />
                      <DetailPair label="No. Seri" value={item.serial_number} />
                      <DetailPair label="Range Ukur" value={item.measurement_range} />
                      <DetailPair label="Metode" value={item.calibration_method} />
                      <DetailPair
                        label="SLA"
                        value={item.sla_working_days != null ? `${item.sla_working_days} hari kerja` : null}
                      />
                      <DetailPair label="Harga" value={formatCurrency(Number(item.unit_price))} />
                      {item.received_date && (
                        <DetailPair label="Tgl Diterima" value={formatDateID(item.received_date)} />
                      )}
                      {item.condition_notes && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Kondisi: </span>
                          <span className="font-medium">{item.condition_notes}</span>
                        </div>
                      )}
                      {item.feasibility_notes && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Catatan Kelayakan: </span>
                          <span className="font-medium">{item.feasibility_notes}</span>
                        </div>
                      )}
                      {item.certificate_number && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">No. Sertifikat: </span>
                          <span className="font-mono font-semibold text-teal-700 dark:text-teal-300">
                            {item.certificate_number}
                          </span>
                        </div>
                      )}
                      {item.certificate_issued_at && (
                        <DetailPair
                          label="Sertifikat Terbit"
                          value={formatDateTime(item.certificate_issued_at)}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Progress Checklist ───────────────────────────────────── */}
          <TabsContent value="checklist" className="flex-1 overflow-y-auto py-4 data-[state=inactive]:hidden">
            <div className="space-y-2">
              {allChecklistKeys.map((key) => {
                const item = checklists.find((c) => c.checklist_key === key);
                const isChecked = !!item?.is_checked;
                const isCurrentCol = colChecklistKeys.includes(key);
                const canAct = !isChecked && canToggle && isCurrentCol;

                return (
                  <div
                    key={key}
                    className={cn(
                      "flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                      isChecked
                        ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                        : isCurrentCol
                        ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800"
                        : "bg-muted/20 border-border/40 opacity-60",
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isChecked ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : isCurrentCol ? (
                        <Clock className="w-4 h-4 text-orange-400" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn(
                          "text-sm font-medium",
                          isChecked
                            ? "text-green-700 dark:text-green-400"
                            : isCurrentCol
                            ? "text-orange-700 dark:text-orange-400"
                            : "text-muted-foreground",
                        )}>
                          {KALIBRASI_CHECKLIST_LABELS[key]}
                        </span>
                        {canAct && (
                          <Checkbox
                            checked={false}
                            onCheckedChange={() => onToggle(key)}
                            className="w-4 h-4 shrink-0"
                          />
                        )}
                      </div>
                      {item?.checked_at && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatDateTime(item.checked_at)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Komentar ─────────────────────────────────────────────── */}
          <TabsContent value="komentar" className="flex-1 flex flex-col min-h-0 py-4 data-[state=inactive]:hidden">
            <div className="flex-1 overflow-y-auto space-y-3 mb-3 min-h-0">
              {commentsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">
                  Belum ada komentar. Jadilah yang pertama!
                </p>
              ) : (
                <>
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                        {c.user_name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-xs font-semibold">{c.user_name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDateTime(c.created_at)}
                          </span>
                        </div>
                        <p className="text-sm mt-0.5 text-foreground whitespace-pre-wrap">{c.message}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={commentsBottomRef} />
                </>
              )}
            </div>

            {user && (
              <div className="flex gap-2 shrink-0 border-t pt-3">
                <Textarea
                  placeholder="Tulis komentar... (Ctrl+Enter untuk kirim)"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleSendComment();
                    }
                  }}
                  className="text-sm resize-none h-16"
                />
                <Button
                  size="sm"
                  className="self-end shrink-0"
                  disabled={!newComment.trim() || sendingComment}
                  onClick={handleSendComment}
                >
                  {sendingComment
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0 gap-2 px-6 py-4 border-t flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadSPK}
            disabled={downloadingSPK}
            title="Download SPK PDF (F-KAL-02)"
          >
            {downloadingSPK
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <FileDown className="w-3.5 h-3.5 mr-1.5" />}
            SPK
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadCert}
            disabled={downloadingCert}
            title="Download Sertifikat PDF (F-KAL-05)"
          >
            {downloadingCert
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Award className="w-3.5 h-3.5 mr-1.5" />}
            Sertifikat
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => { onClose(); navigate(`/sales-order?id=${card.id}`); }}
          >
            <ExternalLink className="w-4 h-4 mr-1.5" />
            Lihat SO
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
