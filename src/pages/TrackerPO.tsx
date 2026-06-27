import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Search, Maximize2, Minimize2, ZoomIn, ZoomOut, MessageSquare, Paperclip,
  ClipboardCheck, AlertTriangle, Building2, Calendar as CalendarIcon, Filter,
  Archive, RefreshCw, X, Image, CheckCircle2, RotateCcw, Trash2, Rows3, ExternalLink
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, isPast, differenceInDays, isSameDay } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTrackerPO } from "@/hooks/useTrackerPO";
import type { PlanOrderHeader } from "@/hooks/usePlanOrders";
import TrackerPOCardDetail from "@/components/tracker-po/TrackerPOCardDetail";

const BOARD_COLUMNS = [
  { id: "plan_order" as const, label: "Plan Order", color: "bg-blue-600" },
  { id: "processing" as const, label: "Processing Order", color: "bg-yellow-600" },
  { id: "in_stock" as const, label: "In Stock", color: "bg-emerald-600" },
  { id: "cancelled" as const, label: "Cancelled", color: "bg-red-600" },
];

const COLUMN_CHECKLISTS: Record<string, string[]> = {
  plan_order: ["submitted"],
  processing: ["vendor_confirmation", "payment_process"],
  in_stock: [],
  cancelled: [],
};

const CHECKLIST_LABELS: Record<string, string> = {
  submitted: "Submitted",
  vendor_confirmation: "Vendor Confirmation",
  payment_process: "Payment Process",
};

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-blue-100 text-blue-800",
  partially_received: "bg-yellow-100 text-yellow-800",
  received: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  approved: "Approved",
  partially_received: "Partially Received",
  received: "Received",
  cancelled: "Cancelled",
};

const ARCHIVE_ROLES = ["super_admin", "admin", "purchasing"];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Math.round(value));
}

interface CardMetaMap {
  [planOrderId: string]: {
    unreadCount: number;
    attachmentCount: number;
    labels: { name: string; color: string }[];
  };
}

interface TrackerLabel { id: string; name: string; color: string; }
interface ArchivedPO { plan_order_id: string; archived_at: string; plan_number: string; supplier_name: string; }

