// PlanOrder.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { notifyNewPlanOrder, notifyRevisionRequest } from '@/lib/pushNotifications';
import {
  Plus,
  Search,
  Eye,
  Edit,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Loader2,
  Upload,
  ArrowLeft,
  Trash2,
  Printer,
  Archive,
  List,
  Download,
  Package,
  FileText,
  FileDown,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";

import { exportSectionBasedPdf } from "@/lib/pdfSectionExport";
import { ExportPOButton } from "@/components/ExportPOButton";

import { securePrint, printStyles, sanitizeHtml } from "@/lib/printUtils";
import { usePermissions } from "@/hooks/usePermissions";
import { PdfGeneratingOverlay } from "@/components/PdfGeneratingOverlay";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

import {
  usePlanOrders,
  usePlanOrderItems,
  useSettings,
  createPlanOrder,
  updatePlanOrder,
  approvePlanOrder,
  cancelPlanOrder,
  deletePlanOrder,
  logPlanOrderUpload,
  requestPlanOrderRevision,
  approvePlanOrderRevision,
  rejectPlanOrderRevision,
  PlanOrderHeader,
  PlanOrderItem,
} from "@/hooks/usePlanOrders";

import { useSuppliers, useProducts, Product } from "@/hooks/useMasterData";
import { uploadFile, getSignedUrl } from "@/lib/storage";
import { usePagination } from "@/hooks/usePagination";
import { DataTablePagination } from "@/components/DataTablePagination";
import { generateUniquePlanOrderNumber } from "@/lib/transactionNumberUtils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * ✅ Delivery To (LOCKED / BAKU)
 * Sesuai permintaan: alamat/pic/telp dikunci & selalu sama.
 */
const DELIVERY_TO_LOCKED = {
  name: "WAREHOUSE KEMIKA",
  addressLines: ["Jl. HOS Cokroaminoto No. 32 G", "Larangan Utara, Kota Tangerang 15154"],
  pic: "Bapak Sunarso",
  telp: "+62 856-1007-4714",
};

/**
 * ✅ Footnote / Shipping Notes (BAKU)
 * Sesuai contoh.
 */
const SHIPPING_NOTES_LOCKED = [
  "Waktu Pengiriman Barang Senin - Kamis (09.00 s/d 16.00)",
  "Pengiriman Barang Wajib Melampirkan Surat Jalan/DO, Invoice dan Copy Purchase Order (PO) di ttd & Stample.",
];
const NPWP_LOCKED = "71.608.326.6-416.000";

interface OrderItemUI {
  id: string;
  product_id: string;
  product?: Partial<Product> & {
    id: string;
    name: string;
    sku?: string | null;
    category?: { name?: string | null } | null;
    unit?: { name?: string | null } | null;
  };
  unit_price: number;
  planned_qty: number;
  notes: string;
}

const statusConfig: Record<
  string,
  { label: string; labelId: string; variant: "draft" | "approved" | "pending" | "success" | "cancelled" }
> = {
  draft: { label: "Draft", labelId: "Draft", variant: "draft" },
  approved: { label: "Approved", labelId: "Disetujui", variant: "approved" },
  revision_requested: { label: "Revision Requested", labelId: "Revisi Diminta", variant: "pending" },
  partially_received: { label: "Partially Received", labelId: "Diterima Sebagian", variant: "pending" },
  received: { label: "Received", labelId: "Diterima", variant: "success" },
  cancelled: { label: "Cancelled", labelId: "Dibatalkan", variant: "cancelled" },
};

function safeNumber(n: unknown, fallback = 0) {
  const v = typeof n === "number" ? n : parseFloat(String(n));
  return Number.isFinite(v) ? v : fallback;
}

function clampNumber(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function formatDateID(dateStr?: string | null) {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(dateStr);
  }
}

function formatDayLongID(dateStr?: string | null) {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("id-ID", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return String(dateStr);
  }
}

function formatDateTimeID(d: Date) {
  const date = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

export default function PlanOrder() {
  const { t, language } = useLanguage();
  const { user } = useAuth();

  const { planOrders, loading, refetch } = usePlanOrders();
  const { suppliers } = useSuppliers();
  const { products } = useProducts();
  const { allowAdminApprove } = useSettings();

  // RBAC
  const { canCreate, canEdit, canDelete, canCancel, canApproveOrder, isAdminOrAbove } = usePermissions();
  const canApprove = canApproveOrder("plan_order");

  // List/filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const [planNumber, setPlanNumber] = useState("");
  const [planDate, setPlanDate] = useState(new Date().toISOString().split("T")[0]);

  const [supplierId, setSupplierId] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [supplierPic, setSupplierPic] = useState("");
  const [supplierTelp, setSupplierTelp] = useState("");
  const [supplierPayTerm, setSupplierPayTerm] = useState("");

  const [referenceNo, setReferenceNo] = useState(""); // ✅ manual input di form (baru)
  const [expectedDelivery, setExpectedDelivery] = useState(""); // dari form
  const [notes, setNotes] = useState("");

  const [poDocumentUrl, setPoDocumentUrl] = useState("");
  const [poDocumentKey, setPoDocumentKey] = useState("");

  const [discount, setDiscount] = useState("0"); // nominal
  const [taxRate, setTaxRate] = useState("11");
  const [shippingCost, setShippingCost] = useState("0");

  const [orderItems, setOrderItems] = useState<OrderItemUI[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingNumber, setIsGeneratingNumber] = useState(false);

  // Detail/approval dialogs
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [approveReason, setApproveReason] = useState("");
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<PlanOrderHeader | null>(null);
  const { items: selectedOrderItems, loading: itemsLoading } = usePlanOrderItems(selectedOrder?.id || null);

  const [isApproving, setIsApproving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Revision workflow state
  const [isRevisionDialogOpen, setIsRevisionDialogOpen] = useState(false);
  const [isApproveRevisionDialogOpen, setIsApproveRevisionDialogOpen] = useState(false);
  const [isRejectRevisionDialogOpen, setIsRejectRevisionDialogOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [rejectRevisionReason, setRejectRevisionReason] = useState("");
  const [isRequestingRevision, setIsRequestingRevision] = useState(false);
  const [isApprovingRevision, setIsApprovingRevision] = useState(false);
  const [isRejectingRevision, setIsRejectingRevision] = useState(false);
  const [revisionReasonDisplay, setRevisionReasonDisplay] = useState<{ reason: string; requestedBy: string; requestedAt: string } | null>(null);
  const [approveReasonDisplay, setApproveReasonDisplay] = useState<{ reason: string; approvedBy: string; approvedAt: string } | null>(null);

  // Stock In history
  const [stockInHistory, setStockInHistory] = useState<any[]>([]);
  const [stockInHistoryLoading, setStockInHistoryLoading] = useState(false);

  // Document Viewer
  const [isOpeningPoDoc, setIsOpeningPoDoc] = useState(false);
  const [documentViewerUrl, setDocumentViewerUrl] = useState<string | null>(null);
  const [isDocumentViewerOpen, setIsDocumentViewerOpen] = useState(false);

  // PDF actions
  const printRef = useRef<HTMLDivElement>(null);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(
      safeNumber(value, 0),
    );

  // ===== Filters =====
  const filteredOrders = useMemo(() => {
    return planOrders.filter((order) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        order.plan_number.toLowerCase().includes(query) ||
        (order.supplier?.name || "").toLowerCase().includes(query) ||
        (order.reference_no || "").toLowerCase().includes(query);

      const matchesStatus = statusFilter === "all" || order.status === statusFilter;

      const od = new Date(order.plan_date);
      const matchesDateFrom = !dateFrom || od >= new Date(dateFrom);
      const matchesDateTo = !dateTo || od <= new Date(dateTo);

      const activeStatuses = ["draft", "approved", "partially_received", "revision_requested"];
      const archivedStatuses = ["received", "cancelled"];
      const matchesViewMode =
        viewMode === "active" ? activeStatuses.includes(order.status) : archivedStatuses.includes(order.status);

      return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && matchesViewMode;
    });
  }, [planOrders, searchQuery, statusFilter, dateFrom, dateTo, viewMode]);

  const hasActiveFilters = statusFilter !== "all" || !!dateFrom || !!dateTo;

  // Pagination
  const {
    currentPage,
    pageSize,
    totalPages,
    paginatedData: paginatedOrders,
    setCurrentPage,
    setPageSize,
  } = usePagination(filteredOrders);

  const clearFilters = () => {
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  // ===== Totals =====
  const calculateTotals = (items: OrderItemUI[]) => {
    const subtotal = items.reduce((sum, it) => sum + safeNumber(it.unit_price, 0) * safeNumber(it.planned_qty, 0), 0);

    // Discount as percentage (0-100%)
    const discPct = clampNumber(safeNumber(discount, 0), 0, 100);
    const discValue = (subtotal * discPct) / 100;
    const afterDiscount = subtotal - discValue;

    const taxPct = clampNumber(safeNumber(taxRate, 0), 0, 100);
    const taxValue = (afterDiscount * taxPct) / 100;

    const ship = clampNumber(safeNumber(shippingCost, 0), 0, 1_000_000_000_000);

    const grandTotal = afterDiscount + taxValue + ship;
    return { subtotal, discPct, discValue, afterDiscount, taxValue, ship, grandTotal };
  };

  const totalsForm = useMemo(() => calculateTotals(orderItems), [orderItems, discount, taxRate, shippingCost]);

  // ===== Supplier autofill (address/pic/telp/payterm) =====
  const applySupplierAutofill = (supId: string) => {
    setSupplierId(supId);
    const sup = suppliers.find((s: any) => s.id === supId);
    if (!sup) {
      setSupplierAddress("");
      setSupplierPic("");
      setSupplierTelp("");
      setSupplierPayTerm("");
      return;
    }

    // Use correct database column names from suppliers table
    const addr = sup.address || "";
    const pic = sup.contact_person || "";
    const telp = sup.phone || "";
    const payterm = sup.terms_payment || "";

    setSupplierAddress(addr);
    setSupplierPic(pic);
    setSupplierTelp(telp);
    setSupplierPayTerm(payterm);
  };

  // ===== Number generator =====
  const generatePlanNumber = async () => {
    setIsGeneratingNumber(true);
    try {
      const number = await generateUniquePlanOrderNumber();
      setPlanNumber(number);
    } finally {
      setIsGeneratingNumber(false);
    }
  };

  // ===== Reset form =====
  const resetForm = () => {
    setPlanNumber("");
    setPlanDate(new Date().toISOString().split("T")[0]);
    setSupplierId("");
    setSupplierAddress("");
    setSupplierPic("");
    setSupplierTelp("");
    setSupplierPayTerm("");
    setReferenceNo("");
    setExpectedDelivery("");
    setNotes("");
    setPoDocumentUrl("");
    setPoDocumentKey("");
    setDiscount("0");
    setTaxRate("11");
    setShippingCost("0");
    setOrderItems([]);
  };

  // ===== Line items =====
  const handleAddItem = () => {
    setOrderItems((prev) => [
      ...prev,
      { id: Date.now().toString(), product_id: "", unit_price: 0, planned_qty: 1, notes: "" },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setOrderItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleItemChange = (id: string, field: keyof OrderItemUI, value: string | number) => {
    setOrderItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;

        if (field === "product_id") {
          const p = products.find((x: any) => x.id === value);
          return {
            ...it,
            product_id: value as string,
            product: p,
            unit_price: safeNumber(p?.purchase_price ?? 0, 0),
          };
        }

        if (field === "planned_qty") {
          const q = clampNumber(parseInt(String(value || "1"), 10) || 1, 1, 1_000_000_000);
          return { ...it, planned_qty: q };
        }

        if (field === "unit_price") {
          const price = clampNumber(safeNumber(value, 0), 0, 1_000_000_000_000);
          return { ...it, unit_price: price };
        }

        return { ...it, [field]: value } as OrderItemUI;
      }),
    );
  };

  // ===== File upload =====
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await uploadFile(file, "documents", "plan-orders");
      if (result) {
        setPoDocumentUrl(result.url);
        setPoDocumentKey(result.path);
        toast.success(language === "en" ? "Document uploaded successfully" : "Dokumen berhasil diupload");
      } else {
        toast.error(language === "en" ? "Failed to upload document" : "Gagal upload dokumen");
      }
    } catch (err) {
      console.error(err);
      toast.error(language === "en" ? "Failed to upload document" : "Gagal upload dokumen");
    }
    setIsUploading(false);
  };

  // ===== View Document (signed url) =====
  const handleViewPoDocument = async (order: PlanOrderHeader) => {
    setIsOpeningPoDoc(true);
    try {
      const { data, error } = await supabase
        .from("attachments")
        .select("file_key, url")
        .eq("ref_table", "plan_order_headers")
        .eq("ref_id", order.id)
        .order("uploaded_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      const fileKey = data?.[0]?.file_key;
      const fallbackUrl = data?.[0]?.url || (order as any)?.po_document_url || "";

      const freshUrl = fileKey ? await getSignedUrl(fileKey, "documents") : null;
      const urlToOpen = freshUrl || fallbackUrl;

      if (!urlToOpen) {
        toast.error(language === "en" ? "Document not found" : "Dokumen tidak ditemukan");
        setIsOpeningPoDoc(false);
        return;
      }

      setDocumentViewerUrl(urlToOpen);
      setIsDocumentViewerOpen(true);
    } catch (err) {
      console.error(err);
      toast.error(language === "en" ? "Failed to open document" : "Gagal membuka dokumen");
    } finally {
      setIsOpeningPoDoc(false);
    }
  };

  // ===== Create / Update =====
  const validateForm = () => {
    if (!planNumber || !supplierId || orderItems.length === 0) return false;
    if (orderItems.some((it) => !it.product_id || safeNumber(it.planned_qty, 0) <= 0)) return false;
    if (!poDocumentUrl) return false;
    return true;
  };

  const handleSubmitCreate = async () => {
    if (!validateForm()) {
      toast.error(language === "en" ? "Please complete required fields" : "Harap lengkapi field wajib");
      return;
    }

    setIsSaving(true);
    try {
      const { subtotal, discValue, grandTotal } = calculateTotals(orderItems);

      const payloadHeader: any = {
        plan_number: planNumber,
        plan_date: planDate,
        supplier_id: supplierId,

        // ✅ expected delivery tampil di PDF (ambil dari form)
        expected_delivery_date: expectedDelivery || null,

        // ✅ reference no manual input
        reference_no: referenceNo || null,

        notes: notes || null,
        po_document_url: poDocumentUrl,

        status: "draft",
        total_amount: subtotal,
        discount: discValue,
        tax_rate: safeNumber(taxRate, 0),
        shipping_cost: safeNumber(shippingCost, 0),
        grand_total: grandTotal,

        created_by: user?.id || null,
        approved_by: null,
        approved_at: null,
      };

      const payloadItems = orderItems.map((it) => ({
        product_id: it.product_id,
        unit_price: it.unit_price,
        planned_qty: it.planned_qty,
        notes: it.notes,
      }));

      const result = await createPlanOrder(
        payloadHeader,
        payloadItems as any,
        poDocumentKey
          ? {
              file_key: poDocumentKey,
              url: poDocumentUrl,
              mime_type: undefined,
              file_size: undefined,
            }
          : undefined,
      );

      if (!result.success) throw new Error(result.error || "Failed to create plan order");

      toast.success(language === "en" ? "Plan Order created successfully" : "Plan Order berhasil dibuat");
      // Send push notification to admin/super_admin
      notifyNewPlanOrder(planNumber, user?.id);
      setIsFormOpen(false);
      resetForm();
      refetch();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : language === "en" ? "Failed to save" : "Gagal menyimpan");
    }
    setIsSaving(false);
  };

  const fetchOrderItemsForEdit = async (orderId: string) => {
    const { data, error } = await supabase
      .from("plan_order_items")
      .select(`*, product:products(id, name, sku, purchase_price, category:categories(name), unit:units(name))`)
      .eq("plan_order_id", orderId);

    if (error) {
      console.error(error);
      toast.error(language === "en" ? "Failed to load items" : "Gagal memuat item");
      return;
    }

    setOrderItems(
      (data || []).map((row: any) => ({
        id: row.id,
        product_id: row.product_id,
        product: row.product,
        unit_price: safeNumber(row.unit_price, 0),
        planned_qty: safeNumber(row.planned_qty, 1),
        notes: row.notes || "",
      })),
    );
  };

  const handleEditOrder = (order: PlanOrderHeader) => {
    setIsEditMode(true);
    setEditingOrderId(order.id);

    setPlanNumber(order.plan_number);
    setPlanDate(order.plan_date);
    applySupplierAutofill(order.supplier_id);

    setExpectedDelivery(order.expected_delivery_date || "");
    setNotes(order.notes || "");
    setPoDocumentUrl((order as any).po_document_url || "");
    setPoDocumentKey("");

    // ✅ reference no
    setReferenceNo(order.reference_no || "");

    setDiscount(String(order.discount ?? 0));
    setTaxRate(String(order.tax_rate ?? 11));
    setShippingCost(String(order.shipping_cost ?? 0));

    setIsFormOpen(true);
    fetchOrderItemsForEdit(order.id);
  };

  const handleUpdateOrder = async () => {
    if (!editingOrderId) return;

    if (!validateForm()) {
      toast.error(language === "en" ? "Please complete required fields" : "Harap lengkapi field wajib");
      return;
    }

    setIsSaving(true);
    try {
      const { subtotal, discValue, grandTotal } = calculateTotals(orderItems);

      const payloadHeader: any = {
        plan_number: planNumber,
        plan_date: planDate,
        supplier_id: supplierId,
        expected_delivery_date: expectedDelivery || null,
        reference_no: referenceNo || null,
        notes: notes || null,
        po_document_url: poDocumentUrl,
        total_amount: subtotal,
        discount: discValue,
        tax_rate: safeNumber(taxRate, 0),
        shipping_cost: safeNumber(shippingCost, 0),
        grand_total: grandTotal,
      };

      const payloadItems = orderItems.map((it) => ({
        product_id: it.product_id,
        unit_price: it.unit_price,
        planned_qty: it.planned_qty,
        notes: it.notes,
      }));

      const result = await updatePlanOrder(editingOrderId, payloadHeader, payloadItems as any);
      if (!result.success) throw new Error(result.error || "Failed to update plan order");

      // Log attachment if new one uploaded
      if (poDocumentKey && poDocumentUrl) {
        await logPlanOrderUpload(editingOrderId, planNumber, {
          file_key: poDocumentKey,
          url: poDocumentUrl,
        });
      }

      toast.success(language === "en" ? "Plan Order updated successfully" : "Plan Order berhasil diupdate");
      setIsFormOpen(false);
      setIsEditMode(false);
      setEditingOrderId(null);
      resetForm();
      refetch();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : language === "en" ? "Failed to update" : "Gagal update");
    }
    setIsSaving(false);
  };

  // ===== Approve / Cancel / Delete =====
  const handleApprove = async () => {
    if (!selectedOrder) return;

    if (!canApprove) {
      toast.error(language === "en" ? "You do not have permission to approve" : "Anda tidak memiliki izin approve");
      return;
    }

    setIsApproving(true);
    try {
      const result = await approvePlanOrder(selectedOrder.id, approveReason.trim() || undefined);
      if (!result.success) throw new Error(result.error || "Failed to approve");
      toast.success(language === "en" ? "Plan Order approved" : "Plan Order disetujui");
      // Notify creator about approval
      if (selectedOrder.created_by) {
        const { notifyOrderApproved } = await import('@/lib/pushNotifications');
        notifyOrderApproved(selectedOrder.created_by, 'Plan Order', selectedOrder.plan_number);
      }
      refetch();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    }
    setIsApproving(false);
    setIsApproveDialogOpen(false);
    setApproveReason("");
    setSelectedOrder(null);
  };

  const handleCancel = async () => {
    if (!selectedOrder) return;

    setIsCancelling(true);
    try {
      const result = await cancelPlanOrder(selectedOrder.id, cancelReason);
      if (!result.success) throw new Error(result.error || "Failed to cancel");
      toast.success(language === "en" ? "Plan Order cancelled" : "Plan Order dibatalkan");
      refetch();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to cancel");
    }
    setIsCancelling(false);
    setIsCancelDialogOpen(false);
    setCancelReason("");
    setSelectedOrder(null);
  };

  const handleDelete = async () => {
    if (!selectedOrder) return;

    setIsDeleting(true);
    try {
      const result = await deletePlanOrder(selectedOrder.id);
      if (!result.success) throw new Error(result.error || "Failed to delete");
      toast.success(language === "en" ? "Plan Order deleted" : "Plan Order dihapus");
      refetch();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
    setSelectedOrder(null);
  };

  // ===== Revision Workflow Handlers =====
  const handleRequestRevision = async () => {
    if (!selectedOrder || !revisionReason.trim()) return;
    setIsRequestingRevision(true);
    try {
      const result = await requestPlanOrderRevision(selectedOrder.id, revisionReason.trim());
      if (!result.success) throw new Error(result.error || "Failed to request revision");
      toast.success(language === "en" ? "Revision request submitted" : "Permintaan revisi terkirim");
      notifyRevisionRequest('Plan Order', selectedOrder.plan_number, user?.id);
      refetch();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to request revision");
    }
    setIsRequestingRevision(false);
    setIsRevisionDialogOpen(false);
    setRevisionReason("");
    setSelectedOrder(null);
  };

  const handleApproveRevision = async () => {
    if (!selectedOrder) return;
    setIsApprovingRevision(true);
    try {
      const result = await approvePlanOrderRevision(selectedOrder.id);
      if (!result.success) throw new Error(result.error || "Failed to approve revision");
      toast.success(language === "en" ? "Revision approved, order returned to draft" : "Revisi disetujui, order kembali ke draft");
      if (selectedOrder.created_by) {
        const { notifyOrderApproved } = await import('@/lib/pushNotifications');
        notifyOrderApproved(selectedOrder.created_by, 'Plan Order', selectedOrder.plan_number);
      }
      refetch();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to approve revision");
    }
    setIsApprovingRevision(false);
    setIsApproveRevisionDialogOpen(false);
    setSelectedOrder(null);
  };

  const handleRejectRevision = async () => {
    if (!selectedOrder) return;
    setIsRejectingRevision(true);
    try {
      const result = await rejectPlanOrderRevision(selectedOrder.id, rejectRevisionReason.trim() || undefined);
      if (!result.success) throw new Error(result.error || "Failed to reject revision");
      toast.success(language === "en" ? "Revision rejected, order stays approved" : "Revisi ditolak, order tetap approved");
      // Notify creator about rejection
      if (selectedOrder.created_by) {
        const { notifyOrderRejected } = await import('@/lib/pushNotifications');
        notifyOrderRejected(selectedOrder.created_by, 'Plan Order', selectedOrder.plan_number, rejectRevisionReason.trim());
      }
      refetch();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to reject revision");
    }
    setIsRejectingRevision(false);
    setIsRejectRevisionDialogOpen(false);
    setRejectRevisionReason("");
    setSelectedOrder(null);
  };

  // ===== Detail view =====
  const handleViewDetail = async (order: PlanOrderHeader) => {
    setSelectedOrder(order);
    setIsDetailDialogOpen(true);
    setRevisionReasonDisplay(null);
    setApproveReasonDisplay(null);

    // Fetch approve reason if status is approved or beyond
    if (['approved', 'partially_received', 'received'].includes(order.status)) {
      try {
        const { data: auditData } = await supabase
          .from('audit_logs')
          .select('new_data, user_email, created_at')
          .eq('ref_id', order.id)
          .eq('action', 'APPROVE')
          .order('created_at', { ascending: false })
          .limit(1);
        if (auditData && auditData.length > 0) {
          const nd = auditData[0].new_data as any;
          const reason = nd?.approve_reason;
          if (reason) {
            setApproveReasonDisplay({
              reason,
              approvedBy: auditData[0].user_email || '-',
              approvedAt: auditData[0].created_at ? formatDateTimeID(new Date(auditData[0].created_at)) : '-',
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch approve reason:', err);
      }
    }

    // Fetch revision reason if status is revision_requested
    if (order.status === 'revision_requested') {
      try {
        const { data: auditData } = await supabase
          .from('audit_logs')
          .select('new_data, user_email, created_at')
          .eq('ref_id', order.id)
          .eq('action', 'REVISION_REQUEST')
          .order('created_at', { ascending: false })
          .limit(1);
        if (auditData && auditData.length > 0) {
          const nd = auditData[0].new_data as any;
          setRevisionReasonDisplay({
            reason: nd?.reason || '-',
            requestedBy: auditData[0].user_email || '-',
            requestedAt: auditData[0].created_at ? formatDateTimeID(new Date(auditData[0].created_at)) : '-',
          });
        }
      } catch (err) {
        console.error('Failed to fetch revision reason:', err);
      }
    }

    // Stock in history (same logic)
    setStockInHistoryLoading(true);
    try {
      const { data: stockIns, error } = await supabase
        .from("stock_in_headers")
        .select(
          `
          id,
          stock_in_number,
          received_date,
          notes,
          created_at,
          stock_in_items (
            id,
            qty_received,
            batch_no,
            expired_date,
            product:products (name, sku)
          )
        `,
        )
        .eq("plan_order_id", order.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setStockInHistory(stockIns || []);
    } catch (err) {
      console.error("Failed to fetch stock in history:", err);
      setStockInHistory([]);
    } finally {
      setStockInHistoryLoading(false);
    }
  };

  // ===== PDF actions =====
  const handlePreviewPDF = () => {
    if (!selectedOrder) return;
    setIsPdfPreviewOpen(true);
  };

  const handleDownloadPDF = async () => {
    console.log("handleDownloadPDF called", { selectedOrder: !!selectedOrder, printRef: !!printRef.current });
    if (!selectedOrder) {
      console.error("No selectedOrder");
      toast.error(language === "en" ? "No order selected" : "Tidak ada order dipilih");
      return;
    }
    if (!printRef.current) {
      console.error("printRef.current is null");
      toast.error(language === "en" ? "Print template not ready" : "Template cetak belum siap");
      return;
    }
    setIsDownloadingPdf(true);
    try {
      const element = printRef.current;
      console.log("Print content length:", element.innerHTML.length);
      securePrint({
        title: `PurchaseOrder_${selectedOrder.plan_number}`,
        styles: printStyles.planOrder,
        content: element.innerHTML,
      });
      toast.info(
        language === "en"
          ? "Print dialog opened (enable Background graphics to keep the green header)"
          : "Dialog cetak dibuka (aktifkan Background graphics agar header hijau ikut tercetak)",
      );
    } catch (err) {
      console.error("Download PDF error:", err);
      toast.error(language === "en" ? "Failed to open print dialog" : "Gagal membuka dialog cetak");
    }
    setIsDownloadingPdf(false);
  };

  // ===== Save as PDF (langsung download tanpa print dialog) =====
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);

  const handleSaveAsPDF = async () => {
    if (!selectedOrder) {
      toast.error(language === "en" ? "No order selected" : "Tidak ada order dipilih");
      return;
    }
    if (!printRef.current) {
      toast.error(language === "en" ? "Print template not ready" : "Template cetak belum siap");
      return;
    }

    setIsSavingPdf(true);
    setPdfProgress(0);

    try {
      const filename = `PurchaseOrder_${selectedOrder.plan_number.replace(/[^a-zA-Z0-9.-]/g, "_")}.pdf`;

      await exportSectionBasedPdf({
        element: printRef.current,
        filename,
        onProgress: setPdfProgress,
      });

      toast.success(language === "en" ? "PDF saved successfully" : "PDF berhasil disimpan");
    } catch (err) {
      console.error("Save PDF error:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      toast.error(language === "en" ? `Failed to save PDF: ${errorMessage}` : `Gagal menyimpan PDF: ${errorMessage}`);
    }

    setIsSavingPdf(false);
    setPdfProgress(0);
  };

  // ===== INIT: when open create form generate number =====
  useEffect(() => {
    if (isFormOpen && !isEditMode) {
      if (!planNumber) generatePlanNumber();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFormOpen]);

  // Auto-open detail dialog from URL query param ?id=<planOrderId>
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || planOrders.length === 0) return;
    const order = planOrders.find((o) => o.id === id);
    if (order) {
      handleViewDetail(order);
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, planOrders]);

  // ======= UI: Form View =======
  if (isFormOpen) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setIsFormOpen(false);
              setIsEditMode(false);
              setEditingOrderId(null);
              resetForm();
            }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div>
            <h1 className="text-2xl font-bold font-display">
              {isEditMode
                ? language === "en"
                  ? "Edit Plan Order"
                  : "Edit Plan Order"
                : language === "en"
                  ? "Create Plan Order"
                  : "Buat Plan Order"}
            </h1>
            <p className="text-muted-foreground">
              {isEditMode
                ? language === "en"
                  ? "Update existing purchase order"
                  : "Ubah purchase order yang ada"
                : language === "en"
                  ? "Create new purchase order"
                  : "Buat purchase order baru"}
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main form */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === "en" ? "Order Information" : "Informasi Order"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Row 1 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{language === "en" ? "PO Number" : "Nomor PO"} *</Label>
                    <Input
                      placeholder={isGeneratingNumber ? "Generating..." : "e.g., PO/20260112.01"}
                      value={planNumber}
                      disabled={!isEditMode}
                      className={!isEditMode ? "bg-muted font-mono" : ""}
                      onChange={(e) => setPlanNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === "en" ? "PO Date" : "Tanggal PO"} *</Label>
                    <Input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === "en" ? "Expected Delivery" : "Expected Delivery"} *</Label>
                    <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
                  </div>
                </div>

                {/* Row 2 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Supplier *</Label>
                    <SearchableSelect
                      value={supplierId}
                      onValueChange={(v) => {
                        applySupplierAutofill(v);
                      }}
                      options={suppliers.map((sup: any) => ({
                        value: sup.id,
                        label: sup.name,
                        description: sup.code,
                      }))}
                      placeholder={language === "en" ? "Select supplier" : "Pilih supplier"}
                      searchPlaceholder={language === "en" ? "Search supplier..." : "Cari supplier..."}
                      emptyMessage={language === "en" ? "No supplier found" : "Supplier tidak ditemukan"}
                    />
                    <p className="text-xs text-muted-foreground">
                      {language === "en"
                        ? "Supplier address/PIC/phone/payment term will be pulled from Supplier master data."
                        : "Alamat/PIC/Telp/Payment Term otomatis ditarik dari Master Supplier."}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>{language === "en" ? "Reference No. (Manual)" : "Reference No. (Manual)"} *</Label>
                    <Input
                      placeholder="e.g., EP-01KB4FX2Z06CD27PF1DD8Y9XVC"
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                    />
                  </div>
                </div>

                {/* Auto-filled supplier info (readonly) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label>{language === "en" ? "Supplier Address" : "Alamat Supplier"}</Label>
                    <Textarea value={supplierAddress} readOnly className="bg-muted/50" rows={2} />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === "en" ? "Supplier PIC" : "PIC Supplier"}</Label>
                    <Input value={supplierPic} readOnly className="bg-muted/50" />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === "en" ? "Supplier Telp" : "Telp Supplier"}</Label>
                    <Input value={supplierTelp} readOnly className="bg-muted/50" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2 md:col-span-1">
                    <Label>
                      {language === "en" ? "Payment Term (from Supplier)" : "Payment Term (dari Supplier)"} *
                    </Label>
                    <Input value={supplierPayTerm} readOnly className="bg-muted/50" />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>{language === "en" ? "Notes (Optional)" : "Catatan (Opsional)"}</Label>
                    <Textarea
                      placeholder={language === "en" ? "Additional notes..." : "Catatan tambahan..."}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>

                {/* PO Document */}
                <div className="space-y-2">
                  <Label>{language === "en" ? "PO Document" : "Dokumen PO"} *</Label>
                  <div className="flex items-center gap-4">
                    {poDocumentUrl ? (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded overflow-hidden w-full">
                        <span className="text-sm truncate max-w-[520px] text-primary">
                          {(() => {
                            const urlPath = poDocumentUrl.split("?")[0];
                            const segments = urlPath.split("/");
                            const filename = segments[segments.length - 1];
                            const timestampPattern = /^\d{13}-/;
                            return decodeURIComponent(filename.replace(timestampPattern, ""));
                          })()}
                        </span>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          onClick={() => {
                            setPoDocumentUrl("");
                            setPoDocumentKey("");
                          }}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                        {isUploading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        {language === "en" ? "Upload Document" : "Upload Dokumen"}
                      </Button>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Line items */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{language === "en" ? "Order Items" : "Item Order"}</CardTitle>
                <Button size="sm" onClick={handleAddItem}>
                  <Plus className="w-4 h-4 mr-2" />
                  {language === "en" ? "Add Item" : "Tambah Item"}
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[360px]">{language === "en" ? "Product" : "Produk"}</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>{language === "en" ? "Unit" : "Satuan"}</TableHead>
                      <TableHead className="text-right">{language === "en" ? "Unit Price" : "Harga"}</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">{language === "en" ? "Amount" : "Jumlah"}</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {language === "en" ? "No items added yet" : "Belum ada item"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      orderItems.map((it) => {
                        const p = it.product;
                        return (
                          <TableRow key={it.id}>
                            <TableCell>
                              <SearchableSelect
                                value={it.product_id}
                                onValueChange={(v) => handleItemChange(it.id, "product_id", v)}
                                options={products.map((pp: any) => ({
                                  value: pp.id,
                                  label: `${pp.name}${pp.sku ? ` (${pp.sku})` : ""}`,
                                  description: pp.category?.name || undefined,
                                }))}
                                placeholder={language === "en" ? "Select product" : "Pilih produk"}
                                searchPlaceholder={language === "en" ? "Search product..." : "Cari produk..."}
                                emptyMessage={language === "en" ? "No product found" : "Produk tidak ditemukan"}
                              />
                            </TableCell>

                            <TableCell>{p?.sku || "-"}</TableCell>
                            <TableCell>{p?.unit?.name || "-"}</TableCell>

                            <TableCell className="text-right">
                              <Input
                                type="number"
                                className="w-32 text-right ml-auto"
                                value={it.unit_price}
                                onChange={(e) => handleItemChange(it.id, "unit_price", safeNumber(e.target.value, 0))}
                              />
                            </TableCell>

                            <TableCell className="text-center">
                              <Input
                                type="number"
                                className="w-20 text-center mx-auto"
                                value={it.planned_qty}
                                min={1}
                                onChange={(e) =>
                                  handleItemChange(it.id, "planned_qty", parseInt(e.target.value || "1", 10))
                                }
                              />
                            </TableCell>

                            <TableCell className="text-right">
                              {formatCurrency(it.unit_price * it.planned_qty)}
                            </TableCell>

                            <TableCell>
                              <Button variant="ghost" size="iconSm" onClick={() => handleRemoveItem(it.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Summary */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === "en" ? "Order Summary" : "Ringkasan Order"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(totalsForm.subtotal)}</span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">{language === "en" ? "Discount (%)" : "Diskon (%)"}</Label>
                    <Input
                      type="number"
                      className="w-32 text-right"
                      value={discount}
                      min={0}
                      max={100}
                      onChange={(e) => setDiscount(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{language === "en" ? "Discount Amount" : "Nilai Diskon"}</span>
                    <span>-{formatCurrency(totalsForm.discValue)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Tax (%)</Label>
                    <Input
                      type="number"
                      className="w-32 text-right"
                      value={taxRate}
                      min={0}
                      onChange={(e) => setTaxRate(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax Amount</span>
                    <span>{formatCurrency(totalsForm.taxValue)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">{language === "en" ? "Shipping" : "Ongkir"}</Label>
                    <Input
                      type="number"
                      className="w-32 text-right"
                      value={shippingCost}
                      min={0}
                      onChange={(e) => setShippingCost(e.target.value)}
                    />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between font-semibold text-lg">
                    <span>Grand Total</span>
                    <span className="text-primary">{formatCurrency(totalsForm.grandTotal)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-2">
              <Button
                onClick={isEditMode ? handleUpdateOrder : handleSubmitCreate}
                disabled={isSaving}
                className="w-full"
              >
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditMode
                  ? language === "en"
                    ? "Update Order"
                    : "Update Order"
                  : language === "en"
                    ? "Save as Draft"
                    : "Simpan Draft"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsFormOpen(false);
                  setIsEditMode(false);
                  setEditingOrderId(null);
                  resetForm();
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ======= UI: List View =======
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t("menu.planOrder")}</h1>
          <p className="text-muted-foreground">
            {t("menu.planOrderSub")} - {language === "en" ? "Manage purchase orders" : "Kelola purchase order"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportPOButton
            data={filteredOrders}
            statusFilter={statusFilter}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
          {canCreate("plan_order") && (
            <Button
              onClick={() => {
                resetForm();
                generatePlanNumber();
                setIsFormOpen(true);
                setIsEditMode(false);
                setEditingOrderId(null);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              {language === "en" ? "Create Plan Order" : "Buat Plan Order"}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            <List className="w-4 h-4" />
            {language === "en" ? "Active" : "Aktif"}
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2">
            <Archive className="w-4 h-4" />
            {language === "en" ? "Archived" : "Arsip"}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder={
                  language === "en"
                    ? "Search by PO number or supplier..."
                    : "Cari berdasarkan nomor PO atau supplier..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={language === "en" ? "All Status" : "Semua Status"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === "en" ? "All Status" : "Semua Status"}</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="approved">{language === "en" ? "Approved" : "Disetujui"}</SelectItem>
                <SelectItem value="partially_received">
                  {language === "en" ? "Partially Received" : "Diterima Sebagian"}
                </SelectItem>
                <SelectItem value="received">{language === "en" ? "Received" : "Diterima"}</SelectItem>
                <SelectItem value="cancelled">{language === "en" ? "Cancelled" : "Dibatalkan"}</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  {language === "en" ? "Date Range" : "Rentang Tanggal"}
                  {hasActiveFilters && (
                    <Badge variant="draft" className="text-xs px-1">
                      {language === "en" ? "Active" : "Aktif"}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{language === "en" ? "From Date" : "Dari Tanggal"}</Label>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === "en" ? "To Date" : "Sampai Tanggal"}</Label>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </div>
                  <Button variant="outline" size="sm" onClick={clearFilters} className="w-full">
                    {language === "en" ? "Clear Filters" : "Hapus Filter"}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === "en" ? "PO Number" : "Nomor PO"}</TableHead>
                  <TableHead>{language === "en" ? "Date" : "Tanggal"}</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>{language === "en" ? "Expected Delivery" : "Expected Delivery"}</TableHead>
                  <TableHead className="text-right">{language === "en" ? "Grand Total" : "Grand Total"}</TableHead>
                  <TableHead className="text-center">{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      {language === "en" ? "No plan orders found" : "Tidak ada plan order ditemukan"}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedOrders.map((order) => {
                    const status = statusConfig[order.status] || statusConfig.draft;

                    const showApprove = order.status === "draft" && canApprove;
                    const showCancel =
                      (order.status === "draft" || order.status === "approved") && canCancel("plan_order");
                    const showEdit = order.status === "draft" && canEdit("plan_order");
                    const showDelete = order.status === "draft" && canDelete("plan_order");
                    const showRequestRevision = order.status === "approved";
                    const showApproveRevision = order.status === "revision_requested" && isAdminOrAbove();
                    const showRejectRevision = order.status === "revision_requested" && isAdminOrAbove();

                    return (
                      <TableRow 
                        key={order.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleViewDetail(order)}
                      >
                        <TableCell className="font-medium">{order.plan_number}</TableCell>
                        <TableCell>{formatDateID(order.plan_date)}</TableCell>
                        <TableCell>{order.supplier?.name || "-"}</TableCell>
                        <TableCell>
                          {order.expected_delivery_date ? formatDateID(order.expected_delivery_date) : "-"}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(order.grand_total)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={status.variant}>{language === "en" ? status.label : status.labelId}</Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="iconSm">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDetail(order)}>
                                <Eye className="w-4 h-4 mr-2" />
                                {language === "en" ? "View Details" : "Lihat Detail"}
                              </DropdownMenuItem>

                              {(order as any)?.po_document_url && (
                                <DropdownMenuItem onClick={() => handleViewPoDocument(order)} disabled={isOpeningPoDoc}>
                                  <FileText className="w-4 h-4 mr-2" />
                                  {language === "en" ? "View Document" : "Lihat Dokumen"}
                                </DropdownMenuItem>
                              )}

                              {showEdit && (
                                <DropdownMenuItem onClick={() => handleEditOrder(order)}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  {t("common.edit")}
                                </DropdownMenuItem>
                              )}

                              {showApprove && (
                                <DropdownMenuItem
                                  className="text-success"
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setIsApproveDialogOpen(true);
                                  }}
                                >
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Approve
                                </DropdownMenuItem>
                              )}

                              {showCancel && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setIsCancelDialogOpen(true);
                                  }}
                                >
                                  <XCircle className="w-4 h-4 mr-2" />
                                  Cancel
                                </DropdownMenuItem>
                              )}

                              {showDelete && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setIsDeleteDialogOpen(true);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  {t("common.delete")}
                                </DropdownMenuItem>
                              )}

                              {showRequestRevision && (
                                <DropdownMenuItem
                                  className="text-warning"
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setRevisionReason("");
                                    setIsRevisionDialogOpen(true);
                                  }}
                                >
                                  <RotateCcw className="w-4 h-4 mr-2" />
                                  {language === "en" ? "Request Revision" : "Minta Revisi"}
                                </DropdownMenuItem>
                              )}

                              {showApproveRevision && (
                                <DropdownMenuItem
                                  className="text-success"
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setIsApproveRevisionDialogOpen(true);
                                  }}
                                >
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  {language === "en" ? "Approve Revision" : "Setujui Revisi"}
                                </DropdownMenuItem>
                              )}

                              {showRejectRevision && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setRejectRevisionReason("");
                                    setIsRejectRevisionDialogOpen(true);
                                  }}
                                >
                                  <XCircle className="w-4 h-4 mr-2" />
                                  {language === "en" ? "Reject Revision" : "Tolak Revisi"}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredOrders.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <AlertDialog open={isApproveDialogOpen} onOpenChange={(open) => { setIsApproveDialogOpen(open); if (!open) setApproveReason(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "en" ? "Approve Purchase Order" : "Setujui Purchase Order"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? `Are you sure you want to approve "${selectedOrder?.plan_number}"?`
                : `Apakah Anda yakin ingin menyetujui "${selectedOrder?.plan_number}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label>{language === "en" ? "Approval Reason (optional)" : "Alasan Persetujuan (opsional)"}</Label>
            <Textarea
              value={approveReason}
              onChange={(e) => setApproveReason(e.target.value)}
              placeholder={language === "en" ? "Enter reason for approval..." : "Masukkan alasan persetujuan..."}
              className="mt-1.5"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApproving}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              disabled={isApproving}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {isApproving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Dialog */}
      <AlertDialog open={isCancelDialogOpen} onOpenChange={(open) => { setIsCancelDialogOpen(open); if (!open) setCancelReason(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "en" ? "Cancel Purchase Order" : "Batalkan Purchase Order"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? `Are you sure you want to cancel "${selectedOrder?.plan_number}"?`
                : `Apakah Anda yakin ingin membatalkan "${selectedOrder?.plan_number}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-1">
            <label className="text-sm font-medium">
              {language === "en" ? "Cancellation Reason" : "Alasan Pembatalan"}
              <span className="text-muted-foreground font-normal ml-1">{language === "en" ? "(optional)" : "(opsional)"}</span>
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={language === "en" ? "e.g. Budget cut, supplier issue, etc." : "mis. anggaran dipotong, masalah supplier, dll."}
              rows={3}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={isCancelling}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isCancelling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === "en" ? "Cancel Order" : "Batalkan Order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === "en" ? "Delete Purchase Order" : "Hapus Purchase Order"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? `Are you sure you want to delete "${selectedOrder?.plan_number}"?`
                : `Apakah Anda yakin ingin menghapus "${selectedOrder?.plan_number}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revision Request Dialog */}
      <Dialog open={isRevisionDialogOpen} onOpenChange={setIsRevisionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{language === "en" ? "Request Revision" : "Minta Revisi"}</DialogTitle>
            <DialogDescription>
              {language === "en"
                ? `Request revision for "${selectedOrder?.plan_number}". Please provide a reason.`
                : `Ajukan revisi untuk "${selectedOrder?.plan_number}". Harap berikan alasan.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{language === "en" ? "Revision Reason" : "Alasan Revisi"} *</Label>
              <Textarea
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                placeholder={language === "en" ? "Explain why this order needs revision..." : "Jelaskan mengapa order ini perlu direvisi..."}
                rows={3}
              />
              <div className="flex items-center justify-between">
                <p className={`text-xs ${revisionReason.trim().length < 20 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {revisionReason.trim().length}/20 {language === "en" ? "min characters" : "karakter minimum"}
                </p>
                {revisionReason.trim().length >= 20 && <span className="text-xs text-green-600">✓</span>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRevisionDialogOpen(false)} disabled={isRequestingRevision}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleRequestRevision} disabled={isRequestingRevision || revisionReason.trim().length < 20}>
              {isRequestingRevision && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === "en" ? "Submit Request" : "Kirim Permintaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Revision Dialog */}
      <AlertDialog open={isApproveRevisionDialogOpen} onOpenChange={setIsApproveRevisionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === "en" ? "Approve Revision Request" : "Setujui Permintaan Revisi"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? `Approving will return "${selectedOrder?.plan_number}" to draft status so it can be edited. Continue?`
                : `Menyetujui akan mengembalikan "${selectedOrder?.plan_number}" ke status draft sehingga bisa diedit. Lanjutkan?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApprovingRevision}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveRevision} disabled={isApprovingRevision} className="bg-success text-success-foreground hover:bg-success/90">
              {isApprovingRevision && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === "en" ? "Approve Revision" : "Setujui Revisi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Revision Dialog */}
      <Dialog open={isRejectRevisionDialogOpen} onOpenChange={setIsRejectRevisionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{language === "en" ? "Reject Revision Request" : "Tolak Permintaan Revisi"}</DialogTitle>
            <DialogDescription>
              {language === "en"
                ? `Rejecting will return "${selectedOrder?.plan_number}" back to approved status.`
                : `Menolak akan mengembalikan "${selectedOrder?.plan_number}" ke status approved.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{language === "en" ? "Rejection Reason" : "Alasan Penolakan"} *</Label>
              <Textarea
                value={rejectRevisionReason}
                onChange={(e) => setRejectRevisionReason(e.target.value)}
                placeholder={language === "en" ? "Explain why the revision is rejected..." : "Jelaskan mengapa revisi ditolak..."}
                rows={3}
              />
              <div className="flex items-center justify-between">
                <p className={`text-xs ${rejectRevisionReason.trim().length < 20 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {rejectRevisionReason.trim().length}/20 {language === "en" ? "min characters" : "karakter minimum"}
                </p>
                {rejectRevisionReason.trim().length >= 20 && <span className="text-xs text-green-600">✓</span>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectRevisionDialogOpen(false)} disabled={isRejectingRevision}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleRejectRevision} disabled={isRejectingRevision || rejectRevisionReason.trim().length < 20}>
              {isRejectingRevision && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === "en" ? "Reject Revision" : "Tolak Revisi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog (with Preview / Download / Print / View Doc) */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>{language === "en" ? "Purchase Order Details" : "Detail Purchase Order"}</DialogTitle>

              <div className="flex gap-2 flex-wrap justify-end">
                {(selectedOrder as any)?.po_document_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectedOrder && handleViewPoDocument(selectedOrder)}
                    disabled={isOpeningPoDoc}
                  >
                    {isOpeningPoDoc ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4 mr-2" />
                    )}
                    {language === "en" ? "View Document" : "Lihat Dokumen"}
                  </Button>
                )}

                <Button variant="outline" size="sm" onClick={handlePreviewPDF} disabled={itemsLoading}>
                  <Eye className="w-4 h-4 mr-2" />
                  {language === "en" ? "Preview" : "Preview"}
                </Button>

                <Button variant="outline" size="sm" onClick={handleSaveAsPDF} disabled={itemsLoading || isSavingPdf}>
                  {isSavingPdf ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {language === "en" ? "Download" : "Unduh"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!printRef.current || !selectedOrder) return;
                    securePrint({
                      title: `Purchase Order - ${selectedOrder.plan_number}`,
                      styles: printStyles.planOrder,
                      content: printRef.current.innerHTML,
                    });
                  }}
                  disabled={itemsLoading}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  {language === "en" ? "Print" : "Cetak"}
                </Button>
              </div>
            </div>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "PO Number" : "Nomor PO"}</p>
                  <p className="font-medium">{selectedOrder.plan_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "PO Date" : "Tanggal PO"}</p>
                  <p className="font-medium">{formatDateID(selectedOrder.plan_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Supplier</p>
                  <p className="font-medium">{selectedOrder.supplier?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === "en" ? "Expected Delivery" : "Expected Delivery"}
                  </p>
                  <p className="font-medium">
                    {selectedOrder.expected_delivery_date ? formatDateID(selectedOrder.expected_delivery_date) : "-"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === "en" ? "Reference No." : "Reference No."}
                  </p>
                  <p className="font-medium">{selectedOrder.reference_no || "-"}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">{t("common.status")}</p>
                  <Badge variant={statusConfig[selectedOrder.status]?.variant || "draft"}>
                    {language === "en"
                      ? statusConfig[selectedOrder.status]?.label
                      : statusConfig[selectedOrder.status]?.labelId}
                  </Badge>
                </div>

                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Grand Total</p>
                  <p className="font-medium text-primary">{formatCurrency(selectedOrder.grand_total)}</p>
                </div>
              </div>

              {/* Revision Reason Banner */}
              {selectedOrder.status === 'revision_requested' && revisionReasonDisplay && (
                <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-warning font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    {language === "en" ? "Revision Requested" : "Permintaan Revisi"}
                  </div>
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">{language === "en" ? "Reason:" : "Alasan:"}</span> {revisionReasonDisplay.reason}</p>
                    <p><span className="text-muted-foreground">{language === "en" ? "Requested by:" : "Diminta oleh:"}</span> {revisionReasonDisplay.requestedBy}</p>
                    <p><span className="text-muted-foreground">{language === "en" ? "Date:" : "Tanggal:"}</span> {revisionReasonDisplay.requestedAt}</p>
                  </div>
                </div>
              )}

              {/* Approval Reason Banner */}
              {approveReasonDisplay && (
                <div className="rounded-lg border border-success/50 bg-success/10 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-success font-semibold">
                    <CheckCircle className="w-4 h-4" />
                    {language === "en" ? "Approval Note" : "Catatan Persetujuan"}
                  </div>
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">{language === "en" ? "Reason:" : "Alasan:"}</span> {approveReasonDisplay.reason}</p>
                    <p><span className="text-muted-foreground">{language === "en" ? "Approved by:" : "Disetujui oleh:"}</span> {approveReasonDisplay.approvedBy}</p>
                    <p><span className="text-muted-foreground">{language === "en" ? "Date:" : "Tanggal:"}</span> {approveReasonDisplay.approvedAt}</p>
                  </div>
                </div>
              )}

              {selectedOrder.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "Notes" : "Catatan"}</p>
                  <p className="text-sm">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Items */}
              <div>
                <h4 className="font-semibold mb-3">{language === "en" ? "Order Items" : "Item Order"}</h4>
                {itemsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>{language === "en" ? "Product" : "Produk"}</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>{language === "en" ? "Unit" : "Satuan"}</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">{language === "en" ? "Price" : "Harga"}</TableHead>
                        <TableHead className="text-right">{language === "en" ? "Amount" : "Jumlah"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrderItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                            {language === "en" ? "No items found" : "Tidak ada item"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedOrderItems.map((it: any, idx: number) => (
                          <TableRow key={it.id}>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell className="font-medium">{it.product?.name}</TableCell>
                            <TableCell>{it.product?.sku || "-"}</TableCell>
                            <TableCell>{it.product?.unit?.name || "-"}</TableCell>
                            <TableCell className="text-center">{safeNumber(it.planned_qty, 0)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(safeNumber(it.unit_price, 0))}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(
                                safeNumber(it.subtotal, safeNumber(it.unit_price, 0) * safeNumber(it.planned_qty, 0)),
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Summary */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(selectedOrder.total_amount)}</span>
                </div>
                {safeNumber(selectedOrder.discount, 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Discount</span>
                    <span>-{formatCurrency(selectedOrder.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax ({selectedOrder.tax_rate}%)</span>
                  <span>
                    {formatCurrency(
                      ((safeNumber(selectedOrder.total_amount, 0) - safeNumber(selectedOrder.discount, 0)) *
                        safeNumber(selectedOrder.tax_rate, 0)) /
                        100,
                    )}
                  </span>
                </div>
                {safeNumber(selectedOrder.shipping_cost, 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{language === "en" ? "Shipping" : "Ongkir"}</span>
                    <span>{formatCurrency(selectedOrder.shipping_cost)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                  <span>Grand Total</span>
                  <span className="text-primary">{formatCurrency(selectedOrder.grand_total)}</span>
                </div>
              </div>

              {/* Stock In History */}
              {selectedOrder.status !== "draft" && (
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    {language === "en" ? "Stock In History" : "Riwayat Stock In"}
                  </h4>
                  {stockInHistoryLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : stockInHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {language === "en" ? "No stock in records yet" : "Belum ada riwayat stock in"}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {stockInHistory.map((si: any) => (
                        <Card key={si.id} className="border">
                          <CardHeader className="py-3 px-4">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-semibold text-sm">{si.stock_in_number}</p>
                                <p className="text-xs text-muted-foreground">{formatDateID(si.received_date)}</p>
                              </div>
                              <Badge variant="success">
                                {si.stock_in_items?.reduce((sum: number, x: any) => sum + (x.qty_received || 0), 0)}{" "}
                                {language === "en" ? "items received" : "item diterima"}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="py-2 px-4">
                            <div className="text-xs space-y-1">
                              {si.stock_in_items?.map((x: any, idx: number) => (
                                <div key={x.id || idx} className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    {x.product?.name || "-"} (Batch: {x.batch_no || "-"})
                                  </span>
                                  <span className="font-medium">{x.qty_received}</span>
                                </div>
                              ))}
                            </div>
                            {si.notes && (
                              <p className="text-xs text-muted-foreground mt-2 italic">
                                {language === "en" ? "Notes" : "Catatan"}: {si.notes}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            {/* Revision actions in detail dialog */}
            {selectedOrder?.status === "approved" && (
              <Button
                variant="outline"
                className="border-warning text-warning hover:bg-warning/10"
                onClick={() => {
                  setRevisionReason("");
                  setIsRevisionDialogOpen(true);
                }}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                {language === "en" ? "Request Revision" : "Minta Revisi"}
              </Button>
            )}
            {selectedOrder?.status === "revision_requested" && isAdminOrAbove() && (
              <>
                <Button
                  variant="outline"
                  className="border-success text-success hover:bg-success/10"
                  onClick={() => setIsApproveRevisionDialogOpen(true)}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {language === "en" ? "Approve Revision" : "Setujui Revisi"}
                </Button>
                <Button
                  variant="outline"
                  className="border-destructive text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setRejectRevisionReason("");
                    setIsRejectRevisionDialogOpen(true);
                  }}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  {language === "en" ? "Reject Revision" : "Tolak Revisi"}
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              {language === "en" ? "Close" : "Tutup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden Print Content (Purchase Order PDF Template) */}
      <div className="hidden">
        <div ref={printRef}>
          {selectedOrder && (
            <div
              data-pdf-root
              style={{
                fontFamily: "Arial, sans-serif",
                fontSize: "11px",
                color: "#111",
                padding: "10mm",
              }}
            >
              {/* Header: logo left, title + numbers right */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <img
                    src={`${window.location.origin}/logo-kemika.png`}
                    crossOrigin="anonymous"
                    alt="Kemika"
                    style={{ height: "50px", objectFit: "contain" }}
                  />
                </div>

                <div style={{ textAlign: "right", minWidth: "320px" }}>
                  <div style={{ fontSize: "22px", fontWeight: 800, letterSpacing: 0.5 }}>PURCHASE ORDER</div>
                  <div style={{ height: "6px" }} />
                  <div style={{ display: "grid", gridTemplateColumns: "90px 10px 1fr", gap: "6px" }}>
                    <div style={{ textAlign: "left" }}>PO Number</div>
                    <div>:</div>
                    <div style={{ fontWeight: 700 }}>{selectedOrder.plan_number}</div>

                    <div style={{ textAlign: "left" }}>PO Date</div>
                    <div>:</div>
                    <div style={{ fontWeight: 700 }}>{formatDateID(selectedOrder.plan_date)}</div>
                  </div>
                </div>
              </div>

              {/* Reference No bar */}
              <div style={{ marginTop: "10px", border: "1px solid #111", padding: "6px 10px" }}>
                <span style={{ fontWeight: 700 }}>REFERENCE NO.</span> :{" "}
                <span style={{ fontWeight: 700, color: "#b91c1c" }}>{selectedOrder.reference_no || "-"}</span>
              </div>

              {/* Supplier vs Delivery To */}
              <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {/* Supplier */}
                <div style={{ border: "1px solid #111", padding: "10px", minHeight: "132px" }}>
                  <div style={{ fontWeight: 800, marginBottom: "6px" }}>SUPPLIER:</div>
                  <div style={{ fontWeight: 800 }}>{selectedOrder.supplier?.name || "-"}</div>
                  <div style={{ marginTop: "6px", whiteSpace: "pre-wrap" }}>
                    {selectedOrder.supplier?.address || "-"}
                  </div>

                  <div
                    style={{
                      marginTop: "10px",
                      display: "grid",
                      gridTemplateColumns: "70px 10px 1fr",
                      rowGap: "5px",
                    }}
                  >
                    <div>PIC</div>
                    <div>:</div>
                    <div style={{ fontWeight: 700 }}>{selectedOrder.supplier?.contact_person || "-"}</div>

                    <div>TELP.</div>
                    <div>:</div>
                    <div style={{ fontWeight: 700 }}>{selectedOrder.supplier?.phone || "-"}</div>

                    <div>PAYTERM</div>
                    <div>:</div>
                    <div style={{ fontWeight: 700 }}>{selectedOrder.supplier?.terms_payment || "-"}</div>
                  </div>
                </div>

                {/* Delivery To (LOCKED) */}
                <div style={{ border: "1px solid #111", padding: "10px", minHeight: "132px" }}>
                  <div style={{ fontWeight: 800, marginBottom: "6px" }}>DELIVERY TO:</div>
                  <div style={{ fontWeight: 800 }}>{DELIVERY_TO_LOCKED.name}</div>
                  <div style={{ marginTop: "6px" }}>
                    {DELIVERY_TO_LOCKED.addressLines.map((l, i) => (
                      <div key={i}>{l}</div>
                    ))}
                  </div>

                  <div
                    style={{
                      marginTop: "10px",
                      display: "grid",
                      gridTemplateColumns: "70px 10px 1fr",
                      rowGap: "5px",
                    }}
                  >
                    <div>PIC</div>
                    <div>:</div>
                    <div style={{ fontWeight: 700 }}>{DELIVERY_TO_LOCKED.pic}</div>

                    <div>TELP</div>
                    <div>:</div>
                    <div style={{ fontWeight: 700 }}>{DELIVERY_TO_LOCKED.telp}</div>
                  </div>

                  <div style={{ marginTop: "10px", fontWeight: 700 }}>
                    Expected Delivery :{" "}
                    <span style={{ fontWeight: 800 }}>
                      {formatDayLongID(selectedOrder.expected_delivery_date || null)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Items table */}
              <div style={{ marginTop: "10px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #111" }}>
                  <thead>
                    {/* ✅ BLOK HIJAU KEMIKA */}
                    <tr style={{ background: "#0B6B3A", color: "white" }}>
                      {["No", "Code", "Product Name", "Qty", "UOM", "Price @", "Disc%", "Amount"].map((h) => (
                        <th
                          key={h}
                          style={{
                            // Force background on cell level for print reliability
                            background: "#0B6B3A",
                            color: "white",
                            border: "1px solid #111",
                            padding: "9px 10px",
                            fontSize: "11px",
                            fontWeight: 800,
                            textAlign:
                              h === "Qty" || h === "No"
                                ? "center"
                                : h === "Price @" || h === "Amount" || h === "Disc%"
                                  ? "right"
                                  : "left",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {(() => {
                      // Calculate header-level discount percentage
                      const headerSubtotal = safeNumber(selectedOrder.total_amount, 0);
                      const headerDiscAmount = safeNumber(selectedOrder.discount, 0);
                      const headerDiscPct = headerSubtotal > 0 ? (headerDiscAmount / headerSubtotal) * 100 : 0;

                      return selectedOrderItems?.map((it: any, idx: number) => {
                        const qty = safeNumber(it.planned_qty, 0);
                        const price = safeNumber(it.unit_price, 0);
                        const lineSubtotal = qty * price;
                        // Apply header discount percentage to each line item
                        const lineDiscAmount = (lineSubtotal * headerDiscPct) / 100;
                        const lineAmount = lineSubtotal - lineDiscAmount;

                        return (
                          <tr key={it.id}>
                            <td style={{ border: "1px solid #111", padding: "8px 10px", textAlign: "center" }}>
                              {idx + 1}
                            </td>
                            <td style={{ border: "1px solid #111", padding: "8px 10px" }}>{it.product?.sku || "-"}</td>
                            <td style={{ border: "1px solid #111", padding: "8px 10px" }}>{it.product?.name || "-"}</td>
                            <td style={{ border: "1px solid #111", padding: "8px 10px", textAlign: "center" }}>{qty}</td>
                            <td style={{ border: "1px solid #111", padding: "8px 10px" }}>
                              {it.product?.unit?.name || "-"}
                            </td>
                            <td style={{ border: "1px solid #111", padding: "8px 10px", textAlign: "right" }}>
                              {formatCurrency(price)}
                            </td>
                            <td style={{ border: "1px solid #111", padding: "8px 10px", textAlign: "right" }}>
                              {headerDiscPct > 0 ? `${headerDiscPct.toFixed(1)}%` : "0%"}
                            </td>
                            <td style={{ border: "1px solid #111", padding: "8px 10px", textAlign: "right" }}>
                              {formatCurrency(lineAmount)}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* NOTE box + totals box */}
              <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 260px", gap: "10px" }}>
                <div style={{ border: "1px solid #111", padding: "10px", minHeight: "92px" }}>
                  <div style={{ fontWeight: 800, marginBottom: "6px" }}>NOTE:</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{selectedOrder.notes || ""}</div>
                </div>

                <div style={{ border: "1px solid #111", padding: "10px" }}>
                  {(() => {
                    const subtotal = safeNumber(selectedOrder.total_amount, 0);
                    const discAmount = safeNumber(selectedOrder.discount, 0);
                    // Calculate discount percentage from amount for display
                    const discPct = subtotal > 0 ? (discAmount / subtotal) * 100 : 0;
                    const net = subtotal - discAmount;
                    const tax = (net * safeNumber(selectedOrder.tax_rate, 0)) / 100;
                    const ship = safeNumber(selectedOrder.shipping_cost, 0);
                    const grand = safeNumber(selectedOrder.grand_total, 0);

                    return (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span>Subtotal</span>
                          <b>{formatCurrency(subtotal)}</b>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span>Discount ({discPct.toFixed(1)}%)</span>
                          <b>-{formatCurrency(discAmount)}</b>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span>Tax ({safeNumber(selectedOrder.tax_rate, 0)}%)</span>
                          <b>{formatCurrency(tax)}</b>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span>Shipping</span>
                          <b>{formatCurrency(ship)}</b>
                        </div>

                        <div
                          style={{
                            borderTop: "2px solid #111",
                            marginTop: "8px",
                            paddingTop: "8px",
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span style={{ fontSize: "12px", fontWeight: 800 }}>Grand Total</span>
                          <span style={{ fontSize: "12px", fontWeight: 800 }}>{formatCurrency(grand)}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Signature area */}
              {/* Signature area: 3 columns (Vendor, Purchasing, Approve) */}
              <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0px" }}>
                {/* Shared helpers (inline) */}
                {(() => {
                  const topHeaderStyle: React.CSSProperties = {
                    textAlign: "right",
                    fontSize: "9px",
                    marginBottom: "4px",
                    color: "#444",
                    minHeight: "14px",
                    lineHeight: "14px",
                  };

                  const metaRowStyle: React.CSSProperties = {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "6px",
                    minHeight: "16px", // ✅ biar semua kolom punya tinggi meta yg sama
                  };

                  const roleStyle: React.CSSProperties = { fontSize: "10px", color: "#666" };
                  const dateStyle: React.CSSProperties = { fontSize: "9px", color: "#666" };

                  const signWrapStyle: React.CSSProperties = {
                    flex: 1, // ✅ dorong area bawah (garis) jadi rata
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "58px", // ✅ seragam untuk semua kolom
                    paddingBottom: "2px",
                  };

                  const lineStyle: React.CSSProperties = { borderBottom: "1px solid #111", height: "1px" };

                  const bottomNameStyle: React.CSSProperties = {
                    fontSize: "10px",
                    marginTop: "5px",
                    textAlign: "center",
                    fontWeight: 700,
                    color: "#111",
                    minHeight: "14px",
                    lineHeight: "14px",
                  };

                  const bottomPlaceholderStyle: React.CSSProperties = {
                    fontSize: "10px",
                    marginTop: "5px",
                    textAlign: "center",
                    color: "#666",
                    minHeight: "14px",
                    lineHeight: "14px",
                  };

                  return (
                    <>
                      {/* 1) Vendor (LEFT) */}
                      <div
                        style={{
                          border: "1px solid #111",
                          padding: "8px 10px",
                          minHeight: "120px",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        {(() => {
                          const supplierName = selectedOrder.supplier?.name || "-";
                          const vendorSignatureUrl = ""; // placeholder (kalau ada dari DB tinggal isi)
                          return (
                            <>
                              <div style={topHeaderStyle}>
                                Ditandatangani oleh <span style={{ fontWeight: 700 }}>{supplierName}</span>
                              </div>

                              {/* ✅ Meta row dibuat SAMA dengan kolom lain, tapi tanggal disembunyikan */}
                              <div style={metaRowStyle}>
                                <div style={roleStyle}>Vendor,</div>
                                <div style={{ ...dateStyle, visibility: "hidden" }}>Pada 00 Xxx 0000 00.00</div>
                              </div>

                              {/* ✅ Area tanda tangan (seragam) */}
                              <div style={signWrapStyle}>
                                {vendorSignatureUrl ? (
                                  <img
                                    src={vendorSignatureUrl}
                                    crossOrigin="anonymous"
                                    alt="Vendor Signature"
                                    style={{ height: "48px", maxWidth: "130px", objectFit: "contain" }}
                                  />
                                ) : (
                                  <div style={{ height: "48px" }} />
                                )}
                              </div>

                              {/* ✅ Garis selalu berada di “posisi bawah” yang sama */}
                              <div style={lineStyle} />

                              <div style={bottomPlaceholderStyle}>(.................................)</div>
                            </>
                          );
                        })()}
                      </div>

                      {/* 2) Purchasing (MIDDLE) */}
                      <div
                        style={{
                          border: "1px solid #111",
                          borderLeft: "0px",
                          padding: "8px 10px",
                          minHeight: "120px",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        {(() => {
                          const creator = (selectedOrder as any)?.creator;
                          const creatorSignatureUrl = creator?.signature_url;
                          const creatorName = creator?.full_name || user?.name || "-";
                          const createdAt = selectedOrder.created_at
                            ? new Date(selectedOrder.created_at as string)
                            : null;

                          return (
                            <>
                              <div style={topHeaderStyle}>
                                Ditandatangani oleh <span style={{ fontWeight: 700 }}>{creatorName}</span>
                              </div>

                              <div style={metaRowStyle}>
                                <div style={roleStyle}>Purchasing,</div>
                                <div style={dateStyle}>{createdAt ? `Pada ${formatDateTimeID(createdAt)}` : "-"}</div>
                              </div>

                              <div style={signWrapStyle}>
                                {creatorSignatureUrl ? (
                                  <img
                                    src={creatorSignatureUrl}
                                    crossOrigin="anonymous"
                                    alt="Creator Signature"
                                    style={{ height: "48px", maxWidth: "130px", objectFit: "contain" }}
                                  />
                                ) : (
                                  <div style={{ height: "48px" }} />
                                )}
                              </div>

                              <div style={lineStyle} />

                              <div style={bottomNameStyle}>{creatorName}</div>
                            </>
                          );
                        })()}
                      </div>

                      {/* 3) Approve (RIGHT) */}
                      <div
                        style={{
                          border: "1px solid #111",
                          borderLeft: "0px",
                          padding: "8px 10px",
                          minHeight: "120px",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        {(() => {
                          const approver = (selectedOrder as any)?.approver;
                          const signatureUrl = approver?.signature_url;
                          const approverName = approver?.full_name || "-";
                          const isApproved = !!selectedOrder.approved_by && !!selectedOrder.approved_at;

                          const fallbackSignature = approverName.toLowerCase().includes("ferry")
                            ? `${window.location.origin}/signature-ferry.png`
                            : `${window.location.origin}/approved-signature.png`;

                          return (
                            <>
                              <div style={topHeaderStyle}>
                                Ditandatangani oleh{" "}
                                <span style={{ fontWeight: 700 }}>{isApproved ? approverName : "-"}</span>
                              </div>

                              <div style={metaRowStyle}>
                                <div style={roleStyle}>Approve,</div>
                                <div style={dateStyle}>
                                  {isApproved
                                    ? `Pada ${formatDateTimeID(new Date(selectedOrder.approved_at as string))}`
                                    : "-"}
                                </div>
                              </div>

                              <div style={signWrapStyle}>
                                {isApproved ? (
                                  <img
                                    src={signatureUrl || fallbackSignature}
                                    crossOrigin="anonymous"
                                    alt="Approved Signature"
                                    style={{ height: "48px", maxWidth: "130px", objectFit: "contain" }}
                                  />
                                ) : (
                                  <div style={{ height: "48px" }} />
                                )}
                              </div>

                              <div style={lineStyle} />

                              <div style={isApproved ? bottomNameStyle : bottomPlaceholderStyle}>
                                {isApproved ? approverName : "(.................................)"}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </>
                  );
                })()}
              </div>
              {/* Shipping notes */}
              <div style={{ marginTop: "10px", border: "1px solid #111", padding: "10px", fontSize: "9px" }}>
                <div style={{ fontWeight: 800, marginBottom: "6px" }}>KETENTUAN PENGIRIMAN / SHIPPING NOTES :</div>
                <ul style={{ margin: 0, paddingLeft: "14px" }}>
                  {SHIPPING_NOTES_LOCKED.map((x, i) => (
                    <li key={i} style={{ marginBottom: "2px" }}>
                      {x}
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: "6px" }}>
                  <b>NPWP</b> : {NPWP_LOCKED}
                </div>
              </div>

              {/* Printout */}
              <div style={{ marginTop: "12px", fontSize: "10px" }}>Printout : {formatDateTimeID(new Date())}</div>
            </div>
          )}
        </div>
      </div>

      {/* PDF Preview Dialog */}
      <Dialog open={isPdfPreviewOpen} onOpenChange={setIsPdfPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{language === "en" ? "PDF Preview" : "Preview PDF"}</DialogTitle>
            <DialogDescription>
              {language === "en"
                ? "Preview your document before printing or saving as PDF"
                : "Lihat dokumen sebelum mencetak atau menyimpan sebagai PDF"}
            </DialogDescription>
          </DialogHeader>

          {/* Preview dengan style yang sama seperti print */}
          <div className="bg-white p-4 rounded border overflow-x-auto">
            <style
              dangerouslySetInnerHTML={{
                __html: `
              .pdf-preview-content th[style*="background"] {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            `,
              }}
            />
            <div
              className="pdf-preview-content"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(printRef.current?.innerHTML || "") }}
            />
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setIsPdfPreviewOpen(false)}>
              {language === "en" ? "Close" : "Tutup"}
            </Button>
            {/* Tombol Save as PDF - langsung download tanpa dialog print */}
            <Button variant="success" onClick={handleSaveAsPDF} disabled={isSavingPdf}>
              {isSavingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
              {language === "en" ? "Save as PDF" : "Simpan PDF"}
            </Button>
            <Button variant="outline" onClick={handleDownloadPDF} disabled={isDownloadingPdf}>
              {isDownloadingPdf ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {language === "en" ? "Print to PDF" : "Cetak ke PDF"}
            </Button>
            <Button
              onClick={() => {
                if (!printRef.current || !selectedOrder) return;
                securePrint({
                  title: `Purchase Order - ${selectedOrder.plan_number}`,
                  styles: printStyles.planOrder,
                  content: printRef.current.innerHTML,
                });
              }}
            >
              <Printer className="w-4 h-4 mr-2" />
              {language === "en" ? "Print" : "Cetak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Viewer Dialog */}
      <Dialog open={isDocumentViewerOpen} onOpenChange={setIsDocumentViewerOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0">
          <DialogHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <DialogTitle>{language === "en" ? "View Document" : "Lihat Dokumen"}</DialogTitle>
              <div className="flex gap-2">
                {documentViewerUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (documentViewerUrl) {
                        const link = document.createElement("a");
                        link.href = documentViewerUrl;
                        link.download = "document";
                        link.target = "_blank";
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {language === "en" ? "Download" : "Unduh"}
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>
          <div className="w-full h-[75vh] border-t">
            {documentViewerUrl ? (
              <iframe src={documentViewerUrl} className="w-full h-full" title="Document Viewer" />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {language === "en" ? "No document to display" : "Tidak ada dokumen untuk ditampilkan"}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF Generating Overlay */}
      <PdfGeneratingOverlay isVisible={isSavingPdf} progress={pdfProgress} language={language as "en" | "id"} />
    </div>
  );
}
