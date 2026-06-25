import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Maximize2, Minimize2, ZoomIn, ZoomOut, MessageSquare, Paperclip, ClipboardCheck, AlertTriangle, Image as ImageIcon, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, formatDistanceToNow, isPast, differenceInDays } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useTrackerPO, type ChecklistItem } from "@/hooks/useTrackerPO";
import type { PlanOrderHeader } from "@/hooks/usePlanOrders";
import TrackerPOCardDetail from "@/components/tracker-po/TrackerPOCardDetail";

const BOARD_COLUMNS = [
  { id: "plan_order" as const, label: "Plan Order", color: "bg-blue-600" },
  { id: "processing" as const, label: "Processing Order", color: "bg-yellow-600" },
  { id: "in_stock" as const, label: "In Stock", color: "bg-emerald-600" },
];

const COLUMN_CHECKLISTS: Record<string, string[]> = {
  plan_order: ["submitted"],
  processing: ["vendor_confirmation", "payment_process"],
  in_stock: [],
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
};

const STATUS_LABELS: Record<string, string> = {
  approved: "Approved",
  partially_received: "Partially Received",
  received: "Received",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

interface CardMetaMap {
  [planOrderId: string]: {
    unreadCount: number;
    attachmentCount: number;
    labels: { name: string; color: string }[];
  };
}

export default function TrackerPO() {
  const { user } = useAuth();
  const { planOrders, checklists, loading, getColumnCards, toggleChecklist, canToggleChecklist } = useTrackerPO();

  const [searchQuery, setSearchQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [isFullView, setIsFullView] = useState(() => localStorage.getItem("tracker_po_full_view") === "true");
  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem("tracker_po_zoom_level");
    return saved ? Number(saved) : 70;
  });
  const [detailCard, setDetailCard] = useState<PlanOrderHeader | null>(null);
  const [detailColumn, setDetailColumn] = useState<"plan_order" | "processing" | "in_stock">("plan_order");
  const [cardMeta, setCardMeta] = useState<CardMetaMap>({});

  const handleSetFullView = (val: boolean) => {
    setIsFullView(val);
    localStorage.setItem("tracker_po_full_view", String(val));
  };

  const handleSetZoom = (val: number) => {
    const clamped = Math.max(40, Math.min(120, val));
    setZoomLevel(clamped);
    localStorage.setItem("tracker_po_zoom_level", String(clamped));
  };

  // Unique suppliers from visible POs
  const supplierOptions = useMemo(() => {
    const names = new Set(planOrders.map((o) => o.supplier?.name).filter(Boolean));
    return [...names].sort() as string[];
  }, [planOrders]);

  // Client-side search + supplier filter
  const filteredIds = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return new Set(
      planOrders
        .filter((o) => {
          const matchesSearch =
            !q ||
            o.plan_number.toLowerCase().includes(q) ||
            (o.supplier?.name || "").toLowerCase().includes(q);
          const matchesSupplier =
            supplierFilter === "all" || o.supplier?.name === supplierFilter;
          return matchesSearch && matchesSupplier;
        })
        .map((o) => o.id)
    );
  }, [planOrders, searchQuery, supplierFilter]);

  // Fetch meta (unread comments, attachments, labels) for all visible POs
  const fetchCardMeta = useCallback(async () => {
    if (!user || planOrders.length === 0) return;
    const ids = planOrders.map((o) => o.id);

    const [
      { data: reads },
      { data: comments },
      { data: attachments },
      { data: cardLabels },
      { data: allLabelsData },
    ] = await Promise.all([
      supabase
        .from("po_tracker_comment_reads")
        .select("plan_order_id, last_read_at")
        .eq("user_id", user.id)
        .in("plan_order_id", ids),
      supabase
        .from("po_tracker_comments")
        .select("id, plan_order_id, created_at")
        .eq("type", "comment")
        .in("plan_order_id", ids),
      supabase
        .from("attachments")
        .select("id, ref_id")
        .eq("ref_table", "plan_order_headers")
        .in("ref_id", ids),
      supabase
        .from("po_tracker_card_labels")
        .select("plan_order_id, label_id")
        .in("plan_order_id", ids),
      supabase.from("po_tracker_labels").select("id, name, color"),
    ]);

    const readMap: Record<string, string> = {};
    (reads || []).forEach((r: any) => { readMap[r.plan_order_id] = r.last_read_at; });

    const labelMap: Record<string, { name: string; color: string }> = {};
    (allLabelsData || []).forEach((l: any) => { labelMap[l.id] = { name: l.name, color: l.color }; });

    const meta: CardMetaMap = {};
    for (const id of ids) {
      const lastRead = readMap[id] ? new Date(readMap[id]) : null;
      const cardComments = (comments || []).filter((c: any) => c.plan_order_id === id);
      const unreadCount = lastRead
        ? cardComments.filter((c: any) => new Date(c.created_at) > lastRead).length
        : cardComments.length;

      const attachmentCount = (attachments || []).filter((a: any) => a.ref_id === id).length;

      const labels = (cardLabels || [])
        .filter((cl: any) => cl.plan_order_id === id)
        .map((cl: any) => labelMap[cl.label_id])
        .filter(Boolean);

      meta[id] = { unreadCount, attachmentCount, labels };
    }
    setCardMeta(meta);
  }, [user, planOrders]);

  useEffect(() => {
    fetchCardMeta();
  }, [fetchCardMeta]);

  // Realtime for meta
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("tracker-po-meta")
      .on("postgres_changes", { event: "*", schema: "public", table: "po_tracker_comments" }, fetchCardMeta)
      .on("postgres_changes", { event: "*", schema: "public", table: "po_tracker_card_labels" }, fetchCardMeta)
      .on("postgres_changes", { event: "*", schema: "public", table: "attachments" }, fetchCardMeta)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchCardMeta]);

  function getDeliveryUrgency(dateStr: string | null): "overdue" | "soon" | "normal" {
    if (!dateStr) return "normal";
    const d = new Date(dateStr);
    if (isPast(d) && differenceInDays(new Date(), d) > 0) return "overdue";
    if (differenceInDays(d, new Date()) <= 3) return "soon";
    return "normal";
  }

  function getColumnForCard(planOrderId: string): "plan_order" | "processing" | "in_stock" {
    const submitted = checklists[planOrderId]?.find(
      (c) => c.checklist_key === "submitted" && c.is_checked
    );
    const order = planOrders.find((o) => o.id === planOrderId);
    if (order?.status === "received") return "in_stock";
    if (submitted) return "processing";
    return "plan_order";
  }

  function renderCard(order: PlanOrderHeader) {
    if (!filteredIds.has(order.id)) return null;
    const meta = cardMeta[order.id] || { unreadCount: 0, attachmentCount: 0, labels: [] };
    const col = getColumnForCard(order.id);
    const checklistKeys = COLUMN_CHECKLISTS[col];
    const urgency = getDeliveryUrgency(order.expected_delivery_date);

    return (
      <div
        key={order.id}
        onClick={() => { setDetailCard(order); setDetailColumn(col); }}
        className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
        style={{ fontSize: `${zoomLevel}%` }}
      >
        {/* Labels */}
        {meta.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {meta.labels.map((l) => (
              <span
                key={l.name}
                className="px-1.5 py-0.5 rounded text-white text-[10px] font-medium"
                style={{ backgroundColor: l.color }}
              >
                {l.name}
              </span>
            ))}
          </div>
        )}

        {/* Plan Number */}
        <div className="font-semibold text-gray-900 mb-1">{order.plan_number}</div>

        {/* Supplier */}
        <div className="text-gray-600 text-sm mb-1">{order.supplier?.name ?? "-"}</div>

        {/* Expected Delivery */}
        {order.expected_delivery_date && (
          <div
            className={`flex items-center gap-1 text-sm mb-1 ${
              urgency === "overdue"
                ? "text-red-600 font-medium"
                : urgency === "soon"
                ? "text-amber-600 font-medium"
                : "text-gray-500"
            }`}
          >
            {urgency !== "normal" && <AlertTriangle className="w-3 h-3 shrink-0" />}
            {format(new Date(order.expected_delivery_date), "d MMM yyyy", { locale: idLocale })}
          </div>
        )}

        {/* Grand Total */}
        <div className="text-gray-700 text-sm mb-2">{formatCurrency(order.grand_total)}</div>

        {/* Status badge */}
        <Badge className={`text-xs mb-2 ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}>
          {STATUS_LABELS[order.status] ?? order.status}
        </Badge>

        {/* Checklists */}
        {checklistKeys.length > 0 && (
          <div
            className="space-y-1 border-t pt-2 mt-1"
            onClick={(e) => e.stopPropagation()}
          >
            {checklistKeys.map((key) => {
              const item = checklists[order.id]?.find((c) => c.checklist_key === key);
              return (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    checked={!!item?.is_checked}
                    disabled={!canToggleChecklist || !!item?.is_checked}
                    onCheckedChange={() => toggleChecklist(order.id, key)}
                    className="w-3.5 h-3.5"
                  />
                  <span className={`text-xs ${item?.is_checked ? "line-through text-gray-400" : "text-gray-700"}`}>
                    {CHECKLIST_LABELS[key]}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer badges */}
        <div className="flex items-center gap-2 mt-2 pt-1">
          {meta.unreadCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
              <MessageSquare className="w-3 h-3" />
              {meta.unreadCount}
            </span>
          )}
          {meta.attachmentCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Paperclip className="w-3 h-3" />
              {meta.attachmentCount}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${isFullView ? "fixed inset-0 z-50 bg-gray-50" : ""}`}>
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-blue-600" />
              Tracker Purchase Order
            </h1>
            <p className="text-sm text-gray-500">Purchase Order Tracker</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleSetZoom(zoomLevel - 10)}
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm text-gray-600 w-10 text-center">{zoomLevel}%</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleSetZoom(zoomLevel + 10)}
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleSetFullView(!isFullView)}
              title={isFullView ? "Exit full view" : "Full view"}
            >
              {isFullView ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Cari PO atau supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-48">
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
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-500">Memuat data...</div>
        ) : (
          <div className="flex gap-4 min-w-max h-full">
            {BOARD_COLUMNS.map((col) => {
              const colCards = getColumnCards(col.id);
              const visible = colCards.filter((o) => filteredIds.has(o.id));

              return (
                <div key={col.id} className="flex flex-col w-72 shrink-0">
                  {/* Column header */}
                  <div className={`${col.color} text-white px-3 py-2 rounded-t-lg flex items-center justify-between`}>
                    <span className="font-medium text-sm">{col.label}</span>
                    <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                      {visible.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 bg-gray-100 rounded-b-lg p-2 space-y-2 overflow-y-auto min-h-0 max-h-[calc(100vh-200px)]">
                    {colCards.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">Tidak ada PO</p>
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

      {/* Card Detail Dialog */}
      {detailCard && (
        <TrackerPOCardDetail
          planOrder={detailCard}
          column={detailColumn}
          onClose={() => {
            setDetailCard(null);
            fetchCardMeta();
          }}
          checklists={checklists[detailCard.id] || []}
          toggleChecklist={toggleChecklist}
          canToggleChecklist={canToggleChecklist}
        />
      )}
    </div>
  );
}