export default function TrackerPO({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const { planOrders, checklists, loading, getColumnCards, toggleChecklist, canToggleChecklist, fetchData, userRole } = useTrackerPO();

  // Board state
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [isFullView, setIsFullView] = useState(() => localStorage.getItem("tracker_po_full_view") === "true");
  const [zoomLevel, setZoomLevel] = useState(() => Number(localStorage.getItem("tracker_po_zoom_level") || "70"));
  const [boardBgUrl, setBoardBgUrl] = useState("");
  const [bgInput, setBgInput] = useState("");
  const [detailCard, setDetailCard] = useState<PlanOrderHeader | null>(null);
  const [detailColumn, setDetailColumn] = useState<"plan_order" | "processing" | "in_stock" | "cancelled">("plan_order");
  const [cardMeta, setCardMeta] = useState<CardMetaMap>({});

  // Filter state
  const [filterLabelNames, setFilterLabelNames] = useState<string[]>([]);
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [allLabels, setAllLabels] = useState<TrackerLabel[]>([]);

  // Calendar filter
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(undefined);

  // Archive state
  const [showArchivedDialog, setShowArchivedDialog] = useState(false);
  const [archivedPOs, setArchivedPOs] = useState<ArchivedPO[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

  const isSuperAdmin = userRole === "super_admin";
  const canArchive = userRole ? ARCHIVE_ROLES.includes(userRole) : false;

  const handleSetFullView = (val: boolean) => {
    setIsFullView(val);
    localStorage.setItem("tracker_po_full_view", String(val));
  };

  const handleSetZoom = (val: number) => {
    const clamped = Math.max(40, Math.min(130, val));
    setZoomLevel(clamped);
    localStorage.setItem("tracker_po_zoom_level", String(clamped));
  };

  // ─── Background ───────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.from("settings").select("value").eq("key", "tracker_po_board_bg")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (data?.value && typeof data.value === "string") setBoardBgUrl(data.value);
        else if (data?.value && typeof data.value === "object") setBoardBgUrl((data.value as any).url || "");
      });
  }, []);

  const handleSetBg = async (url: string) => {
    setBoardBgUrl(url);
    const payload = url ? { url } : null;
    const { data: existing } = await supabase.from("settings").select("id")
      .eq("key", "tracker_po_board_bg").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (existing?.id) {
      await supabase.from("settings").update({ value: payload, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await supabase.from("settings").insert({ key: "tracker_po_board_bg", value: payload });
    }
  };

  const handleBgFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileKey = `tracker-po-bg/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("documents").upload(fileKey, file, { upsert: true });
    if (!error) {
      const { data } = await supabase.storage.from("documents").createSignedUrl(fileKey, 60 * 60 * 24 * 365);
      if (data?.signedUrl) handleSetBg(data.signedUrl);
    }
  };

  // ─── Labels ───────────────────────────────────────────────────────────────

  const fetchAllLabels = useCallback(async () => {
    const { data } = await supabase.from("po_tracker_labels").select("id, name, color").order("name");
    setAllLabels((data as TrackerLabel[]) || []);
  }, []);

  useEffect(() => { fetchAllLabels(); }, [fetchAllLabels]);

  // ─── Archive ──────────────────────────────────────────────────────────────

  const fetchArchived = useCallback(async () => {
    const { data } = await supabase
      .from("po_tracker_archived")
      .select("plan_order_id, archived_at, plan_order_headers(plan_number, supplier:suppliers(name))")
      .order("archived_at", { ascending: false });

    const mapped: ArchivedPO[] = (data || []).map((r: any) => ({
      plan_order_id: r.plan_order_id,
      archived_at: r.archived_at,
      plan_number: r.plan_order_headers?.plan_number || "-",
      supplier_name: r.plan_order_headers?.supplier?.name || "-",
    }));
    setArchivedPOs(mapped);
    setArchivedIds(new Set(mapped.map((a) => a.plan_order_id)));
  }, []);

  useEffect(() => { fetchArchived(); }, [fetchArchived]);

  const archiveCard = async (planOrderId: string) => {
    if (!user || !canArchive) return;
    await supabase.from("po_tracker_archived").insert({ plan_order_id: planOrderId, archived_by: user.id });
    await fetchArchived();
  };

  const restoreCard = async (planOrderId: string) => {
    setRestoringId(planOrderId);
    await supabase.from("po_tracker_archived").delete().eq("plan_order_id", planOrderId);
    await fetchArchived();
    setRestoringId(null);
  };

  // ─── Meta (unread, attachments, labels) ──────────────────────────────────

  const fetchCardMeta = useCallback(async () => {
    if (!user || planOrders.length === 0) return;
    const ids = planOrders.map((o) => o.id);
    const [
      { data: reads }, { data: comments }, { data: attachments },
      { data: cardLabels }, { data: labelsData },
    ] = await Promise.all([
      supabase.from("po_tracker_comment_reads").select("plan_order_id, last_read_at").eq("user_id", user.id).in("plan_order_id", ids),
      supabase.from("po_tracker_comments").select("id, plan_order_id, created_at").eq("type", "comment").in("plan_order_id", ids),
      supabase.from("attachments").select("id, ref_id").eq("ref_table", "plan_order_headers").in("ref_id", ids),
      supabase.from("po_tracker_card_labels").select("plan_order_id, label_id").in("plan_order_id", ids),
      supabase.from("po_tracker_labels").select("id, name, color"),
    ]);

    const readMap: Record<string, string> = {};
    (reads || []).forEach((r: any) => { readMap[r.plan_order_id] = r.last_read_at; });
    const labelMap: Record<string, { name: string; color: string }> = {};
    (labelsData || []).forEach((l: any) => { labelMap[l.id] = { name: l.name, color: l.color }; });

    const meta: CardMetaMap = {};
    for (const id of ids) {
      const lastRead = readMap[id] ? new Date(readMap[id]) : null;
      const cardComments = (comments || []).filter((c: any) => c.plan_order_id === id);
      const unreadCount = lastRead ? cardComments.filter((c: any) => new Date(c.created_at) > lastRead).length : cardComments.length;
      const attachmentCount = (attachments || []).filter((a: any) => a.ref_id === id).length;
      const labels = (cardLabels || []).filter((cl: any) => cl.plan_order_id === id).map((cl: any) => labelMap[cl.label_id]).filter(Boolean);
      meta[id] = { unreadCount, attachmentCount, labels };
    }
    setCardMeta(meta);
  }, [user, planOrders]);

  useEffect(() => { fetchCardMeta(); }, [fetchCardMeta]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("tracker-po-meta")
      .on("postgres_changes", { event: "*", schema: "public", table: "po_tracker_comments" }, fetchCardMeta)
      .on("postgres_changes", { event: "*", schema: "public", table: "po_tracker_card_labels" }, () => { fetchCardMeta(); fetchAllLabels(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "attachments" }, fetchCardMeta)
      .on("postgres_changes", { event: "*", schema: "public", table: "po_tracker_archived" }, fetchArchived)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchCardMeta, fetchAllLabels, fetchArchived]);

  // ─── Derived / filter helpers ─────────────────────────────────────────────

  const supplierOptions = useMemo(() => {
    const names = new Set(planOrders.map((o) => o.supplier?.name).filter(Boolean));
    return [...names].sort() as string[];
  }, [planOrders]);

  // Dates with expected deliveries (for calendar highlighting)
  const deliveryDates = useMemo(() =>
    planOrders.map((o) => o.expected_delivery_date).filter(Boolean).map((d) => new Date(d!)),
    [planOrders]
  );

  const filteredIds = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return new Set(
      planOrders
        .filter((o) => {
          if (archivedIds.has(o.id)) return false;
          const matchSearch = !q || o.plan_number.toLowerCase().includes(q) || (o.supplier?.name || "").toLowerCase().includes(q);
          const matchSupplier = supplierFilter === "all" || o.supplier?.name === supplierFilter;
          const meta = cardMeta[o.id];
          const matchLabel = filterLabelNames.length === 0 || (meta?.labels.some((l) => filterLabelNames.includes(l.name)) ?? false);
          const matchOverdue = !filterOverdue || (o.expected_delivery_date ? isPast(new Date(o.expected_delivery_date)) : false);
          const matchCalendar = !calendarDate || (o.expected_delivery_date ? isSameDay(new Date(o.expected_delivery_date), calendarDate) : false);
          return matchSearch && matchSupplier && matchLabel && matchOverdue && matchCalendar;
        })
        .map((o) => o.id)
    );
  }, [planOrders, searchQuery, supplierFilter, filterLabelNames, filterOverdue, calendarDate, cardMeta, archivedIds]);

  const activeFilterCount = filterLabelNames.length + (filterOverdue ? 1 : 0) + (searchQuery.trim() ? 1 : 0);

  function getDeliveryUrgency(dateStr: string | null): "overdue" | "soon" | "normal" {
    if (!dateStr) return "normal";
    const d = new Date(dateStr);
    if (isPast(d) && differenceInDays(new Date(), d) > 0) return "overdue";
    if (differenceInDays(d, new Date()) <= 3) return "soon";
    return "normal";
  }

  function getColumnForCard(planOrderId: string): "plan_order" | "processing" | "in_stock" | "cancelled" {
    const order = planOrders.find((o) => o.id === planOrderId);
    if (order?.status === "cancelled") return "cancelled";
    if (order?.status === "received") return "in_stock";
    const submitted = checklists[planOrderId]?.find((c) => c.checklist_key === "submitted" && c.is_checked);
    if (submitted) return "processing";
    return "plan_order";
  }

  // ─── Card render ──────────────────────────────────────────────────────────

  function renderCard(order: PlanOrderHeader) {
    if (!filteredIds.has(order.id)) return null;
    const meta = cardMeta[order.id] || { unreadCount: 0, attachmentCount: 0, labels: [] };
    const col = getColumnForCard(order.id);
    const checklistKeys = COLUMN_CHECKLISTS[col];
    const urgency = getDeliveryUrgency(order.expected_delivery_date);

    return (
      <Card
        key={order.id}
        onClick={() => { setDetailCard(order); setDetailColumn(col); }}
        className="relative overflow-visible cursor-pointer hover:shadow-md transition-all border-border/60 bg-card p-3"
      >
        {/* Labels */}
        {meta.labels.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mb-1">
            {meta.labels.map((l) => (
              <span key={l.name} className="text-white px-1.5 py-0.5 rounded-sm font-medium text-[9px]" style={{ backgroundColor: l.color }}>
                {l.name}
              </span>
            ))}
          </div>
        )}

        {/* Plan Number + Status */}
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="font-bold text-primary truncate text-[11px]">{order.plan_number}</span>
          <Badge className={cn("px-1.5 py-0 text-[9px] h-4 shrink-0", STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700")}>
            {STATUS_LABELS[order.status] ?? order.status}
          </Badge>
        </div>

        {/* Partial Delivery badge */}
        {order.status === "partially_received" && (
          <div className="flex items-center gap-1 mb-1.5">
            <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 border border-orange-300 rounded-sm px-1.5 py-0.5 text-[9px] font-semibold">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-500" />
              Partial Delivery
            </span>
          </div>
        )}

        {/* Supplier */}
        <div className="flex items-center gap-1 mb-1">
          <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-[11px] text-foreground truncate font-medium">{order.supplier?.name ?? "-"}</span>
        </div>

        {/* Expected Delivery */}
        {order.expected_delivery_date && (
          <div className={cn("flex items-center gap-1 text-[10px] mb-1",
            urgency === "overdue" ? "text-destructive font-semibold" :
            urgency === "soon" ? "text-amber-600 font-semibold" : "text-muted-foreground"
          )}>
            <CalendarIcon className="h-2.5 w-2.5 shrink-0" />
            {urgency !== "normal" && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
            {format(new Date(order.expected_delivery_date), "d MMM yyyy", { locale: idLocale })}
          </div>
        )}

        {/* Grand Total */}
        <p className="text-[10px] text-muted-foreground mb-2">{formatCurrency(order.grand_total)}</p>

        {/* Cancel reason */}
        {order.status === "cancelled" && order.cancel_reason && (
          <div className="flex gap-1 items-start mb-2 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            <X className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-red-700 leading-relaxed break-words">{order.cancel_reason}</p>
          </div>
        )}

        {/* Checklists */}
        {checklistKeys.length > 0 && (
          <div className="space-y-1 border-t border-border/40 pt-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
            {checklistKeys.map((key) => {
              const item = checklists[order.id]?.find((c) => c.checklist_key === key);
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <Checkbox
                    checked={!!item?.is_checked}
                    disabled={!canToggleChecklist || !!item?.is_checked}
                    onCheckedChange={() => toggleChecklist(order.id, key)}
                    className="h-3 w-3"
                  />
                  <span className={cn("text-[10px]", item?.is_checked ? "line-through text-muted-foreground" : "text-foreground")}>
                    {CHECKLIST_LABELS[key]}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Archive button — In Stock only */}
        {col === "in_stock" && canArchive && (
          <div className="border-t border-border/40 pt-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-full text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => archiveCard(order.id)}
            >
              <Archive className="h-3 w-3 mr-1" /> Dismiss / Arsipkan
            </Button>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-border/40 pt-1.5 mt-1.5">
          {meta.unreadCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-0.5 bg-primary/15 text-primary rounded-full px-1.5 py-0.5">
                  <MessageSquare className="h-2.5 w-2.5" />
                  <span className="text-[9px] font-bold">{meta.unreadCount}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{meta.unreadCount} komentar belum dibaca</TooltipContent>
            </Tooltip>
          )}
          {meta.attachmentCount > 0 && (
            <div className="flex items-center gap-0.5 text-muted-foreground">
              <Paperclip className="h-2.5 w-2.5" />
              <span className="text-[9px]">{meta.attachmentCount}</span>
            </div>
          )}
        </div>
      </Card>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "flex flex-col",
          compact ? "h-full overflow-hidden" : (isFullView ? "fixed inset-0 z-50 h-screen bg-background" : "h-full")
        )}
        style={!compact && boardBgUrl ? { backgroundImage: `url(${boardBgUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        {/* Header */}
        <div className={cn(
          "border-b flex items-center justify-between shrink-0",
          compact ? "px-3 py-2 bg-background" : (boardBgUrl ? "px-6 py-3 bg-background/80 backdrop-blur-sm" : "px-6 py-3 bg-background")
        )}>
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardCheck className={cn("text-blue-600 shrink-0", compact ? "w-4 h-4" : "w-5 h-5")} />
            <div className="min-w-0">
              <h1 className={cn("font-bold leading-tight", compact ? "text-sm" : "text-lg")}>
                Tracker Purchase Order
              </h1>
              {!compact && <p className="text-xs text-muted-foreground">Purchase Order Tracker</p>}
            </div>
            {compact && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={() => navigate("/tracker-po")}>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Buka halaman penuh</p></TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* 1. Background (super_admin only) */}
            {isSuperAdmin && (
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8">
                        <Image className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent><p>Background Board</p></TooltipContent>
                </Tooltip>
                <PopoverContent className="w-80" align="end">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Ganti Background Board</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: "Default", value: "", preview: "bg-muted" },
                        { label: "Warehouse", value: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1920&q=80", preview: "bg-amber-800" },
                        { label: "City", value: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1920&q=80", preview: "bg-slate-700" },
                        { label: "Ocean", value: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80", preview: "bg-cyan-600" },
                        { label: "Forest", value: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80", preview: "bg-emerald-800" },
                        { label: "Sunset", value: "https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1920&q=80", preview: "bg-orange-600" },
                        { label: "Night", value: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&q=80", preview: "bg-indigo-900" },
                        { label: "Abstract", value: "https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920&q=80", preview: "bg-purple-700" },
                      ].map((preset) => (
                        <button key={preset.label} onClick={() => handleSetBg(preset.value)}
                          className={cn("flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all hover:scale-105",
                            boardBgUrl === preset.value ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"
                          )}
                        >
                          <div className={cn("w-full h-8 rounded", preset.preview)}
                            style={preset.value ? { backgroundImage: `url(${preset.value})`, backgroundSize: "cover" } : undefined}
                          />
                          <span className="text-[10px] text-muted-foreground">{preset.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="border-t pt-2 space-y-2">
                      <input ref={bgFileRef} type="file" accept="image/*" onChange={handleBgFile}
                        className="block w-full text-xs file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-primary file:text-primary-foreground cursor-pointer"
                      />
                      <div className="flex gap-1">
                        <Input value={bgInput} onChange={(e) => setBgInput(e.target.value)} placeholder="URL gambar..." className="text-xs h-8" />
                        <Button size="sm" className="h-8" onClick={() => { handleSetBg(bgInput); setBgInput(""); }}>Set</Button>
                      </div>
                    </div>
                    {boardBgUrl && (
                      <Button variant="destructive" size="sm" className="w-full" onClick={() => handleSetBg("")}>
                        <X className="h-3 w-3 mr-1" /> Hapus Background
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* 2. Calendar — expected delivery dates */}
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className={cn("h-8 w-8", calendarDate && "border-primary text-primary")}>
                      <CalendarIcon className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent><p>Filter Tanggal Delivery</p></TooltipContent>
              </Tooltip>
              <PopoverContent className="w-auto p-3" align="end">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Expected Delivery</p>
                    {calendarDate && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setCalendarDate(undefined)}>Reset</Button>
                    )}
                  </div>
                  <Calendar
                    mode="single"
                    selected={calendarDate}
                    onSelect={setCalendarDate}
                    locale={idLocale}
                    modifiers={{ hasDelivery: deliveryDates }}
                    modifiersClassNames={{ hasDelivery: "bg-blue-100 text-blue-800 font-semibold rounded-full" }}
                    className="pointer-events-auto"
                  />
                  <p className="text-[11px] text-muted-foreground text-center">
                    {calendarDate
                      ? `Filter: ${format(calendarDate, "d MMM yyyy", { locale: idLocale })}`
                      : "Pilih tanggal untuk filter"}
                  </p>
                </div>
              </PopoverContent>
            </Popover>

            {/* 3. Filter */}
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className={cn("h-8 w-8 relative", activeFilterCount > 0 && "border-primary text-primary")}>
                      <Filter className="h-4 w-4" />
                      {activeFilterCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent><p>Filter & Cari</p></TooltipContent>
              </Tooltip>
              <PopoverContent className="w-64" align="end">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Filter & Cari Card</p>
                    {activeFilterCount > 0 && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2"
                        onClick={() => { setFilterLabelNames([]); setFilterOverdue(false); setSearchQuery(""); }}>
                        Reset
                      </Button>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari PO atau supplier..." className="pl-7 h-8 text-xs" />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    )}
                  </div>

                  {/* Supplier */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Supplier</p>
                    <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Semua Supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Supplier</SelectItem>
                        {supplierOptions.map((name) => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Label filter */}
                  {allLabels.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Filter Label</p>
                      <div className="space-y-1 max-h-36 overflow-y-auto">
                        {allLabels.map((label) => (
                          <button key={label.id}
                            onClick={() => setFilterLabelNames((prev) =>
                              prev.includes(label.name) ? prev.filter((n) => n !== label.name) : [...prev, label.name]
                            )}
                            className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-muted",
                              filterLabelNames.includes(label.name) && "bg-muted"
                            )}
                          >
                            <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: label.color }} />
                            <span className="truncate text-foreground">{label.name}</span>
                            {filterLabelNames.includes(label.name) && (
                              <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Overdue filter */}
                  <div className="pt-1 border-t">
                    <button onClick={() => setFilterOverdue(!filterOverdue)}
                      className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-muted",
                        filterOverdue && "bg-destructive/10"
                      )}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      <span className="text-foreground">Delivery Sudah Lewat (Overdue)</span>
                      {filterOverdue && <CheckCircle2 className="h-3.5 w-3.5 text-destructive ml-auto shrink-0" />}
                    </button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* 4. Full View — disembunyikan saat compact */}
            {!compact && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleSetFullView(!isFullView)}>
                      {isFullView ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>{isFullView ? "Normal View" : "Full View"}</p></TooltipContent>
                </Tooltip>

                {isFullView && (
                  <div className="flex items-center gap-2 bg-muted/50 rounded-md px-2 py-1">
                    <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
                    <input type="range" min={40} max={130} step={5} value={zoomLevel}
                      onChange={(e) => handleSetZoom(Number(e.target.value))}
                      className="w-20 h-1.5 accent-primary cursor-pointer"
                      title={`Zoom: ${zoomLevel}%`}
                    />
                    <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium w-8">{zoomLevel}%</span>
                  </div>
                )}
              </>
            )}

            {/* Dual Board — disembunyikan saat compact */}
            {!compact && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate("/dual-board")}>
                    <Rows3 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Dual Board View</p></TooltipContent>
              </Tooltip>
            )}

            {/* 5. Archive */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 relative" onClick={() => setShowArchivedDialog(true)}>
                  <Archive className="h-4 w-4" />
                  {archivedPOs.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                      {archivedPOs.length}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Arsip ({archivedPOs.length})</p></TooltipContent>
            </Tooltip>

            {/* 6. Refresh */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={fetchData}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Refresh</p></TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Board */}
        <div ref={scrollRef} className={cn("flex-1 relative min-h-0", (isFullView || compact) ? "overflow-auto" : "overflow-x-auto overflow-y-hidden")}>
          {loading ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Memuat data...</div>
          ) : (
            <div
              className={cn("flex gap-3 p-4 h-full", (isFullView || compact) ? "w-full" : "min-w-max")}
              style={isFullView && !compact ? { transform: `scale(${zoomLevel / 100})`, transformOrigin: "top left", width: `${10000 / zoomLevel}%`, height: `${10000 / zoomLevel}%` } : undefined}
            >
              {BOARD_COLUMNS.map((col) => {
                const colCards = getColumnCards(col.id).filter((o) => !archivedIds.has(o.id));
                const visible = colCards.filter((o) => filteredIds.has(o.id));

                return (
                  <div key={col.id}
                    className={cn("flex flex-col rounded-xl border transition-colors bg-muted/30 border-border/50",
                      (isFullView || compact) ? "flex-1 min-w-0" : "w-[280px] flex-shrink-0"
                    )}
                  >
                    <div className={cn("px-3 py-2.5 rounded-t-xl flex items-center justify-between", col.color)}>
                      <span className="text-xs font-bold text-white truncate">{col.label}</span>
                      <Badge variant="secondary" className="bg-white/20 text-white text-[10px] h-5 min-w-[20px] flex items-center justify-center">
                        {visible.length}
                      </Badge>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2" style={{ maxHeight: "calc(100vh - 11rem)" }}>
                      {colCards.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground/50"><p className="text-xs">Tidak ada PO</p></div>
                      ) : (
                        colCards.map((order) => renderCard(order))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Archive Dialog */}
        <Dialog open={showArchivedDialog} onOpenChange={setShowArchivedDialog}>
          <DialogContent className="max-w-md flex flex-col max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5" />
                Arsip PO ({archivedPOs.length})
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-2 py-2">
              {archivedPOs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Archive className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Belum ada PO yang diarsipkan</p>
                </div>
              ) : (
                archivedPOs.map((a) => (
                  <div key={a.plan_order_id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{a.plan_number}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.supplier_name}</p>
                      <p className="text-xs text-muted-foreground">Diarsipkan: {format(new Date(a.archived_at), "d MMM yyyy", { locale: idLocale })}</p>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="ml-2 shrink-0"
                          onClick={() => restoreCard(a.plan_order_id)}
                          disabled={restoringId === a.plan_order_id}
                        >
                          {restoringId === a.plan_order_id
                            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            : <><RotateCcw className="h-3.5 w-3.5 mr-1" />Restore</>
                          }
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Kembalikan ke board</p></TooltipContent>
                    </Tooltip>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="secondary" size="sm" onClick={() => setShowArchivedDialog(false)}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Card Detail Dialog */}
        {detailCard && (
          <TrackerPOCardDetail
            planOrder={detailCard}
            column={detailColumn}
            onClose={() => { setDetailCard(null); fetchCardMeta(); }}
            checklists={checklists[detailCard.id] || []}
            toggleChecklist={toggleChecklist}
            canToggleChecklist={canToggleChecklist}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
