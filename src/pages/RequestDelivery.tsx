import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Package, Calendar as CalendarIcon, User, Building2, Truck, RefreshCw, Search, CheckSquare, Image, X, Maximize2, Minimize2, ZoomIn, ZoomOut, CheckCircle2, Filter, Archive, RotateCcw, Trash2, AlertTriangle, Bell, CalendarDays, MessageCircle, Rows3, ExternalLink } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { useHolidays } from "@/hooks/useHolidays";

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getWeekDates(): Record<string, Date> {
  const now = new Date();
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  return {
    pengiriman_senin: monday,
    pengiriman_selasa: addDays(monday, 1),
    pengiriman_rabu: addDays(monday, 2),
    pengiriman_kamis: addDays(monday, 3),
    pengiriman_jumat: addDays(monday, 4),
  };
}
import DeliveryCardDetail from "@/components/delivery/DeliveryCardDetail";
import DeliveryMarqueeTicker from "@/components/delivery/DeliveryMarqueeTicker";
import { notifyDeliveryCardMoved, notifyNewDeliveryCard } from "@/lib/pushNotifications";

// Board columns definition
const BOARD_COLUMNS = [
  { id: "new_order", label: "New Orders", color: "bg-blue-600" },
  { id: "checking", label: "Checking...", color: "bg-yellow-600" },
  { id: "on_hold_delivery", label: "On Hold Delivery Order", color: "bg-orange-600" },
  { id: "approval_delivery", label: "Approval Delivery Order", color: "bg-purple-600" },
  { id: "pengiriman_senin", label: "Pengiriman Senin", color: "bg-emerald-600" },
  { id: "pengiriman_selasa", label: "Pengiriman Selasa", color: "bg-emerald-600" },
  { id: "pengiriman_rabu", label: "Pengiriman Rabu", color: "bg-emerald-600" },
  { id: "pengiriman_kamis", label: "Pengiriman Kamis", color: "bg-emerald-600" },
  { id: "pengiriman_jumat", label: "Pengiriman Jumat", color: "bg-emerald-600" },
  { id: "delivered", label: "Delivered", color: "bg-sky-700" },
  { id: "delivered_sample", label: "Delivered Sample", color: "bg-rose-700" },
] as const;

type BoardStatus = typeof BOARD_COLUMNS[number]["id"] | "archived";

interface DeliveryCard {
  id: string;
  sales_order_id: string;
  board_status: BoardStatus;
  notes: string | null;
  delivery_date_target: string | null;
  created_at: string;
  updated_at: string;
  sales_order_number: string;
  customer_name: string;
  customer_code: string;
  customer_po_number: string;
  allocation_type: string;
  project_instansi: string;
  sales_name: string;
  delivery_deadline: string;
  order_date: string;
  so_status: string;
  grand_total: number;
  ship_to_address: string | null;
  so_notes: string | null;
  items: { product_name: string; ordered_qty: number; qty_delivered: number }[];
}

export default function RequestDelivery({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isHoliday } = useHolidays();
  const [cards, setCards] = useState<DeliveryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailCard, setDetailCard] = useState<DeliveryCard | null>(null);
  const [moveDialogCard, setMoveDialogCard] = useState<DeliveryCard | null>(null);
  const [moveTarget, setMoveTarget] = useState<BoardStatus>("new_order");
  const [availableSOs, setAvailableSOs] = useState<any[]>([]);
  const [selectedSOId, setSelectedSOId] = useState<string>("");
  const [addNotes, setAddNotes] = useState("");
  const [soSearchQuery, setSoSearchQuery] = useState("");
  const [cardLabelsMap, setCardLabelsMap] = useState<Record<string, { name: string; color: string }[]>>({});
  const [allLabels, setAllLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [filterLabelNames, setFilterLabelNames] = useState<string[]>([]);
  const [filterUrgent, setFilterUrgent] = useState(false);
  const [pendingApprovalsMap, setPendingApprovalsMap] = useState<Record<string, number>>({});
  const [cardSearchQuery, setCardSearchQuery] = useState("");
  const [unreadCommentsMap, setUnreadCommentsMap] = useState<Record<string, number>>({});
  
  const [draggedCard, setDraggedCard] = useState<DeliveryCard | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [boardBgUrl, setBoardBgUrl] = useState<string>("");
  const [isFullView, setIsFullView] = useState(() => localStorage.getItem('delivery_full_view') === 'true');
  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem('delivery_zoom_level');
    return saved ? Number(saved) : 70;
  });

  const handleSetFullView = (val: boolean) => {
    setIsFullView(val);
    localStorage.setItem('delivery_full_view', String(val));
  };

  const handleSetZoom = (val: number) => {
    setZoomLevel(val);
    localStorage.setItem('delivery_zoom_level', String(val));
  };
  const [bgInput, setBgInput] = useState("");
  const bgFileRef = useRef<HTMLInputElement>(null);
  const [showArchivedDialog, setShowArchivedDialog] = useState(false);
  const [restoringCardId, setRestoringCardId] = useState<string | null>(null);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [confirmDeleteCardId, setConfirmDeleteCardId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const extractBoardBackgroundUrl = (value: unknown): string => {
    if (!value) return "";

    if (typeof value === "string") {
      const raw = value.trim();
      if (!raw) return "";

      if (raw.startsWith("{")) {
        try {
          const parsed = JSON.parse(raw) as { url?: unknown };
          return typeof parsed.url === "string" ? parsed.url : "";
        } catch {
          return "";
        }
      }

      return raw;
    }

    if (typeof value === "object") {
      const url = (value as { url?: unknown }).url;
      return typeof url === "string" ? url : "";
    }

    return "";
  };

  // Load background from settings table (shared across all users)
  useEffect(() => {
    const loadBg = async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("id, value")
        .eq("key", "delivery_board_bg")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Gagal load background board:", error);
        return;
      }

      setBoardBgUrl(extractBoardBackgroundUrl(data?.value));
    };

    loadBg();
  }, []);

  const handleSetBg = async (url: string) => {
    setBoardBgUrl(url);

    const payload = url ? { url } : null;

    const { data: existing, error: existingError } = await supabase
      .from("settings")
      .select("id")
      .eq("key", "delivery_board_bg")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      toast.error("Gagal membaca pengaturan background");
      return;
    }

    const saveResult = existing?.id
      ? await supabase
          .from("settings")
          .update({ value: payload, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
      : await supabase.from("settings").insert({ key: "delivery_board_bg", value: payload });

    if (saveResult.error) {
      toast.error(`Gagal menyimpan background: ${saveResult.error.message}`);
    } else {
      toast.success(url ? "Background board berhasil disimpan" : "Background board berhasil dihapus");
    }
  };

  const handleBgFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Upload to storage instead of using data URL
    try {
      const fileExt = file.name.split(".").pop();
      const fileKey = `board-bg/${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage.from("documents").upload(fileKey, file);
      if (error) throw error;
      const { data: urlData } = await supabase.storage.from("documents").createSignedUrl(fileKey, 1800);
      await handleSetBg(urlData?.signedUrl || fileKey);
    } catch (err: any) {
      toast.error("Gagal upload background: " + err.message);
    }
  };

  const isSuperAdmin = user?.role === 'super_admin';
  const canManage = user?.role && ['super_admin', 'admin', 'sales', 'warehouse'].includes(user.role);

  const fetchCards = useCallback(async () => {
    try {
      const { data: requests, error } = await supabase
        .from("delivery_requests")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      if (!requests || requests.length === 0) {
        setCards([]);
        setLoading(false);
        return;
      }

      const soIds = requests.map(r => r.sales_order_id);
      
      const { data: soHeaders } = await supabase
        .from("sales_order_headers")
        .select("*, customers!inner(name, code)")
        .in("id", soIds);

      const { data: soItems } = await supabase
        .from("sales_order_items")
        .select("*, products!inner(name)")
        .in("sales_order_id", soIds);

      const mappedCards: DeliveryCard[] = requests.map(req => {
        const so = soHeaders?.find(h => h.id === req.sales_order_id);
        const items = soItems?.filter(i => i.sales_order_id === req.sales_order_id) || [];
        
        return {
          id: req.id,
          sales_order_id: req.sales_order_id,
          board_status: req.board_status as BoardStatus,
          notes: req.notes,
          delivery_date_target: req.delivery_date_target,
          created_at: req.created_at,
          updated_at: req.updated_at,
          sales_order_number: so?.sales_order_number || "-",
          customer_name: (so?.customers as any)?.name || "-",
          customer_code: (so?.customers as any)?.code || "-",
          customer_po_number: so?.customer_po_number || "-",
          allocation_type: so?.allocation_type || "-",
          project_instansi: so?.project_instansi || "-",
          sales_name: so?.sales_name || "-",
          delivery_deadline: so?.delivery_deadline || "",
          order_date: so?.order_date || "",
          so_status: so?.status || "",
          grand_total: so?.grand_total || 0,
          ship_to_address: so?.ship_to_address,
          so_notes: so?.notes,
          items: items.map(i => ({
            product_name: (i.products as any)?.name || "-",
            ordered_qty: i.ordered_qty,
            qty_delivered: i.qty_delivered || 0,
          })),
        };
      });

      setCards(mappedCards);
    } catch (err: any) {
      console.error("Error fetching delivery cards:", err);
      toast.error("Gagal memuat data Kanban");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCardLabels = useCallback(async () => {
    const { data: cardLabels } = await supabase
      .from("delivery_card_labels")
      .select("delivery_request_id, label_id");
    const { data: labels } = await supabase
      .from("delivery_labels")
      .select("id, name, color");
    if (!cardLabels || !labels) return;
    setAllLabels(labels);
    const labelsById = Object.fromEntries(labels.map(l => [l.id, l]));
    const map: Record<string, { name: string; color: string }[]> = {};
    cardLabels.forEach(cl => {
      const label = labelsById[cl.label_id];
      if (!label) return;
      if (!map[cl.delivery_request_id]) map[cl.delivery_request_id] = [];
      map[cl.delivery_request_id].push({ name: label.name, color: label.color });
    });
    setCardLabelsMap(map);
  }, []);

  // Fetch pending approval requests per card
  const fetchPendingApprovals = useCallback(async () => {
    const { data: pendingComments } = await supabase
      .from("delivery_comments")
      .select("delivery_request_id")
      .eq("approval_status", "pending");
    
    const map: Record<string, number> = {};
    pendingComments?.forEach(c => {
      map[c.delivery_request_id] = (map[c.delivery_request_id] || 0) + 1;
    });
    setPendingApprovalsMap(map);
  }, []);

  // Fetch unread comments count per card
  const fetchUnreadComments = useCallback(async () => {
    if (!user) return;
    // Get user's read timestamps
    const { data: reads } = await supabase
      .from("delivery_comment_reads" as any)
      .select("delivery_request_id, last_read_at")
      .eq("user_id", user.id);
    
    const readMap: Record<string, string> = {};
    (reads || []).forEach((r: any) => {
      readMap[r.delivery_request_id] = r.last_read_at;
    });

    // Get all comment counts grouped by card (only type='comment')
    const { data: comments } = await supabase
      .from("delivery_comments")
      .select("id, delivery_request_id, created_at")
      .eq("type", "comment");

    const unreadMap: Record<string, number> = {};
    (comments || []).forEach((c: any) => {
      const lastRead = readMap[c.delivery_request_id];
      if (!lastRead || new Date(c.created_at) > new Date(lastRead)) {
        unreadMap[c.delivery_request_id] = (unreadMap[c.delivery_request_id] || 0) + 1;
      }
    });
    setUnreadCommentsMap(unreadMap);
  }, [user]);
  // Client-side time check: sync on_hold status on page load
  const syncOnHoldStatus = useCallback(async () => {
    try {
      const now = new Date();
      const wibTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
      const hour = wibTime.getHours();

      if (hour >= 15) {
        // After 15:00 WIB: any card still in approval_delivery should be moved to on_hold
        const { data: staleCards } = await supabase
          .from("delivery_requests")
          .select("id")
          .eq("board_status", "approval_delivery");

        if (staleCards && staleCards.length > 0) {
          for (const card of staleCards) {
            await supabase.from("delivery_requests").update({
              board_status: "on_hold_delivery",
              moved_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", card.id);
          }
          fetchCards();
        }
      } else if (hour >= 10) {
        // After 10:00 WIB: any card still in on_hold should be moved back to approval
        const { data: heldCards } = await supabase
          .from("delivery_requests")
          .select("id")
          .eq("board_status", "on_hold_delivery");

        if (heldCards && heldCards.length > 0) {
          for (const card of heldCards) {
            await supabase.from("delivery_requests").update({
              board_status: "approval_delivery",
              moved_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq("id", card.id);
          }
          fetchCards();
        }
      }
    } catch (err) {
      console.error("syncOnHoldStatus error:", err);
    }
  }, [fetchCards]);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    fetchCards();
    fetchCardLabels();
    fetchPendingApprovals();
    fetchUnreadComments();
    syncOnHoldStatus();
  }, [fetchCards, fetchCardLabels, fetchPendingApprovals, fetchUnreadComments, syncOnHoldStatus]);

  // Auto-open card from URL query param ?card=<id>
  useEffect(() => {
    const cardId = searchParams.get('card');
    if (cardId && cards.length > 0 && !detailCard) {
      const found = cards.find(c => c.id === cardId);
      if (found) {
        setDetailCard(found);
        // Clean up the query param
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, cards, detailCard, setSearchParams]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("delivery_requests_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_requests" }, () => {
        fetchCards();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "delivery_card_labels" }, async (payload: any) => {
        fetchCardLabels();
        // Check if it's an Urgent/Cito label and notify
        try {
          const labelId = payload.new?.label_id;
          const requestId = payload.new?.delivery_request_id;
          if (labelId && requestId) {
            const { data: label } = await supabase.from("delivery_labels").select("name, color").eq("id", labelId).single();
            if (label && /urgent|cito/i.test(label.name)) {
              const matchedCard = cards.find(c => c.id === requestId);
              const soNumber = matchedCard?.sales_order_number || "Unknown SO";
              toast.warning(`🚨 ${label.name.toUpperCase()}: ${soNumber}`, {
                description: `Card ${soNumber} telah ditandai sebagai ${label.name}!`,
                duration: 10000,
              });
            }
          }
        } catch {}
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "delivery_card_labels" }, () => {
        fetchCardLabels();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_card_labels" }, () => {
        fetchCardLabels();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_comments" }, (payload: any) => {
        fetchPendingApprovals();
        fetchUnreadComments();
        // Show toast for new comments when board is open
        if (payload.eventType === 'INSERT' && payload.new?.type === 'comment' && payload.new?.user_id !== user?.id) {
          const cardId = payload.new?.delivery_request_id;
          const matchedCard = cards.find(c => c.id === cardId);
          const soNumber = matchedCard?.sales_order_number || 'Card';
          toast.info(`💬 Komentar baru di ${soNumber}`, {
            description: payload.new?.message?.substring(0, 80) || 'Ada komentar baru',
            duration: 5000,
            action: matchedCard ? {
              label: 'Lihat',
              onClick: () => setDetailCard(matchedCard),
            } : undefined,
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchCards, fetchCardLabels, fetchPendingApprovals, fetchUnreadComments, cards, user?.id]);

  const PENGIRIMAN_COLUMNS = ["pengiriman_senin", "pengiriman_selasa", "pengiriman_rabu", "pengiriman_kamis", "pengiriman_jumat"];

  // Move card to new column
  const moveCard = async (cardId: string, newStatus: BoardStatus) => {
    if (!user) return;

    // Find the card being moved
    const cardToMove = cards.find(c => c.id === cardId);
    if (!cardToMove) return;

    // === BLOCK: Cards in delivered / delivered_sample are final state ===
    if (cardToMove.board_status === "delivered" || cardToMove.board_status === "delivered_sample") {
      toast.error("Card yang sudah Delivered tidak dapat dipindahkan. Status ini adalah final.");
      return;
    }

    // === BLOCK: Cards in pengiriman columns can only move to other pengiriman columns ===
    if (PENGIRIMAN_COLUMNS.includes(cardToMove.board_status) && !PENGIRIMAN_COLUMNS.includes(newStatus)) {
      toast.error("Card di Pengiriman Hari hanya dapat dipindahkan ke hari pengiriman lain. Perpindahan ke Delivered dilakukan otomatis setelah checklist upload selesai.");
      return;
    }

    // === BLOCK: Cards in new_order cannot be moved manually ===
    if (cardToMove.board_status === "new_order") {
      toast.error("Card di New Orders tidak dapat dipindahkan secara manual. Card akan otomatis pindah ke Checking setelah checklist 'Proses Sales Order' dicentang.");
      return;
    }

    // === BLOCK: Cards in checking cannot be moved manually ===
    if (cardToMove.board_status === "checking") {
      toast.error("Card di Checking tidak dapat dipindahkan secara manual. Card akan otomatis pindah ke Approval Delivery setelah proses Stock Out oleh Warehouse.");
      return;
    }

    // === BLOCK: Cards in approval_delivery can only move to pengiriman columns ===
    if (cardToMove.board_status === "approval_delivery" && !PENGIRIMAN_COLUMNS.includes(newStatus)) {
      toast.error("Card di Approval Delivery hanya dapat dipindahkan ke kolom Pengiriman Hari.");
      return;
    }

    // === BLOCK: Cards in on_hold_delivery cannot be moved manually ===
    if (cardToMove.board_status === "on_hold_delivery") {
      toast.error("Card di On Hold Delivery Order tidak dapat dipindahkan secara manual. Card akan otomatis pindah ke Approval Delivery Order setelah jam 10:00 WIB.");
      return;
    }

    // === BLOCK: Cannot move cards INTO checking manually ===
    if (newStatus === "checking") {
      toast.error("Card tidak dapat dipindahkan secara manual ke Checking. Perpindahan ke Checking dilakukan otomatis melalui checklist 'Proses Sales Order'.");
      return;
    }

    // === BLOCK: Cannot move cards INTO approval_delivery manually ===
    if (newStatus === "approval_delivery") {
      toast.error("Card tidak dapat dipindahkan secara manual ke Approval Delivery. Perpindahan dilakukan otomatis setelah proses Stock Out oleh Warehouse.");
      return;
    }

    // === BLOCK: Cannot move cards INTO on_hold_delivery manually ===
    if (newStatus === "on_hold_delivery") {
      toast.error("Card tidak dapat dipindahkan secara manual ke On Hold Delivery Order. Perpindahan dilakukan otomatis oleh sistem.");
      return;
    }

    // === BLOCK: Cannot move cards INTO delivered / delivered_sample manually ===
    if (newStatus === "delivered" || newStatus === "delivered_sample") {
      toast.error("Card tidak dapat dipindahkan secara manual ke Delivered. Gunakan tombol 'Post Delivery' pada detail card agar stok ikut ter-posting.");
      return;
    }

    // === BLOCK: Cannot move to pengiriman column if that day is a holiday or weekend ===
    if (PENGIRIMAN_COLUMNS.includes(newStatus)) {
      const weekDates = getWeekDates();
      const targetDate = weekDates[newStatus as keyof typeof weekDates];
      if (targetDate) {
        const holidayName = isHoliday(targetDate);
        if (holidayName) {
          toast.error(`Tidak dapat memindahkan card ke hari ini karena libur: ${holidayName}`);
          return;
        }
        if (isWeekend(targetDate)) {
          toast.error("Tidak dapat memindahkan card ke hari Sabtu/Minggu.");
          return;
        }
      }
    }

    // === VALIDATION: approval_delivery → pengiriman_* ===
    if (cardToMove.board_status === "approval_delivery" && PENGIRIMAN_COLUMNS.includes(newStatus)) {
      // Only sales & super_admin can move
      if (!['super_admin', 'sales'].includes(user.role || '')) {
        toast.error("Hanya Sales atau Super Admin yang dapat memindahkan card ke Pengiriman Hari");
        return;
      }

      // Check if "Verifikasi Administrasi Finance" is checked
      const { data: checklists } = await supabase
        .from("delivery_checklists")
        .select("*")
        .eq("delivery_request_id", cardId)
        .eq("label", "Verifikasi Administrasi Finance");

      const financeChecked = checklists && checklists.length > 0 && checklists[0].is_checked;
      if (!financeChecked) {
        toast.error("Checklist 'Verifikasi Administrasi Finance' harus dicentang oleh Finance terlebih dahulu");
        return;
      }
    }

    try {
      // === BOOKING → DELIVERY: Confirm stock deduction when moving from approval_delivery to pengiriman_* ===
      if (cardToMove.board_status === "approval_delivery" && PENGIRIMAN_COLUMNS.includes(newStatus)) {
        const { data: bookedSOs, error: fetchErr } = await supabase
          .from("stock_out_headers")
          .select("id, stock_out_number")
          .eq("sales_order_id", cardToMove.sales_order_id)
          .eq("booking_status", "booked");

        if (fetchErr) throw fetchErr;

        for (const so of bookedSOs || []) {
          const { error: confirmErr } = await supabase.rpc("stock_out_confirm_delivery", {
            p_stock_out_id: so.id,
          });
          if (confirmErr) {
            toast.error(`Gagal konfirmasi pengiriman untuk ${so.stock_out_number}: ${confirmErr.message}`);
            return; // abort move; nothing has been changed yet
          }
        }
      }

      const { error } = await supabase
        .from("delivery_requests")
        .update({ 
          board_status: newStatus, 
          moved_by: user.id, 
          moved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", cardId);
      if (error) throw error;

      // Auto-create upload checklists when moving to pengiriman columns
      const fromLabel = BOARD_COLUMNS.find(c => c.id === cardToMove.board_status)?.label || cardToMove.board_status;
      const toLabel = BOARD_COLUMNS.find(c => c.id === newStatus)?.label || newStatus;

      if (PENGIRIMAN_COLUMNS.includes(newStatus) && cardToMove.board_status === "approval_delivery") {
        const checklistLabels = ["Upload Foto Pengiriman", "Upload Dokumen Delivery Order"];
        for (const label of checklistLabels) {
          await supabase.from("delivery_checklists").insert({
            delivery_request_id: cardId,
            label,
          });
        }

        await supabase.from("delivery_comments").insert({
          delivery_request_id: cardId,
          user_id: user.id,
          message: `📦 Card dipindahkan ke ${toLabel}. Checklist pengiriman otomatis ditambahkan.`,
          type: "activity",
        });
      } else {
        // Generic move comment for all other column transitions
        await supabase.from("delivery_comments").insert({
          delivery_request_id: cardId,
          user_id: user.id,
          message: `🔄 Card dipindahkan dari ${fromLabel} ke ${toLabel}.`,
          type: "activity",
        });
      }

      
      toast.success(`Card dipindahkan ke ${toLabel}`);
      
      // Push notification for board status change
      notifyDeliveryCardMoved(
        cardToMove.sales_order_number,
        fromLabel,
        toLabel,
        user.id,
      );
      
      fetchCards();
    } catch (err: any) {
      toast.error("Gagal memindahkan card: " + err.message);
    }
  };

  // Add SO to board
  const handleAddToBoard = async () => {
    if (!selectedSOId || !user) return;
    try {
      const { data, error } = await supabase
        .from("delivery_requests")
        .insert({
          sales_order_id: selectedSOId,
          board_status: "new_order",
          notes: addNotes || null,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      
      // Auto-create checklist item "Proses Sales Order"
      if (data?.id) {
        await supabase.from("delivery_checklists").insert({
          delivery_request_id: data.id,
          label: "Proses Sales Order",
        });
      }

      toast.success("Sales Order berhasil ditambahkan ke board");
      
      // Push notification for new delivery card
      const addedSO = availableSOs.find(s => s.id === selectedSOId);
      if (addedSO) {
        notifyNewDeliveryCard(addedSO.sales_order_number, user.id);
      }
      
      setAddDialogOpen(false);
      setSelectedSOId("");
      setAddNotes("");
      setSoSearchQuery("");
      fetchCards();
    } catch (err: any) {
      if (err.message?.includes("duplicate") || err.message?.includes("unique")) {
        toast.error("Sales Order ini sudah ada di board");
      } else {
        toast.error("Gagal menambahkan: " + err.message);
      }
    }
  };

  // Fetch available SOs
  const fetchAvailableSOs = async () => {
    const { data: existingIds } = await supabase
      .from("delivery_requests")
      .select("sales_order_id");
    
    const usedIds = existingIds?.map(e => e.sales_order_id) || [];

    const { data } = await supabase
      .from("sales_order_headers")
      .select("id, sales_order_number, customer_id, customers!inner(name), project_instansi, allocation_type, sales_name, customer_po_number")
      .eq("is_deleted", false)
      .in("status", ["approved", "partial"])
      .order("created_at", { ascending: false })
      .limit(200);

    const filtered = data?.filter(so => !usedIds.includes(so.id)) || [];
    setAvailableSOs(filtered);
  };

  const filteredSOs = availableSOs.filter(so => {
    if (!soSearchQuery.trim()) return true;
    const q = soSearchQuery.toLowerCase();
    return (
      so.sales_order_number?.toLowerCase().includes(q) ||
      (so.customers as any)?.name?.toLowerCase().includes(q) ||
      so.project_instansi?.toLowerCase().includes(q) ||
      so.sales_name?.toLowerCase().includes(q) ||
      so.customer_po_number?.toLowerCase().includes(q)
    );
  });

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, card: DeliveryCard) => {
    if (!canManage) return;
    // Block dragging cards in on_hold_delivery
    if (card.board_status === "on_hold_delivery") {
      e.preventDefault();
      return;
    }
    setDraggedCard(card);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", card.id);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    // Block drag-over on holiday/weekend pengiriman columns
    if (PENGIRIMAN_COLUMNS.includes(columnId)) {
      const weekDates = getWeekDates();
      const targetDate = weekDates[columnId as keyof typeof weekDates];
      if (targetDate && (isHoliday(targetDate) || isWeekend(targetDate))) {
        e.dataTransfer.dropEffect = "none";
        return;
      }
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => { setDragOverColumn(null); };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (draggedCard && draggedCard.board_status !== columnId) {
      moveCard(draggedCard.id, columnId as BoardStatus);
    }
    setDraggedCard(null);
  };

  const handleDragEnd = () => { setDraggedCard(null); setDragOverColumn(null); };

  const getColumnCards = (columnId: string) => {
    let filtered = cards.filter(c => c.board_status === columnId);
    if (filterLabelNames.length > 0) {
      filtered = filtered.filter(c => {
        const labels = cardLabelsMap[c.id] || [];
        return filterLabelNames.some(fn => labels.some(l => l.name === fn));
      });
    }
    if (cardSearchQuery.trim()) {
      const q = cardSearchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.sales_order_number.toLowerCase().includes(q) ||
        c.customer_name.toLowerCase().includes(q) ||
        c.customer_po_number.toLowerCase().includes(q) ||
        c.project_instansi.toLowerCase().includes(q) ||
        c.sales_name.toLowerCase().includes(q) ||
        c.items.some(i => i.product_name.toLowerCase().includes(q))
      );
    }
    if (filterUrgent) {
      filtered = filtered.filter(c => {
        const labels = cardLabelsMap[c.id] || [];
        const hasUrgentLabel = labels.some(l => /urgent|cito/i.test(l.name));
        const hasPendingUrgent = (pendingApprovalsMap[c.id] || 0) > 0;
        return hasUrgentLabel || hasPendingUrgent;
      });
    }
    return filtered;
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "approved": return "bg-green-500/20 text-green-300 border-green-500/30";
      case "partial": return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
      case "delivered": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const archivedCards = cards.filter(c => c.board_status === "archived");

  const handleRestoreCard = async (cardId: string) => {
    if (!user) return;
    setRestoringCardId(cardId);
    try {
      await supabase
        .from("delivery_requests")
        .update({
          board_status: "new_order",
          moved_by: user.id,
          moved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", cardId);

      await supabase.from("delivery_comments").insert({
        delivery_request_id: cardId,
        user_id: user.id,
        message: `♻️ Card di-restore dari Archived ke New Orders.`,
        type: "activity",
      });

      toast.success("Card berhasil di-restore ke New Orders");
      fetchCards();
    } catch (err: any) {
      toast.error("Gagal restore card: " + err.message);
    } finally {
      setRestoringCardId(null);
    }
  };

  // Permanent delete single archived card
  const handlePermanentDelete = async (cardId: string) => {
    if (!user) return;
    setDeletingCardId(cardId);
    try {
      const card = archivedCards.find(c => c.id === cardId);
      
      // Delete related data (cascade)
      await Promise.all([
        supabase.from("delivery_card_labels").delete().eq("delivery_request_id", cardId),
        supabase.from("delivery_checklists").delete().eq("delivery_request_id", cardId),
        supabase.from("delivery_comments").delete().eq("delivery_request_id", cardId),
        supabase.from("attachments").delete().eq("ref_table", "delivery_requests").eq("ref_id", cardId),
      ]);

      // Delete the card itself
      const { error } = await supabase.from("delivery_requests").delete().eq("id", cardId);
      if (error) throw error;

      // Audit log
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email,
        action: "PERMANENT_DELETE",
        module: "delivery_board",
        ref_table: "delivery_requests",
        ref_id: cardId,
        ref_no: card?.sales_order_number || "-",
        new_data: {
          sales_order_number: card?.sales_order_number,
          customer_name: card?.customer_name,
          deleted_permanently: true,
        },
      });

      toast.success(`Card ${card?.sales_order_number} berhasil dihapus permanen`);
      setConfirmDeleteCardId(null);
      fetchCards();
    } catch (err: any) {
      toast.error("Gagal menghapus card: " + err.message);
    } finally {
      setDeletingCardId(null);
    }
  };

  // Bulk permanent delete all archived cards
  const handleBulkPermanentDelete = async () => {
    if (!user || archivedCards.length === 0) return;
    setBulkDeleting(true);
    try {
      const cardIds = archivedCards.map(c => c.id);

      // Delete related data for all cards
      await Promise.all([
        supabase.from("delivery_card_labels").delete().in("delivery_request_id", cardIds),
        supabase.from("delivery_checklists").delete().in("delivery_request_id", cardIds),
        supabase.from("delivery_comments").delete().in("delivery_request_id", cardIds),
        supabase.from("attachments").delete().eq("ref_table", "delivery_requests").in("ref_id", cardIds),
      ]);

      // Delete all archived cards
      const { error } = await supabase.from("delivery_requests").delete().in("id", cardIds);
      if (error) throw error;

      // Audit log
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email,
        action: "BULK_PERMANENT_DELETE",
        module: "delivery_board",
        ref_table: "delivery_requests",
        ref_no: `${cardIds.length} cards`,
        new_data: {
          deleted_cards: archivedCards.map(c => ({
            id: c.id,
            sales_order_number: c.sales_order_number,
            customer_name: c.customer_name,
          })),
          deleted_permanently: true,
        },
      });

      toast.success(`${cardIds.length} card berhasil dihapus permanen`);
      setConfirmBulkDelete(false);
      fetchCards();
    } catch (err: any) {
      toast.error("Gagal menghapus semua card: " + err.message);
    } finally {
      setBulkDeleting(false);
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col relative",
        compact ? "h-full overflow-hidden" : (isFullView ? "fixed inset-0 z-50 h-screen" : "h-[calc(100vh-4rem)]")
      )}
      style={!compact && boardBgUrl ? {
        backgroundImage: `url(${boardBgUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      } : undefined}
    >
      {/* Background overlay for readability */}
      {boardBgUrl && <div className="absolute inset-0 bg-background/70 dark:bg-background/80 pointer-events-none z-0" />}
      
      {/* Header */}
      <div className={cn("flex items-center justify-between border-b bg-card/90 backdrop-blur-sm flex-shrink-0 relative z-10", compact ? "px-3 py-2" : "px-4 py-3")}>
        <div className="flex items-center gap-2 min-w-0">
          <Truck className={cn("text-primary shrink-0", compact ? "h-4 w-4" : "h-6 w-6")} />
          <div className="min-w-0">
            <h1 className={cn("font-bold text-foreground leading-tight", compact ? "text-sm" : "text-lg")}>Request & Delivery Order</h1>
            {!compact && <p className="text-xs text-muted-foreground">Kanban Board Jadwal Pengiriman</p>}
          </div>
          {compact && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={() => navigate("/request-delivery")}>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Buka halaman penuh</p></TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <TooltipProvider delayDuration={200}>
            {/* Zoom slider compact — hanya tampil saat compact */}
            {compact && (
              <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2 py-1">
                <ZoomOut className="h-3 w-3 text-muted-foreground cursor-pointer" onClick={() => handleSetZoom(zoomLevel - 5)} />
                <input type="range" min={40} max={130} step={5} value={zoomLevel}
                  onChange={(e) => handleSetZoom(Number(e.target.value))}
                  className="w-16 h-1.5 accent-primary cursor-pointer"
                  title={`Zoom: ${zoomLevel}%`}
                />
                <ZoomIn className="h-3 w-3 text-muted-foreground cursor-pointer" onClick={() => handleSetZoom(zoomLevel + 5)} />
                <span className="text-[10px] text-muted-foreground font-medium w-7 tabular-nums">{zoomLevel}%</span>
              </div>
            )}

            {/* Background changer - super_admin only */}
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
                  <TooltipContent><p>Background</p></TooltipContent>
                </Tooltip>
                <PopoverContent className="w-80" align="end">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Ganti Background Board</p>
                    
                    {/* Preset backgrounds */}
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground font-medium">Pilih Preset:</label>
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
                          <button
                            key={preset.label}
                            onClick={() => handleSetBg(preset.value)}
                            className={cn(
                              "flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all hover:scale-105",
                              boardBgUrl === preset.value
                                ? "border-primary ring-2 ring-primary/30"
                                : "border-border hover:border-primary/50"
                            )}
                          >
                            <div className={cn("w-full h-8 rounded", preset.preview)} 
                              style={preset.value ? { 
                                backgroundImage: `url(${preset.value})`, 
                                backgroundSize: "cover", 
                                backgroundPosition: "center" 
                              } : undefined}
                            />
                            <span className="text-[10px] text-muted-foreground truncate w-full text-center">{preset.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="border-t pt-3 space-y-2">
                      <label className="text-xs text-muted-foreground font-medium">Upload gambar:</label>
                      <input
                        ref={bgFileRef}
                        type="file"
                        accept="image/*"
                        onChange={handleBgFile}
                        className="block w-full text-xs file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-primary file:text-primary-foreground cursor-pointer"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground font-medium">Atau URL gambar:</label>
                      <div className="flex gap-1">
                        <Input
                          value={bgInput}
                          onChange={(e) => setBgInput(e.target.value)}
                          placeholder="https://..."
                          className="text-xs h-8"
                        />
                        <Button size="sm" className="h-8" onClick={() => { handleSetBg(bgInput); setBgInput(""); }}>
                          Set
                        </Button>
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

            {/* Week Calendar */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" title="Kalender Minggu Ini">
                  <CalendarDays className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50" align="end" sideOffset={8}>
                <div className="p-3">
                  <Calendar
                    mode="single"
                    className="pointer-events-auto !p-0"
                    classNames={{
                      months: "flex flex-col",
                      month: "space-y-2",
                      caption: "flex justify-between items-center px-1 py-1",
                      caption_label: "text-base font-semibold",
                      nav: "flex items-center gap-1",
                      nav_button: cn("h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100 inline-flex items-center justify-center rounded-md border border-input hover:bg-accent hover:text-accent-foreground"),
                      nav_button_previous: "",
                      nav_button_next: "",
                      table: "w-full border-collapse",
                      head_row: "flex",
                      head_cell: "text-muted-foreground rounded-md w-[7rem] font-normal text-[0.8rem] text-center",
                      row: "flex w-full",
                      cell: "w-[7rem] min-h-[4.5rem] text-center text-sm p-0.5 relative align-top",
                      day: "w-full h-full min-h-[4rem] p-1 font-normal flex flex-col items-center justify-start rounded-md hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground aria-selected:opacity-100",
                      day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                      day_today: "bg-accent text-accent-foreground",
                      day_outside: "text-muted-foreground opacity-50",
                      day_disabled: "text-muted-foreground opacity-50",
                      day_hidden: "invisible",
                    }}
                    modifiers={{
                      weekend: (date) => isWeekend(date),
                      holiday: (date) => !!isHoliday(date),
                    }}
                    modifiersClassNames={{
                      weekend: "!text-red-500 font-bold",
                      holiday: "!text-red-500 font-bold !bg-red-100 dark:!bg-red-950/40",
                    }}
                    components={{
                      DayContent: ({ date }) => {
                        const holidayName = isHoliday(date);
                        const dayNum = date.getDate();
                        const weekend = isWeekend(date);
                        return (
                          <div className="flex flex-col items-center gap-0.5 w-full">
                            <span className={cn("text-sm font-semibold", (holidayName || weekend) && "text-red-500 font-bold")}>{dayNum}</span>
                            {holidayName && (
                              <span className="text-[7px] leading-[1.2] text-red-500 text-center w-full break-words px-0.5">{holidayName}</span>
                            )}
                          </div>
                        );
                      },
                    }}
                  />
                </div>
              </PopoverContent>
            </Popover>

            {/* Filter & Search */}
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className={cn("h-8 w-8 relative", (filterLabelNames.length > 0 || cardSearchQuery.trim() || filterUrgent) && "border-primary text-primary")}>
                      <Filter className="h-4 w-4" />
                      {(filterLabelNames.length > 0 || cardSearchQuery.trim() || filterUrgent) && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">
                          {filterLabelNames.length + (cardSearchQuery.trim() ? 1 : 0) + (filterUrgent ? 1 : 0)}
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
                    {(filterLabelNames.length > 0 || cardSearchQuery.trim() || filterUrgent) && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => { setFilterLabelNames([]); setCardSearchQuery(""); setFilterUrgent(false); }}>
                        Reset
                      </Button>
                    )}
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={cardSearchQuery}
                      onChange={(e) => setCardSearchQuery(e.target.value)}
                      placeholder="Cari SO, customer, PO, produk..."
                      className="pl-7 h-8 text-xs"
                    />
                    {cardSearchQuery && (
                      <button onClick={() => setCardSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    )}
                  </div>

                  {/* Label filter */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Filter Label</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {allLabels.map((label) => (
                        <button
                          key={label.id}
                          onClick={() => {
                            setFilterLabelNames(prev => 
                              prev.includes(label.name) 
                                ? prev.filter(n => n !== label.name) 
                                : [...prev, label.name]
                            );
                          }}
                          className={cn(
                            "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-muted",
                            filterLabelNames.includes(label.name) && "bg-muted"
                          )}
                        >
                          <span className="h-3 w-3 rounded-sm flex-shrink-0" style={{ backgroundColor: label.color }} />
                          <span className="truncate text-foreground">{label.name}</span>
                          {filterLabelNames.includes(label.name) && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary ml-auto flex-shrink-0" />
                          )}
                        </button>
                      ))}
                      {allLabels.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">Belum ada label</p>
                      )}
                    </div>
                  </div>

                  {/* Urgent/Cito filter */}
                  <div className="pt-1 border-t">
                    <button
                      onClick={() => setFilterUrgent(!filterUrgent)}
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-muted",
                        filterUrgent && "bg-destructive/10"
                      )}
                    >
                      <Bell className="h-3.5 w-3.5 text-destructive" />
                      <span className="text-foreground">Urgent / Cito Request</span>
                      {filterUrgent && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-destructive ml-auto flex-shrink-0" />
                      )}
                    </button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Full View Toggle — disembunyikan saat compact */}
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
                    <input type="range" min={50} max={120} step={5} value={zoomLevel}
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

            {/* Archived */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 relative" onClick={() => setShowArchivedDialog(true)}>
                  <Archive className="h-4 w-4" />
                  {archivedCards.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                      {archivedCards.length}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Archived ({archivedCards.length})</p></TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={fetchCards}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Refresh</p></TooltipContent>
            </Tooltip>

            {/* Add SO */}
            {canManage && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" onClick={() => { setAddDialogOpen(true); fetchAvailableSOs(); }}>
                    <Plus className="h-4 w-4 mr-1" /> Tambah SO
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Tambah Sales Order ke Board</p></TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
      </div>

      {/* Board */}
      <div ref={scrollRef} className={cn("flex-1 relative z-10 min-h-0", (isFullView || compact) ? "overflow-auto" : "overflow-x-auto overflow-y-hidden")}>
        <div
          className={cn("flex gap-3 p-4 h-full", (isFullView || compact) ? "w-full" : "min-w-max")}
          style={(isFullView || compact) ? { transform: `scale(${zoomLevel / 100})`, transformOrigin: "top left", width: `${10000 / zoomLevel}%`, height: `${10000 / zoomLevel}%` } : undefined}
        >
          {BOARD_COLUMNS.map((column) => {
            const columnCards = getColumnCards(column.id);
            const weekDates = getWeekDates();
            const colDate = weekDates[column.id as keyof typeof weekDates];
            const colHolidayName = colDate ? isHoliday(colDate) : null;
            const colIsWeekend = colDate ? isWeekend(colDate) : false;
            const isHolidayColumn = !!(colHolidayName || colIsWeekend);
            return (
              <div
                key={column.id}
                className={cn(
                  "flex flex-col rounded-xl border transition-colors",
                  (isFullView || compact) ? "flex-1 min-w-0" : "w-[280px] flex-shrink-0",
                  isHolidayColumn
                    ? "bg-red-500/10 border-red-500/30 dark:bg-red-950/20 dark:border-red-500/20"
                    : "bg-muted/30 border-border/50",
                  dragOverColumn === column.id && !isHolidayColumn && "border-primary/50 bg-primary/5"
                )}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                {/* Column Header */}
                <div className={cn(
                  "px-3 py-2.5 rounded-t-xl flex items-center justify-between",
                  isHolidayColumn ? "bg-red-600 dark:bg-red-800" : column.color
                )}>
                  <span className={cn(
                    "text-xs font-bold truncate",
                    isHolidayColumn ? "text-red-100" : "text-white"
                  )}>
                    {column.label}
                    {colDate ? ` - ${format(colDate, "d MMM yyyy", { locale: idLocale })}` : ""}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isHolidayColumn && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-0.5 text-red-200 text-[10px]">
                            <CalendarIcon className="h-3 w-3" />
                            <span className="hidden sm:inline">Libur</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          {colHolidayName || "Akhir Pekan"} — Tidak dapat menerima pengiriman
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Badge variant="secondary" className="bg-white/20 text-white text-[10px] h-5 min-w-[20px] flex items-center justify-center">
                      {columnCards.length}
                    </Badge>
                  </div>
                </div>

                {/* Holiday Overlay / Cards Container */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 relative" style={{ maxHeight: "calc(100vh - 11rem)" }}>
                  {isHolidayColumn && columnCards.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-red-400 dark:text-red-500/60">
                      <CalendarIcon className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-xs font-medium text-center opacity-70">
                        {colHolidayName || "Akhir Pekan"}
                      </p>
                      <p className="text-[10px] text-center opacity-50 mt-0.5">Tidak ada pengiriman</p>
                    </div>
                  )}
                  {columnCards.map((card) => (
                    <Card
                      key={card.id}
                      draggable={canManage && card.board_status !== "on_hold_delivery"}
                      onDragStart={(e) => handleDragStart(e, card)}
                      onDragEnd={handleDragEnd}
                      title={isFullView ? `${card.sales_order_number}\n${card.customer_name}\nPO: ${card.customer_po_number}\n${card.project_instansi} • ${card.allocation_type}\nSales: ${card.sales_name}\nDeadline: ${card.delivery_deadline ? format(new Date(card.delivery_deadline), "dd MMM yy") : "-"}\nItems: ${card.items.map(i => `${i.product_name} ×${i.ordered_qty}`).join(", ")}${card.notes ? `\nNotes: ${card.notes}` : ""}` : undefined}
                      className={cn(
                        "relative overflow-visible cursor-pointer hover:shadow-md transition-all border-border/60 bg-card",
                        isFullView ? "p-1.5 hover:scale-[1.05] hover:z-20 hover:shadow-lg" : "p-3",
                        draggedCard?.id === card.id && "opacity-40 scale-95",
                        canManage && card.board_status !== "on_hold_delivery" && "cursor-grab active:cursor-grabbing",
                        card.board_status === "on_hold_delivery" && "opacity-75 cursor-not-allowed border-orange-500/30",
                        cardLabelsMap[card.id]?.some(l => /urgent|cito/i.test(l.name)) && !["delivered", "delivered_sample"].includes(card.board_status) && "ring-2 ring-destructive/70 border-destructive/50 animate-pulse",
                        pendingApprovalsMap[card.id] > 0 && !cardLabelsMap[card.id]?.some(l => /urgent|cito/i.test(l.name)) && !["delivered", "delivered_sample"].includes(card.board_status) && "ring-1 ring-amber-400/50 border-amber-400/40"
                      )}
                      onClick={() => setDetailCard(card)}
                    >
                      {/* Pending Approval Indicator */}
                      {pendingApprovalsMap[card.id] > 0 && !["delivered", "delivered_sample"].includes(card.board_status) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="absolute -top-1.5 -right-1.5 z-10" onClick={(e) => e.stopPropagation()}>
                              <span className="relative flex h-5 w-5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex items-center justify-center rounded-full h-5 w-5 bg-amber-500 text-white">
                                  <Bell className="h-3 w-3" />
                                </span>
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            ⏳ Menunggu persetujuan Urgent/Cito
                          </TooltipContent>
                        </Tooltip>
                      )}

                      {/* SO Number & Status */}
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1 truncate min-w-0">
                          {cardLabelsMap[card.id]?.some(l => /ready to deliver/i.test(l.name)) && (
                            <CheckCircle2 className={cn("text-success flex-shrink-0", isFullView ? "h-3 w-3" : "h-3.5 w-3.5")} />
                          )}
                          <span className={cn("font-bold text-primary truncate", isFullView ? "text-[9px]" : "text-[11px]")}>{card.sales_order_number}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Badge className={cn("px-1.5 py-0", isFullView ? "text-[7px] h-3.5" : "text-[9px] h-4", getStatusBadgeColor(card.so_status))}>
                            {card.so_status === "delivered" && ["delivered", "delivered_sample"].includes(card.board_status) ? "Delivered" : card.so_status === "delivered" ? "Fulfilled" : card.so_status}
                          </Badge>
                        </div>
                      </div>

                      {/* Created date - hide in full view */}
                      {!isFullView && (
                        <p className="text-[9px] text-muted-foreground mb-2">
                          Dibuat: {format(new Date(card.created_at), "dd MMM yy, HH:mm")}
                        </p>
                      )}

                      {/* Labels */}
                      {cardLabelsMap[card.id]?.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mb-1">
                          {cardLabelsMap[card.id].map((label, idx) => (
                            <span key={idx} className={cn("text-white px-1 py-0 rounded-sm font-medium", isFullView ? "text-[7px]" : "text-[9px] px-1.5 py-0.5")} style={{ backgroundColor: label.color }}>
                              {label.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Customer */}
                      <div className="flex items-center gap-1 mb-1">
                        <Building2 className={cn("text-muted-foreground flex-shrink-0", isFullView ? "h-2.5 w-2.5" : "h-3 w-3")} />
                        <span className={cn("text-foreground truncate font-medium", isFullView ? "text-[9px]" : "text-[11px]")}>{card.customer_name}</span>
                      </div>

                      {/* Customer PO Number - hide in full view */}
                      {!isFullView && (
                        <p className="text-[10px] text-muted-foreground truncate mb-1">
                          PO: <span className="font-medium text-foreground/80">{card.customer_po_number}</span>
                        </p>
                      )}

                      {/* Project - compact in full view */}
                      {!isFullView && (
                        <p className="text-[10px] text-muted-foreground truncate mb-2">
                          {card.project_instansi} • {card.allocation_type}
                        </p>
                      )}

                      {/* Items preview - hide in full view */}
                      {!isFullView && (
                        <div className="space-y-0.5 mb-2">
                          {card.items.slice(0, 2).map((item, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <Package className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-[10px] text-muted-foreground truncate">
                                {item.product_name} × {item.ordered_qty}
                              </span>
                            </div>
                          ))}
                          {card.items.length > 2 && (
                            <span className="text-[9px] text-muted-foreground/70">+{card.items.length - 2} produk lainnya</span>
                          )}
                        </div>
                      )}

                      {/* Footer */}
                      <div className={cn("flex items-center justify-between border-t border-border/40", isFullView ? "pt-1" : "pt-1.5")}>
                        <div className="flex items-center gap-1">
                          <CalendarIcon className={cn("text-destructive", isFullView ? "h-2.5 w-2.5" : "h-3 w-3")} />
                          <div className="flex flex-col">
                            {!isFullView && <span className="text-[8px] text-destructive font-semibold leading-tight">Deadline Pengiriman</span>}
                            <span className={cn("text-destructive font-bold", isFullView ? "text-[8px]" : "text-[10px]")}>
                              {card.delivery_deadline ? format(new Date(card.delivery_deadline), "dd MMM yy") : "-"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {/* Unread comment badge */}
                          {(unreadCommentsMap[card.id] || 0) > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-0.5 bg-primary/15 text-primary rounded-full px-1.5 py-0.5" onClick={(e) => e.stopPropagation()}>
                                  <MessageCircle className={cn(isFullView ? "h-2.5 w-2.5" : "h-3 w-3")} />
                                  <span className={cn("font-bold", isFullView ? "text-[7px]" : "text-[9px]")}>{unreadCommentsMap[card.id]}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {unreadCommentsMap[card.id]} komentar belum dibaca
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {!isFullView && (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground truncate max-w-[70px]">{card.sales_name}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Notes - hide in full view */}
                      {!isFullView && card.notes && (
                        <p className="text-[9px] text-muted-foreground/80 mt-1.5 italic truncate">📝 {card.notes}</p>
                      )}
                    </Card>
                  ))}

                  {columnCards.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground/50">
                      <p className="text-xs">Tidak ada card</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Marquee Ticker */}
      <DeliveryMarqueeTicker />


      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) { setSoSearchQuery(""); setSelectedSOId(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Sales Order ke Board</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Pilih Sales Order (Approved)</label>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari no. SO, customer, project, sales..."
                  value={soSearchQuery}
                  onChange={(e) => setSoSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="border rounded-md max-h-[240px] overflow-y-auto">
                {filteredSOs.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    {soSearchQuery ? "Tidak ditemukan SO yang cocok" : "Tidak ada SO yang tersedia"}
                  </div>
                ) : (
                  filteredSOs.map((so) => (
                    <div
                      key={so.id}
                      className={cn(
                        "px-3 py-2 cursor-pointer border-b last:border-b-0 transition-colors hover:bg-accent/50",
                        selectedSOId === so.id && "bg-primary/10 border-l-2 border-l-primary"
                      )}
                      onClick={() => setSelectedSOId(so.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">{so.sales_order_number}</span>
                        {so.customer_po_number && (
                          <span className="text-[10px] text-muted-foreground">PO: {so.customer_po_number}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(so.customers as any)?.name} • {so.project_instansi}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70">
                        Sales: {so.sales_name} • {so.allocation_type}
                      </p>
                    </div>
                  ))
                )}
              </div>
              {selectedSOId && (
                <p className="text-xs text-primary mt-1 font-medium">
                  ✓ Dipilih: {availableSOs.find(s => s.id === selectedSOId)?.sales_order_number}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Catatan (opsional)</label>
              <Textarea value={addNotes} onChange={(e) => setAddNotes(e.target.value)} placeholder="Catatan tambahan..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Batal</Button>
            <Button onClick={handleAddToBoard} disabled={!selectedSOId}>Tambahkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Card Dialog */}
      <DeliveryCardDetail
        card={detailCard as any}
        onClose={() => { setDetailCard(null); fetchCards(); fetchUnreadComments(); }}
        onMoveRequest={(card) => {
          setMoveDialogCard(card as any);
          setMoveTarget(card.board_status as BoardStatus);
        }}
        canManage={!!canManage}
      />

      {/* Move Dialog */}
      <Dialog open={!!moveDialogCard} onOpenChange={() => setMoveDialogCard(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pindahkan Card</DialogTitle>
          </DialogHeader>
          {moveDialogCard && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Pindahkan <strong>{moveDialogCard.sales_order_number}</strong> ke:
              </p>
              <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v as BoardStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOARD_COLUMNS.map((col) => {
                    const weekDates = getWeekDates();
                    const colDate = weekDates[col.id as keyof typeof weekDates];
                    const colHoliday = colDate ? isHoliday(colDate) : null;
                    const colIsWeekend = colDate ? isWeekend(colDate) : false;
                    const isHolidayBlocked = !!(colHoliday || colIsWeekend);
                    return (
                    <SelectItem 
                      key={col.id} 
                      value={col.id} 
                      disabled={col.id === moveDialogCard.board_status || col.id === "on_hold_delivery" || isHolidayBlocked}
                    >
                      {col.label} {col.id === moveDialogCard.board_status ? "(saat ini)" : ""} {col.id === "on_hold_delivery" ? "🔒" : ""} {isHolidayBlocked && col.id !== moveDialogCard.board_status ? "🚫 Libur" : ""}
                    </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogCard(null)}>Batal</Button>
            <Button
              onClick={() => {
                if (moveDialogCard && moveTarget !== moveDialogCard.board_status) {
                  moveCard(moveDialogCard.id, moveTarget);
                }
                setMoveDialogCard(null);
              }}
              disabled={moveTarget === moveDialogCard?.board_status}
            >
              Pindahkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archived Dialog */}
      <Dialog open={showArchivedDialog} onOpenChange={setShowArchivedDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5" />
                Archived Cards ({archivedCards.length})
              </DialogTitle>
              {isSuperAdmin && archivedCards.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="text-xs"
                  onClick={() => setConfirmBulkDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Hapus Semua
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 py-2">
            {archivedCards.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Archive className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Belum ada card yang diarsipkan</p>
              </div>
            ) : (
              archivedCards.map(card => (
                <div key={card.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{card.sales_order_number}</p>
                    <p className="text-xs text-muted-foreground truncate">{card.customer_name} • {card.customer_po_number}</p>
                    <p className="text-xs text-muted-foreground">
                      Deadline: {card.delivery_deadline ? format(new Date(card.delivery_deadline), "dd MMM yyyy") : "-"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    {canManage && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestoreCard(card.id)}
                            disabled={restoringCardId === card.id}
                          >
                            {restoringCardId === card.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            <span className="ml-1">Restore</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Kembalikan ke New Orders</p></TooltipContent>
                      </Tooltip>
                    )}
                    {isSuperAdmin && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setConfirmDeleteCardId(card.id)}
                            disabled={deletingCardId === card.id}
                          >
                            {deletingCardId === card.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Hapus Permanen</p></TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setShowArchivedDialog(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Single Delete Dialog */}
      <Dialog open={!!confirmDeleteCardId} onOpenChange={() => setConfirmDeleteCardId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Hapus Permanen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Anda yakin ingin menghapus card <strong>{archivedCards.find(c => c.id === confirmDeleteCardId)?.sales_order_number}</strong> secara permanen?
            </p>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="text-xs text-destructive font-medium">⚠️ Data berikut akan ikut terhapus:</p>
              <ul className="text-xs text-destructive/80 mt-1 space-y-0.5 list-disc list-inside">
                <li>Label yang terpasang</li>
                <li>Checklist items</li>
                <li>Komentar & activity log</li>
                <li>File lampiran</li>
              </ul>
              <p className="text-xs text-destructive font-bold mt-2">Aksi ini TIDAK DAPAT dibatalkan!</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteCardId(null)}>Batal</Button>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={() => confirmDeleteCardId && handlePermanentDelete(confirmDeleteCardId)}
              disabled={deletingCardId === confirmDeleteCardId}
            >
              {deletingCardId === confirmDeleteCardId ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> Menghapus...</>
              ) : (
                <><Trash2 className="h-3.5 w-3.5 mr-1" /> Ya, Hapus Permanen</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Bulk Delete Dialog */}
      <Dialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Hapus Semua Archived
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Anda yakin ingin menghapus <strong>{archivedCards.length} card</strong> yang diarsipkan secara permanen?
            </p>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="text-xs text-destructive font-medium">⚠️ Semua data terkait (label, checklist, komentar, lampiran) akan ikut terhapus.</p>
              <p className="text-xs text-destructive font-bold mt-2">Aksi ini TIDAK DAPAT dibatalkan!</p>
            </div>
            <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1">
              {archivedCards.map(card => (
                <p key={card.id} className="text-xs text-muted-foreground">
                  • {card.sales_order_number} — {card.customer_name}
                </p>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmBulkDelete(false)}>Batal</Button>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={handleBulkPermanentDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> Menghapus...</>
              ) : (
                <><Trash2 className="h-3.5 w-3.5 mr-1" /> Ya, Hapus Semua</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
