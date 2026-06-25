import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { notifyNewSalesOrder, notifyRevisionRequest } from '@/lib/pushNotifications';
import {
  Plus,
  Search,
  Eye,
  Edit,
  MoreHorizontal,
  Printer,
  Trash2,
  Loader2,
  Upload,
  X,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Archive,
  List,
  FileText,
  Download,
  Package,
  FileDown,
  RotateCcw,
} from "lucide-react";

import { exportSectionBasedPdf } from "@/lib/pdfSectionExport";
import { ExportButton } from "@/components/ExportButton";

import { usePermissions } from "@/hooks/usePermissions";
import { securePrint, printStyles, sanitizeHtml } from "@/lib/printUtils";
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
  useSalesOrders,
  useSalesOrderItems,
  createSalesOrder,
  updateSalesOrder,
  approveSalesOrder,
  cancelSalesOrder,
  deleteSalesOrder,
  getProductStock,
  requestSalesOrderRevision,
  approveSalesOrderRevision,
  rejectSalesOrderRevision,
  SalesOrderHeader,
} from "@/hooks/useSalesOrders";

import { useSettings } from "@/hooks/usePlanOrders";
import { useCustomers, useProducts } from "@/hooks/useMasterData";
import { useSalesUsers } from "@/hooks/useSalesUsers";
import { uploadFile, getSignedUrl } from "@/lib/storage";
import { usePagination } from "@/hooks/usePagination";
import { DataTablePagination } from "@/components/DataTablePagination";
import { generateUniqueSalesOrderNumber } from "@/lib/transactionNumberUtils";
import { supabase } from "@/integrations/supabase/client";
import { listSalesPulseOpenReferences, sanitizeCustomerPoNumber, type SalesPulseReference } from "@/lib/salesPulseSync";
import { toast } from "sonner";

const statusConfig: Record<
  string,
  { label: string; labelId: string; variant: "draft" | "approved" | "pending" | "success" | "cancelled" }
> = {
  draft: { label: "Draft", labelId: "Draft", variant: "draft" },
  approved: { label: "Approved", labelId: "Disetujui", variant: "approved" },
  revision_requested: { label: "Revision Requested", labelId: "Revisi Diminta", variant: "pending" },
  partially_delivered: { label: "Partially Delivered", labelId: "Terkirim Sebagian", variant: "pending" },
  delivered: { label: "Delivered", labelId: "Terkirim", variant: "success" },
  cancelled: { label: "Cancelled", labelId: "Dibatalkan", variant: "cancelled" },
};

const allocationTypes = ["Selling", "Sample", "Stock", "Project"] as const;
type AllocationType = (typeof allocationTypes)[number];

/**
 * ✅ DISCOUNT RULE (OPSI A)
 * - Diskon hanya per item (Line Discount)
 * - Input diskon hanya PERSENTASE (%)
 * - Sistem auto hitung Diskon (Rp) per item
 * - Tidak ada Header Discount (hapus dari UI & kalkulasi)
 * - Summary menampilkan Total Discount (Rp) = jumlah diskon semua item
 * - DB: sales_order_items.discount tetap disimpan sebagai NOMINAL (Rp)
 */
interface OrderItem {
  product_id: string;
  product_name: string;
  sku: string;
  unit: string;
  category: string;
  unit_price: number;
  ordered_qty: number;

  discount_pct: number; // input user (%)
  discount_nominal: number; // computed (Rp)

  subtotal: number; // computed: qty*price - discount_nominal
  stock_available: number;
}

function clampNumber(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function safeNumber(n: unknown, fallback = 0) {
  const v = typeof n === "number" ? n : parseFloat(String(n));
  return Number.isFinite(v) ? v : fallback;
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

export default function SalesOrder() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { salesOrders, loading, refetch } = useSalesOrders();
  const { customers } = useCustomers();
  const { products } = useProducts();
  const { allowAdminApprove } = useSettings();
  const { salesUsers } = useSalesUsers();

  // RBAC Permissions
  const { canCreate, canEdit, canDelete, canCancel, canApproveOrder, isAdminOrAbove } = usePermissions();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isUploading, setIsUploading] = useState(false);

  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [approveReason, setApproveReason] = useState("");
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<SalesOrderHeader | null>(null);

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

  const [isOpeningPoDoc, setIsOpeningPoDoc] = useState(false);
  const [documentViewerUrl, setDocumentViewerUrl] = useState<string | null>(null);
  const [isDocumentViewerOpen, setIsDocumentViewerOpen] = useState(false);

  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const { items: selectedOrderItems, loading: itemsLoading } = useSalesOrderItems(selectedOrder?.id || null);

  // Stock Out history for the selected order
  const [stockOutHistory, setStockOutHistory] = useState<any[]>([]);
  const [stockOutHistoryLoading, setStockOutHistoryLoading] = useState(false);

  // Proforma Invoice (DP + Termin) info for the selected order
  const [piDpInfo, setPiDpInfo] = useState<{
    pi_number: string;
    dp_percent: number;
    term_days: number | null;
    payment_note: string | null;
    grand_total: number;
  } | null>(null);

  // === Form state ===
  const [soNumber, setSoNumber] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [customerId, setCustomerId] = useState("");
  const [customerPoNumber, setCustomerPoNumber] = useState("");
  const [salesPulseReferenceNumber, setSalesPulseReferenceNumber] = useState("");
  const [salesPulseOptions, setSalesPulseOptions] = useState<SalesPulseReference[]>([]);
  const [isSalesPulseLoading, setIsSalesPulseLoading] = useState(false);
  const [salesPulseSearchQuery, setSalesPulseSearchQuery] = useState("");
  const [salesName, setSalesName] = useState("");
  const [allocationType, setAllocationType] = useState<AllocationType | "">("");
  const [projectInstansi, setProjectInstansi] = useState("");
  const [deliveryDeadline, setDeliveryDeadline] = useState("");
  const [shipToAddress, setShipToAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [poDocumentUrl, setPoDocumentUrl] = useState("");
  const [poDocumentKey, setPoDocumentKey] = useState(""); // simpan path untuk signed url

  // ✅ headerDiscount dihapus
  const [taxRate, setTaxRate] = useState(11);
  const [shippingCost, setShippingCost] = useState(0);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");

  // Auto-fill customer fields
  const [customerPic, setCustomerPic] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  // Use RBAC hook for approve permission
  const canApprove = canApproveOrder("sales_order");

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
      Math.round(safeNumber(value, 0)),
    );

  // === FILTER LIST ===
  const filteredOrders = useMemo(() => {
    return salesOrders.filter((order) => {
      const matchesSearch =
        order.sales_order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.customer?.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer_po_number.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || order.status === statusFilter;

      const od = new Date(order.order_date);
      const matchesDateFrom = !dateFrom || od >= new Date(dateFrom);
      const matchesDateTo = !dateTo || od <= new Date(dateTo);

      const activeStatuses = ["draft", "approved", "partially_delivered", "revision_requested"];
      const archivedStatuses = ["delivered", "cancelled"];
      const matchesViewMode =
        viewMode === "active" ? activeStatuses.includes(order.status) : archivedStatuses.includes(order.status);

      return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && matchesViewMode;
    });
  }, [salesOrders, searchQuery, statusFilter, dateFrom, dateTo, viewMode]);

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

  // === NUMBER GENERATOR ===
  const generateSoNumber = async () => {
    const number = await generateUniqueSalesOrderNumber();
    setSoNumber(number);
  };

  const resetForm = () => {
    setSoNumber("");
    setOrderDate(new Date().toISOString().split("T")[0]);
    setCustomerId("");
    setCustomerPoNumber("");
    setSalesPulseReferenceNumber("");
    setSalesPulseSearchQuery("");
    setSalesName("");
    setAllocationType("");
    setProjectInstansi("");
    setDeliveryDeadline("");
    setShipToAddress("");
    setNotes("");
    setPoDocumentUrl("");
    setPoDocumentKey("");
    setTaxRate(11);
    setShippingCost(0);
    setOrderItems([]);
    setSelectedProductId("");
    setCustomerPic("");
    setCustomerPhone("");
    setPaymentTerms("");
  };

  const handleOpenDialog = async () => {
    resetForm();
    await generateSoNumber();
    setIsEditMode(false);
    setEditingOrderId(null);
    setIsDialogOpen(true);
  };

  const handleCustomerChange = (newCustomerId: string) => {
    setCustomerId(newCustomerId);
    const c = customers.find((x) => x.id === newCustomerId);
    if (c) {
      setCustomerPic(c.pic || "");
      setCustomerPhone(c.phone || "");
      setPaymentTerms(c.terms_payment || "");
      if (!shipToAddress) setShipToAddress(c.address || "");
    }
  };

  useEffect(() => {
    if (!isDialogOpen) return;

    let isActive = true;
    const searchDelay = window.setTimeout(() => {
      const loadSalesPulseReferences = async () => {
        setIsSalesPulseLoading(true);
        try {
          const data = await listSalesPulseOpenReferences({
            search: salesPulseSearchQuery.trim() || undefined,
            includeSelectedReference: salesPulseReferenceNumber || undefined,
          });

          if (!isActive) return;

          setSalesPulseOptions((prev) => {
            const selectedReference = salesPulseReferenceNumber
              ? prev.find((item) => item.reference_number === salesPulseReferenceNumber)
              : undefined;

            return selectedReference && !data.some((item) => item.reference_number === selectedReference.reference_number)
              ? [selectedReference, ...data]
              : data;
          });
        } catch (error) {
          console.error('Failed to load Sales Pulse references:', error);
          if (isActive) {
            setSalesPulseOptions((prev) => {
              const selectedReference = salesPulseReferenceNumber
                ? prev.find((item) => item.reference_number === salesPulseReferenceNumber)
                : undefined;
              return selectedReference ? [selectedReference] : [];
            });
            toast.error(language === "en" ? "Failed to load Sales Pulse references" : "Gagal memuat referensi SalesPulse");
          }
        } finally {
          if (isActive) setIsSalesPulseLoading(false);
        }
      };

      void loadSalesPulseReferences();
    }, 300);

    return () => {
      isActive = false;
      window.clearTimeout(searchDelay);
    };
  }, [isDialogOpen, language, salesPulseReferenceNumber, salesPulseSearchQuery]);

  // === ITEMS: DISCOUNT % -> NOMINAL + SUBTOTAL ===
  const recomputeLine = (qty: number, price: number, discPct: number) => {
    const q = clampNumber(safeNumber(qty, 0), 0, 1_000_000_000);
    const p = clampNumber(safeNumber(price, 0), 0, 1_000_000_000_000);
    const pct = clampNumber(safeNumber(discPct, 0), 0, 100);

    const gross = q * p;
    const discNominal = clampNumber((gross * pct) / 100, 0, gross);
    const subtotal = gross - discNominal;

    return {
      qty: q,
      price: p,
      discount_pct: pct,
      discount_nominal: discNominal,
      subtotal,
    };
  };

  const handleItemChange = (
    index: number,
    field: keyof Pick<OrderItem, "ordered_qty" | "unit_price" | "discount_pct">,
    value: number,
  ) => {
    setOrderItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;

        const next = { ...item } as OrderItem;

        const nextQty = field === "ordered_qty" ? value : next.ordered_qty;
        const nextPrice = field === "unit_price" ? value : next.unit_price;
        const nextPct = field === "discount_pct" ? value : next.discount_pct;

        const calc = recomputeLine(nextQty, nextPrice, nextPct);

        next.ordered_qty = calc.qty;
        next.unit_price = calc.price;
        next.discount_pct = calc.discount_pct;
        next.discount_nominal = calc.discount_nominal;
        next.subtotal = calc.subtotal;

        return next;
      }),
    );
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddProduct = async () => {
    if (!selectedProductId) return;
    const p = products.find((x) => x.id === selectedProductId);
    if (!p) return;

    if (orderItems.some((it) => it.product_id === selectedProductId)) {
      toast.error(language === "en" ? "Product already added" : "Produk sudah ditambahkan");
      return;
    }

    const stockAvailable = await getProductStock(selectedProductId);
    const price = safeNumber(p.selling_price || p.purchase_price, 0);

    const calc = recomputeLine(1, price, 0);

    const newItem: OrderItem = {
      product_id: p.id,
      product_name: p.name,
      sku: p.sku || "-",
      unit: p.unit?.name || "-",
      category: p.category?.name || "-",
      unit_price: calc.price,
      ordered_qty: calc.qty,
      discount_pct: calc.discount_pct,
      discount_nominal: calc.discount_nominal,
      subtotal: calc.subtotal,
      stock_available: stockAvailable,
    };

    setOrderItems((prev) => [...prev, newItem]);
    setSelectedProductId("");
  };

  // === TOTALS: DPP Pengganti scheme (same as PI) ===
  const totals = useMemo(() => {
    const grossSubtotal = orderItems.reduce(
      (sum, it) => sum + safeNumber(it.ordered_qty, 0) * safeNumber(it.unit_price, 0),
      0,
    );
    const totalDiscount = orderItems.reduce((sum, it) => sum + safeNumber(it.discount_nominal, 0), 0);
    const netSubtotal = grossSubtotal - totalDiscount;

    // DPP Pengganti = DPP × 11/12
    const dpp = netSubtotal;
    const dppPengganti = Math.round(dpp * 11 / 12);
    // PPN 12% = DPP Pengganti × 12%
    const tax = Math.round(dppPengganti * 12 / 100);
    const ship = clampNumber(safeNumber(shippingCost, 0), 0, 1_000_000_000_000);
    const grandTotal = dpp + tax + ship;

    return {
      grossSubtotal,
      totalDiscount,
      netSubtotal,
      dpp,
      dppPengganti,
      tax,
      ship,
      grandTotal,
    };
  }, [orderItems, shippingCost]);

  // === FILE UPLOAD ===
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await uploadFile(file, "documents", "sales-orders");
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

  // === VIEW DOCUMENT (SIGNED URL) ===
  const extractStoragePathFromUrl = (url: string): string | null => {
    if (!url) return null;
    if (!url.startsWith("http")) return url;
    try {
      const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
      if (m && m[2]) return decodeURIComponent(m[2]);
    } catch {}
    return null;
  };

  const openDocument = async (order: SalesOrderHeader) => {
    const rawUrl = order.po_document_url || "";
    if (!rawUrl) {
      toast.error(language === "en" ? "No document attached" : "Tidak ada dokumen terlampir");
      return;
    }

    setIsOpeningPoDoc(true);
    try {
      const possibleKey =
        // @ts-ignore
        (order.po_document_key as string | undefined) || poDocumentKey || extractStoragePathFromUrl(rawUrl);

      if (possibleKey) {
        const signed = await getSignedUrl(possibleKey, "documents", 3600);
        if (signed) {
          setDocumentViewerUrl(signed);
          setIsDocumentViewerOpen(true);
          setIsOpeningPoDoc(false);
          return;
        }

        const { data, error } = await supabase.storage.from("documents").createSignedUrl(possibleKey, 3600);
        if (!error && data?.signedUrl) {
          setDocumentViewerUrl(data.signedUrl);
          setIsDocumentViewerOpen(true);
          setIsOpeningPoDoc(false);
          return;
        }
      }

      setDocumentViewerUrl(rawUrl);
      setIsDocumentViewerOpen(true);
    } catch (err) {
      console.error(err);
      toast.error(language === "en" ? "Failed to open document" : "Gagal membuka dokumen");
    }
    setIsOpeningPoDoc(false);
  };

  // === CRUD ===
  const handleEdit = async (order: SalesOrderHeader) => {
    setIsEditMode(true);
    setEditingOrderId(order.id);

    setSoNumber(order.sales_order_number);
    setOrderDate(order.order_date);
    setCustomerId(order.customer_id);
    setCustomerPoNumber(order.customer_po_number);
    setSalesPulseReferenceNumber(order.sales_pulse_reference_number || "");
    setSalesPulseSearchQuery("");
    setSalesName(order.sales_name);
    setAllocationType((order.allocation_type as AllocationType) || "");
    setProjectInstansi(order.project_instansi);
    setDeliveryDeadline(order.delivery_deadline);
    setShipToAddress(order.ship_to_address || "");
    setNotes(order.notes || "");
    setPoDocumentUrl(order.po_document_url || "");
    // @ts-ignore
    setPoDocumentKey(order.po_document_key || "");

    // ✅ header discount sudah tidak dipakai lagi (abaikan order.discount untuk input UI)

    setTaxRate(safeNumber(order.tax_rate, 11));
    setShippingCost(safeNumber(order.shipping_cost, 0));

    // Fetch items
    const { data, error } = await supabase
      .from("sales_order_items")
      .select(
        `*, product:products(id, name, sku, selling_price, purchase_price, category:categories(name), unit:units(name))`,
      )
      .eq("sales_order_id", order.id);

    if (error) {
      console.error(error);
      toast.error(language === "en" ? "Failed to load order items" : "Gagal memuat item order");
      setIsDialogOpen(true);
      return;
    }

    const mapped: OrderItem[] = [];
    for (const it of data || []) {
      const stock = await getProductStock(it.product_id);
      const qty = safeNumber(it.ordered_qty, 0);
      const price = safeNumber(it.unit_price, 0);

      // DB discount = nominal (Rp)
      const discNominal = clampNumber(safeNumber(it.discount, 0), 0, qty * price);
      const gross = qty * price;
      const discPct = gross > 0 ? (discNominal / gross) * 100 : 0;

      const calc = recomputeLine(qty, price, discPct);

      mapped.push({
        product_id: it.product_id,
        product_name: it.product?.name || "",
        sku: it.product?.sku || "-",
        unit: it.product?.unit?.name || "-",
        category: it.product?.category?.name || "-",
        unit_price: calc.price,
        ordered_qty: calc.qty,
        discount_pct: calc.discount_pct,
        discount_nominal: calc.discount_nominal,
        subtotal: calc.subtotal,
        stock_available: stock,
      });
    }

    setOrderItems(mapped);

    // Auto-fill customer data
    const c = customers.find((x) => x.id === order.customer_id);
    if (c) {
      setCustomerPic(c.pic || "");
      setCustomerPhone(c.phone || "");
      setPaymentTerms(c.terms_payment || "");
    }

    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!customerId || !customerPoNumber || !salesName || !allocationType || !projectInstansi || !deliveryDeadline) {
      toast.error(language === "en" ? "Please fill all required fields" : "Harap isi semua field wajib");
      return;
    }
    if (allocationType !== "Sample" && !salesPulseReferenceNumber) {
      toast.error(
        language === "en"
          ? "SalesPulse Reference is required"
          : "Referensi SalesPulse wajib dipilih",
        {
          description:
            language === "en"
              ? "Please select a SalesPulse Reference No. on the form before saving the Sales Order."
              : "Silakan pilih No. Referensi SalesPulse pada form terlebih dahulu sebelum menyimpan Sales Order.",
          duration: 6000,
        },
      );
      return;
    }
    if (orderItems.length === 0) {
      toast.error(language === "en" ? "Please add at least one product" : "Tambahkan minimal satu produk");
      return;
    }

    // warn low stock
    for (const it of orderItems) {
      if (it.ordered_qty > it.stock_available) {
        toast.warning(
          language === "en"
            ? `Warning: ${it.product_name} insufficient stock (Available: ${it.stock_available})`
            : `Peringatan: ${it.product_name} stok tidak cukup (Tersedia: ${it.stock_available})`,
        );
      }
    }

    setIsSaving(true);

    try {
      // Validate customer_po_number against WMS Integration Guide v4 whitelist.
      // Allowed: A-Z a-z 0-9 space and - _ . / \ # ( ). No max length.
      const sanitizedCustomerPo = sanitizeCustomerPoNumber(customerPoNumber) ?? "";
      if (sanitizedCustomerPo !== customerPoNumber) {
        setCustomerPoNumber(sanitizedCustomerPo);
        toast.warning(
          language === "en"
            ? `Customer PO cleaned to "${sanitizedCustomerPo}" (only letters, numbers, space and - _ . / \\ # ( ) allowed)`
            : `PO Customer dibersihkan menjadi "${sanitizedCustomerPo}" (hanya huruf, angka, spasi dan - _ . / \\ # ( ) diizinkan)`,
        );
      }

      const payloadHeader = {
        sales_order_number: soNumber,
        order_date: orderDate,
        customer_id: customerId,
        customer_po_number: sanitizedCustomerPo,
        sales_pulse_reference_number: salesPulseReferenceNumber || null,
        sales_name: salesName,
        allocation_type: allocationType,
        project_instansi: projectInstansi,
        delivery_deadline: deliveryDeadline,
        ship_to_address: shipToAddress || null,
        notes: notes || null,
        po_document_url: poDocumentUrl || null,
        // @ts-ignore
        po_document_key: poDocumentKey || null,

        // ✅ total_amount sekarang = net subtotal (sesudah diskon item)
        total_amount: totals.netSubtotal,

        // ✅ discount header dipakai sebagai Total Discount (Rp)
        discount: totals.totalDiscount,

        tax_rate: 12,
        shipping_cost: clampNumber(safeNumber(shippingCost, 0), 0, 1_000_000_000_000),
        grand_total: totals.grandTotal,
      };

      const payloadItems = orderItems.map((it) => ({
        product_id: it.product_id,
        unit_price: it.unit_price,
        ordered_qty: it.ordered_qty,
        // DB: nominal Rp
        discount: it.discount_nominal,
      }));

      if (isEditMode && editingOrderId) {
        const result = await updateSalesOrder(editingOrderId, payloadHeader as any, payloadItems as any);
        if (!result.success) throw new Error(result.error || "Failed to update");
        toast.success(language === "en" ? "Sales Order updated successfully" : "Sales Order berhasil diupdate");
      } else {
        const result = await createSalesOrder(
          {
            ...(payloadHeader as any),
            status: "draft",
            created_by: user?.id || null,
            approved_by: null,
            approved_at: null,
          },
          payloadItems as any,
        );
        if (!result.success) throw new Error(result.error || "Failed to create");
        toast.success(language === "en" ? "Sales Order created successfully" : "Sales Order berhasil dibuat");
        // Send push notification to admin/super_admin
        notifyNewSalesOrder(soNumber, user?.id);
      }

      setIsDialogOpen(false);
      setIsEditMode(false);
      setEditingOrderId(null);
      resetForm();
      refetch();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : language === "en" ? "Failed to save" : "Gagal menyimpan");
    }

    setIsSaving(false);
  };

  const handleApprove = async () => {
    if (!selectedOrder) return;
    if (!canApprove) {
      toast.error(
        language === "en"
          ? "You do not have permission to approve orders"
          : "Anda tidak memiliki izin untuk menyetujui order",
      );
      return;
    }

    setIsApproving(true);
    const result = await approveSalesOrder(selectedOrder.id, approveReason.trim() || undefined);
    if (result.success) {
      toast.success(language === "en" ? "Sales Order approved" : "Sales Order disetujui");
      // Notify creator about approval
      if (selectedOrder.created_by) {
        const { notifyOrderApproved } = await import('@/lib/pushNotifications');
        notifyOrderApproved(selectedOrder.created_by, 'Sales Order', selectedOrder.sales_order_number);
      }
      refetch();
    } else {
      toast.error(result.error || "Failed to approve");
    }
    setIsApproving(false);
    setIsApproveDialogOpen(false);
    setApproveReason("");
    setSelectedOrder(null);
  };

  const handleCancel = async () => {
    if (!selectedOrder) return;
    setIsCancelling(true);
    const result = await cancelSalesOrder(selectedOrder.id);
    if (result.success) {
      toast.success(language === "en" ? "Sales Order cancelled" : "Sales Order dibatalkan");
      refetch();
    } else {
      toast.error(result.error || "Failed to cancel");
    }
    setIsCancelling(false);
    setIsCancelDialogOpen(false);
    setSelectedOrder(null);
  };

  const handleDelete = async () => {
    if (!selectedOrder) return;
    setIsDeleting(true);
    const result = await deleteSalesOrder(selectedOrder.id);
    if (result.success) {
      toast.success(language === "en" ? "Sales Order deleted" : "Sales Order dihapus");
      refetch();
    } else {
      toast.error(result.error || "Failed to delete");
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
      const result = await requestSalesOrderRevision(selectedOrder.id, revisionReason.trim());
      if (!result.success) throw new Error(result.error || "Failed");
      toast.success(language === "en" ? "Revision request submitted" : "Permintaan revisi terkirim");
      notifyRevisionRequest('Sales Order', selectedOrder.sales_order_number, user?.id);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to request revision");
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
      const result = await approveSalesOrderRevision(selectedOrder.id);
      if (!result.success) throw new Error(result.error || "Failed");
      toast.success(language === "en" ? "Revision approved, order returned to draft" : "Revisi disetujui, order kembali ke draft");
      if (selectedOrder.created_by) {
        const { notifyOrderApproved } = await import('@/lib/pushNotifications');
        notifyOrderApproved(selectedOrder.created_by, 'Sales Order', selectedOrder.sales_order_number);
      }
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve revision");
    }
    setIsApprovingRevision(false);
    setIsApproveRevisionDialogOpen(false);
    setSelectedOrder(null);
  };

  const handleRejectRevision = async () => {
    if (!selectedOrder) return;
    setIsRejectingRevision(true);
    try {
      const result = await rejectSalesOrderRevision(selectedOrder.id, rejectRevisionReason.trim() || undefined);
      if (!result.success) throw new Error(result.error || "Failed");
      toast.success(language === "en" ? "Revision rejected" : "Revisi ditolak");
      // Notify creator about rejection
      if (selectedOrder.created_by) {
        const { notifyOrderRejected } = await import('@/lib/pushNotifications');
        notifyOrderRejected(selectedOrder.created_by, 'Sales Order', selectedOrder.sales_order_number, rejectRevisionReason.trim());
      }
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject revision");
    }
    setIsRejectingRevision(false);
    setIsRejectRevisionDialogOpen(false);
    setRejectRevisionReason("");
    setSelectedOrder(null);
  };

  const handleViewDetail = async (order: SalesOrderHeader) => {
    setSelectedOrder(order);
    setIsDetailDialogOpen(true);
    setRevisionReasonDisplay(null);
    setApproveReasonDisplay(null);
    setPiDpInfo(null);

    // Fetch PI with DP + Termin info (if exists) for this SO
    try {
      const { data: piData } = await supabase
        .from('proforma_invoices')
        .select('pi_number, dp_percent, term_days, payment_note, grand_total')
        .eq('sales_order_id', order.id)
        .not('dp_percent', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);
      if (piData && piData.length > 0) {
        const pi = piData[0] as any;
        setPiDpInfo({
          pi_number: pi.pi_number,
          dp_percent: Number(pi.dp_percent) || 0,
          term_days: pi.term_days,
          payment_note: pi.payment_note,
          grand_total: Number(pi.grand_total) || 0,
        });
      }
    } catch (err) {
      console.error('Failed to fetch PI DP info:', err);
    }

    // Fetch approve reason if status is approved or beyond
    if (['approved', 'partially_delivered', 'delivered', 'fulfilled'].includes(order.status)) {
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

    // Fetch stock out history for this sales order
    setStockOutHistoryLoading(true);
    try {
      const { data: stockOuts, error } = await supabase
        .from("stock_out_headers")
        .select(
          `
          id,
          stock_out_number,
          delivery_date,
          notes,
          created_at,
          stock_out_items (
            id,
            qty_out,
            product:products (name, sku),
            batch:inventory_batches (batch_no)
          )
        `,
        )
        .eq("sales_order_id", order.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setStockOutHistory(stockOuts || []);
    } catch (err) {
      console.error("Failed to fetch stock out history:", err);
      setStockOutHistory([]);
    } finally {
      setStockOutHistoryLoading(false);
    }
  };

  // Auto-open detail dialog from URL query param ?id=<salesOrderId>
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || salesOrders.length === 0) return;
    const order = salesOrders.find((o) => o.id === id);
    if (order) {
      handleViewDetail(order);
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, salesOrders]);

  // === PDF ===
  const handlePreviewPDF = () => {
    if (!selectedOrder) return;
    setIsPdfPreviewOpen(true);
  };

  const handleDownloadPDF = () => {
    if (!selectedOrder || !printRef.current) return;
    // Use browser's native print-to-PDF functionality for security
    securePrint({
      title: `SalesOrder_${selectedOrder.sales_order_number}`,
      styles: printStyles.salesOrder,
      content: printRef.current.innerHTML,
    });
    toast.info(
      language === "en"
        ? "Use 'Save as PDF' in print dialog to download (enable Background graphics to keep the green header)"
        : "Gunakan 'Simpan sebagai PDF' di dialog cetak untuk mengunduh (aktifkan Background graphics agar header hijau ikut tercetak)",
    );
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
      const filename = `SalesOrder_${selectedOrder.sales_order_number.replace(/[^a-zA-Z0-9.-]/g, "_")}.pdf`;

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

  // === INIT: when dialog opened create number ===
  useEffect(() => {
    if (isDialogOpen && !isEditMode) {
      if (!soNumber) generateSoNumber();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDialogOpen]);

  // ===== RENDER =====
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t("menu.salesOrder")}</h1>
          <p className="text-muted-foreground">
            {t("menu.salesOrderSub")} - {language === "en" ? "Manage customer orders" : "Kelola pesanan customer"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={filteredOrders}
            filters={{ status: statusFilter, dateFrom, dateTo }}
          />
          {canCreate("sales_order") && (
            <Button onClick={handleOpenDialog}>
              <Plus className="w-4 h-4 mr-2" />
              {language === "en" ? "Create Sales Order" : "Buat Sales Order"}
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
                    ? "Search by SO number, customer, or PO..."
                    : "Cari berdasarkan No. SO, customer, atau PO..."
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
                <SelectItem value="partially_delivered">
                  {language === "en" ? "Partially Delivered" : "Terkirim Sebagian"}
                </SelectItem>
                <SelectItem value="delivered">{language === "en" ? "Delivered" : "Terkirim"}</SelectItem>
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
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === "en" ? "SO Number" : "No. SO"}</TableHead>
                  <TableHead>{language === "en" ? "Date" : "Tanggal"}</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>{language === "en" ? "Customer PO" : "PO Customer"}</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>{language === "en" ? "Allocation" : "Alokasi"}</TableHead>
                  <TableHead className="text-right">{language === "en" ? "Amount" : "Jumlah"}</TableHead>
                  <TableHead className="text-center">{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      {language === "en" ? "No sales orders found" : "Tidak ada sales order ditemukan"}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedOrders.map((order) => {
                    const status = statusConfig[order.status] || statusConfig.draft;
                    // RBAC: Check permissions AND status
                    const showApprove = order.status === "draft" && canApprove;
                    const showCancel =
                      (order.status === "draft" || order.status === "approved") && canCancel("sales_order");
                    const showEdit = order.status === "draft" && canEdit("sales_order");
                    const showDelete = order.status === "draft" && canDelete("sales_order");
                    const showRequestRevision = order.status === "approved";
                    const showApproveRevision = order.status === "revision_requested" && isAdminOrAbove();
                    const showRejectRevision = order.status === "revision_requested" && isAdminOrAbove();

                    return (
                      <TableRow 
                        key={order.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleViewDetail(order)}
                      >
                        <TableCell className="font-medium">{order.sales_order_number}</TableCell>
                        <TableCell>{formatDateID(order.order_date)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.customer?.name || "-"}</p>
                            <p className="text-xs text-muted-foreground">{order.project_instansi}</p>
                          </div>
                        </TableCell>
                        <TableCell>{order.customer_po_number}</TableCell>
                        <TableCell>{order.sales_name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{order.allocation_type}</Badge>
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

                              {order.po_document_url && (
                                <DropdownMenuItem onClick={() => openDocument(order)} disabled={isOpeningPoDoc}>
                                  <FileText className="w-4 h-4 mr-2" />
                                  {language === "en" ? "View Document" : "Lihat Dokumen"}
                                </DropdownMenuItem>
                              )}

                              {showEdit && (
                                <DropdownMenuItem onClick={() => handleEdit(order)}>
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
                                <DropdownMenuItem className="text-warning" onClick={() => { setSelectedOrder(order); setRevisionReason(""); setIsRevisionDialogOpen(true); }}>
                                  <RotateCcw className="w-4 h-4 mr-2" />
                                  {language === "en" ? "Request Revision" : "Minta Revisi"}
                                </DropdownMenuItem>
                              )}

                              {showApproveRevision && (
                                <DropdownMenuItem className="text-success" onClick={() => { setSelectedOrder(order); setIsApproveRevisionDialogOpen(true); }}>
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  {language === "en" ? "Approve Revision" : "Setujui Revisi"}
                                </DropdownMenuItem>
                              )}

                              {showRejectRevision && (
                                <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedOrder(order); setRejectRevisionReason(""); setIsRejectRevisionDialogOpen(true); }}>
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

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditMode
                ? language === "en"
                  ? "Edit Sales Order"
                  : "Edit Sales Order"
                : language === "en"
                  ? "Create Sales Order"
                  : "Buat Sales Order"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Header Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{language === "en" ? "SO Number" : "No. SO"} *</Label>
                <Input value={soNumber} disabled={!isEditMode} className={!isEditMode ? "bg-muted font-mono" : ""} />
              </div>

              <div className="space-y-2">
                <Label>{language === "en" ? "Order Date" : "Tanggal Order"} *</Label>
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Customer *</Label>
                <SearchableSelect
                  value={customerId}
                  onValueChange={handleCustomerChange}
                  options={customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                    description: c.code,
                  }))}
                  placeholder={language === "en" ? "Select customer" : "Pilih customer"}
                  searchPlaceholder={language === "en" ? "Search customer..." : "Cari customer..."}
                  emptyMessage={language === "en" ? "No customer found" : "Customer tidak ditemukan"}
                />
              </div>

              <div className="space-y-2">
                <Label>{language === "en" ? "Customer PO Number" : "No. PO Customer"} *</Label>
                <Input
                  placeholder="e.g., PO-Cust-001"
                  value={customerPoNumber}
                  onChange={(e) => setCustomerPoNumber(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2 md:col-span-2">
                 <Label>
                   {language === "en" ? "SalesPulse Reference No." : "No. Referensi SalesPulse"}
                   {allocationType !== "Sample" && " *"}
                   {allocationType === "Sample" && (
                     <span className="ml-1 text-xs text-muted-foreground">
                       ({language === "en" ? "optional for Sample" : "opsional untuk Sample"})
                     </span>
                   )}
                 </Label>
                <SearchableSelect
                  value={salesPulseReferenceNumber}
                  onValueChange={setSalesPulseReferenceNumber}
                  onSearchChange={setSalesPulseSearchQuery}
                  options={salesPulseOptions.map((reference) => ({
                    value: reference.reference_number,
                    label: reference.reference_number,
                    description: [reference.customer_name, reference.deal_name].filter(Boolean).join(' • '),
                  }))}
                  placeholder={
                    isSalesPulseLoading
                      ? (language === "en" ? "Loading references..." : "Memuat referensi...")
                      : (language === "en" ? "Select SalesPulse reference" : "Pilih referensi SalesPulse")
                  }
                  searchPlaceholder={language === "en" ? "Search reference..." : "Cari referensi..."}
                  emptyMessage={language === "en" ? "No reference found" : "Referensi tidak ditemukan"}
                  disabled={isSalesPulseLoading}
                />
              </div>
            </div>

            {/* Header Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{language === "en" ? "Sales Name" : "Nama Sales"} *</Label>
                <SearchableSelect
                  value={salesName}
                  onValueChange={setSalesName}
                  options={salesUsers.map((u) => ({
                    value: u.full_name,
                    label: u.full_name,
                    description: u.email,
                  }))}
                  placeholder={language === "en" ? "Select sales..." : "Pilih sales..."}
                  searchPlaceholder={language === "en" ? "Search sales..." : "Cari sales..."}
                  emptyMessage={language === "en" ? "No sales found" : "Sales tidak ditemukan"}
                />
              </div>

              <div className="space-y-2">
                <Label>{language === "en" ? "Allocation Type" : "Tipe Alokasi"} *</Label>
                <Select value={allocationType} onValueChange={(v) => setAllocationType(v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === "en" ? "Select type" : "Pilih tipe"} />
                  </SelectTrigger>
                  <SelectContent>
                    {allocationTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{language === "en" ? "Project/Instansi" : "Proyek/Instansi"} *</Label>
                <Input value={projectInstansi} onChange={(e) => setProjectInstansi(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>{language === "en" ? "Delivery Deadline" : "Batas Pengiriman"} *</Label>
                <Input type="date" value={deliveryDeadline} onChange={(e) => setDeliveryDeadline(e.target.value)} />
              </div>
            </div>

            {/* Auto-filled */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>PIC</Label>
                <Input value={customerPic} onChange={(e) => setCustomerPic(e.target.value)} className="bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label>{language === "en" ? "Phone" : "Telepon"}</Label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <Label>{language === "en" ? "Payment Terms" : "Termin Pembayaran"}</Label>
                <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="bg-muted/50" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === "en" ? "Ship To Address" : "Alamat Pengiriman"}</Label>
                <Textarea value={shipToAddress} onChange={(e) => setShipToAddress(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>{language === "en" ? "Notes" : "Catatan"}</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>

            {/* PO Document */}
            <div className="space-y-2">
              <Label>{language === "en" ? "PO Document" : "Dokumen PO"}</Label>
              <div className="flex gap-2">
                <Input
                  value={poDocumentUrl ? poDocumentUrl.split("?")[0].split("/").pop() || "" : ""}
                  disabled
                  placeholder={language === "en" ? "Upload PO document" : "Upload dokumen PO"}
                  className="bg-muted flex-1"
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </Button>
                {poDocumentUrl && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setPoDocumentUrl("");
                      setPoDocumentKey("");
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {language === "en"
                  ? "Tip: keep the file path (po_document_key) for reliable open."
                  : "Tip: simpan path (po_document_key) agar fitur View Document selalu berhasil."}
              </p>
            </div>

            {/* Items */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{language === "en" ? "Order Items" : "Item Pesanan"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-4">
                  <SearchableSelect
                    value={selectedProductId}
                    onValueChange={setSelectedProductId}
                    options={products
                      .filter((p) => p.is_active)
                      .map((p) => ({
                        value: p.id,
                        label: `${p.name} (${p.sku || "-"})`,
                        description: p.category?.name || undefined,
                      }))}
                    placeholder={language === "en" ? "Select product to add" : "Pilih produk untuk ditambahkan"}
                    searchPlaceholder={language === "en" ? "Search product..." : "Cari produk..."}
                    emptyMessage={language === "en" ? "No product found" : "Produk tidak ditemukan"}
                    triggerClassName="flex-1"
                  />
                  <Button onClick={handleAddProduct} disabled={!selectedProductId}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t("common.add")}
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "en" ? "Product" : "Produk"}</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>{language === "en" ? "Unit" : "Satuan"}</TableHead>
                      <TableHead className="text-center">{language === "en" ? "Stock" : "Stok"}</TableHead>
                      <TableHead className="text-right">{language === "en" ? "Unit Price" : "Harga"}</TableHead>
                      <TableHead className="text-center">Qty</TableHead>

                      {/* ✅ hanya % input */}
                      <TableHead className="text-right">
                        {language === "en" ? "Line Discount (%)" : "Diskon Item (%)"}
                      </TableHead>

                      {/* (opsional tampil) */}
                      <TableHead className="text-right">{language === "en" ? "Disc (Rp)" : "Diskon (Rp)"}</TableHead>

                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {orderItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          {language === "en" ? "No products added" : "Belum ada produk ditambahkan"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      orderItems.map((it, index) => (
                        <TableRow key={it.product_id}>
                          <TableCell className="font-medium">{it.product_name}</TableCell>
                          <TableCell>{it.sku}</TableCell>
                          <TableCell>{it.unit}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={it.stock_available >= it.ordered_qty ? "success" : "pending"}>
                              {it.stock_available}
                            </Badge>
                            {it.stock_available < it.ordered_qty && (
                              <AlertTriangle className="w-4 h-4 text-warning inline ml-1" />
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              value={it.unit_price}
                              onChange={(e) => handleItemChange(index, "unit_price", safeNumber(e.target.value, 0))}
                              className="w-28 text-right"
                            />
                          </TableCell>

                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              value={it.ordered_qty}
                              onChange={(e) => handleItemChange(index, "ordered_qty", safeNumber(e.target.value, 1))}
                              className="w-20 text-center"
                            />
                          </TableCell>

                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={it.discount_pct}
                              onChange={(e) => handleItemChange(index, "discount_pct", safeNumber(e.target.value, 0))}
                              className="w-28 text-right"
                            />
                          </TableCell>

                          <TableCell className="text-right font-medium text-destructive">
                            -{formatCurrency(it.discount_nominal)}
                          </TableCell>

                          <TableCell className="text-right font-medium">{formatCurrency(it.subtotal)}</TableCell>

                          <TableCell>
                            <Button variant="ghost" size="iconSm" onClick={() => handleRemoveItem(index)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                <p className="text-xs text-muted-foreground mt-3">
                  {language === "en"
                    ? "Discount is per item line (%). System automatically calculates discount (Rp) and subtotal."
                    : "Diskon hanya per item (%). Sistem otomatis menghitung diskon (Rp) dan subtotal."}
                </p>
              </CardContent>
            </Card>

            {/* Totals (NO header discount input) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{language === "en" ? "Shipping Cost" : "Biaya Pengiriman"}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={shippingCost}
                    onChange={(e) => setShippingCost(safeNumber(e.target.value, 0))}
                  />
                </div>
              </div>

              <Card className="bg-muted/50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {language === "en" ? "Subtotal (Gross)" : "Subtotal (Kotor)"}
                    </span>
                    <span className="font-medium">{formatCurrency(totals.grossSubtotal)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">DPP</span>
                    <span className="font-medium">{formatCurrency(totals.dpp)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">DPP Pengganti</span>
                    <span className="font-medium">{formatCurrency(totals.dppPengganti)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pajak</span>
                    <span className="font-medium">{formatCurrency(totals.tax)}</span>
                  </div>

                  <div className="border-t pt-2 flex justify-between">
                    <span className="font-semibold">Subtotal</span>
                    <span className="font-semibold">{formatCurrency(totals.dpp + totals.tax)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Biaya Pengantaran</span>
                    <span className="font-medium">{formatCurrency(totals.ship)}</span>
                  </div>

                  <div className="border-t-2 border-foreground pt-2 flex justify-between">
                    <span className="font-bold text-lg">Grand Total</span>
                    <span className="font-bold text-lg">{formatCurrency(totals.grandTotal)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                setIsEditMode(false);
                setEditingOrderId(null);
                resetForm();
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditMode
                ? language === "en"
                  ? "Update Order"
                  : "Update Order"
                : language === "en"
                  ? "Save as Draft"
                  : "Simpan Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <AlertDialog open={isApproveDialogOpen} onOpenChange={(open) => { setIsApproveDialogOpen(open); if (!open) setApproveReason(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === "en" ? "Approve Sales Order" : "Setujui Sales Order"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? `Are you sure you want to approve "${selectedOrder?.sales_order_number}"?`
                : `Apakah Anda yakin ingin menyetujui "${selectedOrder?.sales_order_number}"?`}
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
      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === "en" ? "Cancel Sales Order" : "Batalkan Sales Order"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? `Are you sure you want to cancel "${selectedOrder?.sales_order_number}"?`
                : `Apakah Anda yakin ingin membatalkan "${selectedOrder?.sales_order_number}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
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
            <AlertDialogTitle>{language === "en" ? "Delete Sales Order" : "Hapus Sales Order"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? `Are you sure you want to delete "${selectedOrder?.sales_order_number}"?`
                : `Apakah Anda yakin ingin menghapus "${selectedOrder?.sales_order_number}"?`}
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
                ? `Request revision for "${selectedOrder?.sales_order_number}". Please provide a reason.`
                : `Ajukan revisi untuk "${selectedOrder?.sales_order_number}". Harap berikan alasan.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{language === "en" ? "Revision Reason" : "Alasan Revisi"} *</Label>
              <Textarea value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)} placeholder={language === "en" ? "Explain why this order needs revision..." : "Jelaskan mengapa order ini perlu direvisi..."} rows={3} />
              <div className="flex items-center justify-between">
                <p className={`text-xs ${revisionReason.trim().length < 20 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {revisionReason.trim().length}/20 {language === "en" ? "min characters" : "karakter minimum"}
                </p>
                {revisionReason.trim().length >= 20 && <span className="text-xs text-green-600">✓</span>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRevisionDialogOpen(false)} disabled={isRequestingRevision}>{t("common.cancel")}</Button>
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
                ? `Approving will return "${selectedOrder?.sales_order_number}" to draft status so it can be edited. Continue?`
                : `Menyetujui akan mengembalikan "${selectedOrder?.sales_order_number}" ke status draft sehingga bisa diedit. Lanjutkan?`}
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
                ? `Rejecting will return "${selectedOrder?.sales_order_number}" back to approved status.`
                : `Menolak akan mengembalikan "${selectedOrder?.sales_order_number}" ke status approved.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{language === "en" ? "Rejection Reason" : "Alasan Penolakan"} *</Label>
              <Textarea value={rejectRevisionReason} onChange={(e) => setRejectRevisionReason(e.target.value)} placeholder={language === "en" ? "Explain why the revision is rejected..." : "Jelaskan mengapa revisi ditolak..."} rows={3} />
              <div className="flex items-center justify-between">
                <p className={`text-xs ${rejectRevisionReason.trim().length < 20 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {rejectRevisionReason.trim().length}/20 {language === "en" ? "min characters" : "karakter minimum"}
                </p>
                {rejectRevisionReason.trim().length >= 20 && <span className="text-xs text-green-600">✓</span>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectRevisionDialogOpen(false)} disabled={isRejectingRevision}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={handleRejectRevision} disabled={isRejectingRevision || rejectRevisionReason.trim().length < 20}>
              {isRejectingRevision && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === "en" ? "Reject Revision" : "Tolak Revisi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{language === "en" ? "Sales Order Details" : "Detail Sales Order"}</DialogTitle>
              <div className="flex gap-2">
                {selectedOrder?.po_document_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectedOrder && openDocument(selectedOrder)}
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
                <Button variant="outline" size="sm" onClick={() => setIsPdfPreviewOpen(true)} disabled={itemsLoading}>
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
                      title: `Sales Order - ${selectedOrder.sales_order_number}`,
                      styles: printStyles.salesOrder,
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "SO Number" : "No. SO"}</p>
                  <p className="font-medium">{selectedOrder.sales_order_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "Date" : "Tanggal"}</p>
                  <p className="font-medium">{formatDateID(selectedOrder.order_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedOrder.customer?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "Customer PO" : "PO Customer"}</p>
                  <p className="font-medium">{selectedOrder.customer_po_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "SalesPulse Reference" : "Referensi SalesPulse"}</p>
                  <p className="font-medium">{selectedOrder.sales_pulse_reference_number || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sales</p>
                  <p className="font-medium">{selectedOrder.sales_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === "en" ? "Delivery Deadline" : "Batas Pengiriman"}
                  </p>
                  <p className="font-medium">{formatDateID(selectedOrder.delivery_deadline)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("common.status")}</p>
                  <Badge variant={statusConfig[selectedOrder.status]?.variant || "draft"}>
                    {language === "en"
                      ? statusConfig[selectedOrder.status]?.label
                      : statusConfig[selectedOrder.status]?.labelId}
                  </Badge>
                </div>
                <div>
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

              {/* DP + Termin Payment Breakdown (read-only, from PI) */}
              {piDpInfo && (() => {
                const dpAmount = (piDpInfo.grand_total * piDpInfo.dp_percent) / 100;
                const remaining = piDpInfo.grand_total - dpAmount;
                return (
                  <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-primary font-semibold">
                      <FileText className="w-4 h-4" />
                      {language === "en" ? "Down Payment & Term" : "Down Payment & Termin"}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({language === "en" ? "from PI" : "dari PI"} {piDpInfo.pi_number})
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">DP ({piDpInfo.dp_percent}%)</p>
                        <p className="font-semibold">{formatCurrency(dpAmount)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{language === "en" ? "Remaining Balance" : "Sisa Pembayaran"}</p>
                        <p className="font-semibold">{formatCurrency(remaining)}</p>
                      </div>
                    </div>
                    {piDpInfo.payment_note && (
                      <p className="text-xs text-muted-foreground pt-1 border-t border-primary/20">
                        {piDpInfo.payment_note}
                      </p>
                    )}
                  </div>
                );
              })()}

              <div>
                <h4 className="font-semibold mb-3">{language === "en" ? "Order Items" : "Item Pesanan"}</h4>
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
                        <TableHead>{language === "en" ? "Category" : "Kategori"}</TableHead>
                        <TableHead>{language === "en" ? "Unit" : "Satuan"}</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">{language === "en" ? "Price" : "Harga"}</TableHead>
                        <TableHead className="text-right">{language === "en" ? "Disc (Rp)" : "Diskon (Rp)"}</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrderItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-4 text-muted-foreground">
                            {language === "en" ? "No items found" : "Tidak ada item"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedOrderItems.map((item: any, index: number) => {
                          const qty = safeNumber(item.ordered_qty, 0);
                          const price = safeNumber(item.unit_price, 0);
                          const gross = qty * price;
                          const discNominal = safeNumber(item.discount, 0);
                          const lineSubtotal = gross - discNominal;

                          return (
                            <TableRow key={item.id}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell className="font-medium">{item.product?.name}</TableCell>
                              <TableCell>{item.product?.sku || "-"}</TableCell>
                              <TableCell>{item.product?.category?.name || "-"}</TableCell>
                              <TableCell>{item.product?.unit?.name || "-"}</TableCell>
                              <TableCell className="text-center">{qty}</TableCell>
                              <TableCell className="text-right">{formatCurrency(price)}</TableCell>
                              <TableCell className="text-right">-{formatCurrency(discNominal)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(lineSubtotal)}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>

              {(selectedOrder.status === "approved" ||
                selectedOrder.status === "partially_delivered" ||
                selectedOrder.status === "delivered") && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    {language === "en" ? "Stock Out History" : "Riwayat Stock Out"}
                  </h4>
                  {stockOutHistoryLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : stockOutHistory.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      {language === "en" ? "No stock out records yet" : "Belum ada riwayat stock out"}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {stockOutHistory.map((so: any) => (
                        <Card key={so.id} className="border">
                          <CardHeader className="py-3 px-4">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-semibold text-sm">{so.stock_out_number}</p>
                                <p className="text-xs text-muted-foreground">{formatDateID(so.delivery_date)}</p>
                              </div>
                              <Badge variant="success">
                                {so.stock_out_items?.reduce((sum: number, item: any) => sum + (item.qty_out || 0), 0)}{" "}
                                {language === "en" ? "items delivered" : "item terkirim"}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="py-2 px-4">
                            <div className="text-xs space-y-1">
                              {so.stock_out_items?.map((item: any, idx: number) => (
                                <div key={item.id || idx} className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    {item.product?.name || "-"} ({item.batch?.batch_no || "-"})
                                  </span>
                                  <span className="font-medium">{item.qty_out}</span>
                                </div>
                              ))}
                            </div>
                            {so.notes && (
                              <p className="text-xs text-muted-foreground mt-2 italic">
                                {language === "en" ? "Notes" : "Catatan"}: {so.notes}
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
            {selectedOrder?.status === "approved" && (
              <Button variant="outline" className="border-warning text-warning hover:bg-warning/10" onClick={() => { setRevisionReason(""); setIsRevisionDialogOpen(true); }}>
                <RotateCcw className="w-4 h-4 mr-2" />
                {language === "en" ? "Request Revision" : "Minta Revisi"}
              </Button>
            )}
            {selectedOrder?.status === "revision_requested" && isAdminOrAbove() && (
              <>
                <Button variant="outline" className="border-success text-success hover:bg-success/10" onClick={() => setIsApproveRevisionDialogOpen(true)}>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {language === "en" ? "Approve Revision" : "Setujui Revisi"}
                </Button>
                <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" onClick={() => { setRejectRevisionReason(""); setIsRejectRevisionDialogOpen(true); }}>
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

      {/* Hidden Print Content */}
      <div className="hidden">
        <div ref={printRef}>
          {selectedOrder && (
            <div data-pdf-root style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#111" }}>
              {/* ===== Header section wrapped as one block to prevent overlap ===== */}
              <div data-pdf-section>
                {/* Top: Logo + Right Title block */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", minHeight: "70px" }}>
                  <div>
                    <img 
                      src={`${window.location.origin}/logo-kemika.png`} 
                      crossOrigin="anonymous"
                      alt="Kemika" 
                      style={{ height: "42px", objectFit: "contain" }} 
                    />
                  </div>

                  <div style={{ textAlign: "right", minWidth: "300px" }}>
                    <div style={{ fontSize: "20px", fontWeight: 700, letterSpacing: 0.5 }}>SALES ORDER</div>
                    <div style={{ height: "6px" }} />
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px 10px 1fr",
                        gap: "6px",
                        justifyContent: "end",
                      }}
                    >
                      <div style={{ textAlign: "left", fontSize: "11px" }}>Sales Order No.</div>
                      <div>:</div>
                      <div style={{ fontWeight: 700 }}>{selectedOrder.sales_order_number}</div>

                      <div style={{ textAlign: "left", fontSize: "11px" }}>SO Date</div>
                      <div>:</div>
                      <div style={{ fontWeight: 700 }}>{formatDateID(selectedOrder.order_date)}</div>
                    </div>
                  </div>
                </div>

                {/* Separator */}
                <div style={{ marginTop: "8px", borderTop: "2px solid #111" }} />

                {/* Allocation row */}
                <div style={{ marginTop: "6px" }}>
                  <span style={{ fontSize: "11px" }}>TIPE ALOKASI : </span>
                  <span style={{ color: "#b91c1c", fontWeight: 700 }}>
                    {String(selectedOrder.allocation_type || "").toUpperCase()}
                  </span>
                </div>

                {/* Info rows */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "10px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", rowGap: "8px", columnGap: "10px" }}>
                    <div style={{ color: "#333" }}>SALES</div>
                    <div style={{ fontWeight: 700 }}>{selectedOrder.sales_name}</div>

                    <div style={{ color: "#333" }}>CUSTOMER</div>
                    <div style={{ fontWeight: 700 }}>{selectedOrder.customer?.name || "-"}</div>

                    <div style={{ color: "#333" }}>PIC</div>
                    <div style={{ fontWeight: 700 }}>{selectedOrder.customer?.pic || "-"}</div>

                    <div style={{ color: "#333" }}>PHONE</div>
                    <div style={{ fontWeight: 700 }}>{selectedOrder.customer?.phone || "-"}</div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", rowGap: "8px", columnGap: "10px" }}>
                    <div style={{ color: "#333" }}>TANGGAL</div>
                    <div style={{ fontWeight: 700 }}>{formatDateID(selectedOrder.order_date)}</div>

                    <div style={{ color: "#333" }}>PO CUSTOMER</div>
                    <div style={{ fontWeight: 700 }}>{selectedOrder.customer_po_number}</div>

                    <div style={{ color: "#333" }}>BATAS PENGIRIMAN</div>
                    <div style={{ fontWeight: 700 }}>{formatDateID(selectedOrder.delivery_deadline)}</div>

                    <div style={{ color: "#333" }}>PAYMENT TERMS</div>
                    <div style={{ fontWeight: 700, color: "#b91c1c" }}>
                      {(selectedOrder.customer?.terms_payment || "-").toString().toUpperCase()}
                    </div>

                    <div style={{ color: "#333" }}>PROJECT / INSTANSI</div>
                    <div style={{ fontWeight: 700 }}>{selectedOrder.project_instansi || "-"}</div>
                  </div>
                </div>
              </div>

              {/* ✅ Items table PDF includes discount */}
              <div data-pdf-section style={{ marginTop: "12px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", border: "2px solid #111" }}>
                  <thead>
                    <tr style={{ background: "#0b6b3a", color: "white" }}>
                      {[
                        "No",
                        "Nama Barang",
                        "SKU",
                        "Kategori",
                        "Satuan",
                        "Qty",
                        "Harga",
                        "Disc (%)",
                        "Disc (Rp)",
                        "Subtotal",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            // Force background on cell level for print reliability
                            background: "#0b6b3a",
                            color: "white",
                            border: "1px solid #111",
                            padding: "8px",
                            fontSize: "11px",
                            textAlign:
                              h === "Harga" || h === "Subtotal" || h === "Disc (%)" || h === "Disc (Rp)"
                                ? "right"
                                : h === "Qty" || h === "No"
                                  ? "center"
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
                    {selectedOrderItems?.map((it: any, idx: number) => {
                      const qty = safeNumber(it.ordered_qty, 0);
                      const price = safeNumber(it.unit_price, 0);
                      const gross = qty * price;
                      const discNominal = clampNumber(safeNumber(it.discount, 0), 0, gross);
                      const discPct = gross > 0 ? Math.round((discNominal / gross) * 10000) / 100 : 0;
                      const lineSubtotal = gross - discNominal;

                      return (
                        <tr key={it.id}>
                          <td style={{ border: "1px solid #111", padding: "8px", textAlign: "center" }}>{idx + 1}</td>
                          <td style={{ border: "1px solid #111", padding: "8px" }}>{it.product?.name || "-"}</td>
                          <td style={{ border: "1px solid #111", padding: "8px" }}>{it.product?.sku || "-"}</td>
                          <td style={{ border: "1px solid #111", padding: "8px" }}>
                            {it.product?.category?.name || "-"}
                          </td>
                          <td style={{ border: "1px solid #111", padding: "8px" }}>{it.product?.unit?.name || "-"}</td>
                          <td style={{ border: "1px solid #111", padding: "8px", textAlign: "center" }}>{qty}</td>
                          <td style={{ border: "1px solid #111", padding: "8px", textAlign: "right" }}>
                            {formatCurrency(price)}
                          </td>
                          <td style={{ border: "1px solid #111", padding: "8px", textAlign: "right" }}>{discPct}%</td>
                          <td style={{ border: "1px solid #111", padding: "8px", textAlign: "right" }}>
                            -{formatCurrency(discNominal)}
                          </td>
                          <td style={{ border: "1px solid #111", padding: "8px", textAlign: "right" }}>
                            {formatCurrency(lineSubtotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totals area PDF */}
              <div data-pdf-section style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 260px", gap: "10px" }}>
                <div />
                <div style={{ borderTop: "1px solid #111", paddingTop: "8px" }}>
                  {(() => {
                    const grossSubtotal = (selectedOrderItems || []).reduce((sum: number, it: any) => {
                      const qty = safeNumber(it.ordered_qty, 0);
                      const price = safeNumber(it.unit_price, 0);
                      return sum + qty * price;
                    }, 0);

                    const totalDiscount = safeNumber(selectedOrder.discount, 0);
                    const dpp = grossSubtotal - totalDiscount;
                    const dppPengganti = Math.round(dpp * 11 / 12);
                    const tax = Math.round(dppPengganti * 12 / 100);
                    const ship = safeNumber(selectedOrder.shipping_cost, 0);
                    const grandTotal = dpp + tax + ship;

                    return (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span>DPP</span>
                          <b>{formatCurrency(dpp)}</b>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span>DPP Pengganti</span>
                          <b>{formatCurrency(dppPengganti)}</b>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span>Pajak</span>
                          <b>{formatCurrency(tax)}</b>
                        </div>

                        <div style={{ borderTop: "1px solid #888", marginTop: "4px", paddingTop: "6px", display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span style={{ fontWeight: 700 }}>Subtotal</span>
                          <span style={{ fontWeight: 700 }}>{formatCurrency(dpp + tax)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span>Biaya Pengantaran</span>
                          <b>{formatCurrency(ship)}</b>
                        </div>

                        <div
                          style={{
                            borderTop: "2px solid #111",
                            borderBottom: "2px solid #111",
                            marginTop: "4px",
                            paddingTop: "6px",
                            paddingBottom: "6px",
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span style={{ fontSize: "13px", fontWeight: 700 }}>Grand Total</span>
                          <span style={{ fontSize: "13px", fontWeight: 700 }}>
                            {formatCurrency(grandTotal)}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Address + Notes */}
              <div data-pdf-section style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0px" }}>
                <div style={{ border: "1px solid #111", padding: "10px", minHeight: "70px" }}>
                  <div style={{ fontWeight: 700, fontSize: "10px", marginBottom: "6px", color: "#333" }}>
                    SHIP TO ADDRESS/ALAMAT PENGIRIMAN:
                  </div>
                  <div style={{ fontSize: "10px" }}>{selectedOrder.ship_to_address || "-"}</div>
                </div>
                <div style={{ border: "1px solid #111", borderLeft: "0px", padding: "10px", minHeight: "70px" }}>
                  <div style={{ fontWeight: 700, fontSize: "10px", marginBottom: "6px", color: "#333" }}>CATATAN :</div>
                  <div style={{ fontSize: "10px" }}>{selectedOrder.notes || "-"}</div>
                </div>
              </div>

{/* Signature area: Always 3 columns (Sales, Finance, Approve) - FIXED ALIGN */}
<div data-pdf-section style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0px" }}>
  {/* Helper style (inline) */}
  {(() => {
    const cellBase: React.CSSProperties = {
      border: "1px solid #111",
      padding: "10px",
      minHeight: "140px",
      display: "flex",
      flexDirection: "column",
    };

    const cellWithNoLeft: React.CSSProperties = { ...cellBase, borderLeft: "0px" };

    const headerStyle: React.CSSProperties = {
      textAlign: "right",
      fontSize: "9px",
      marginBottom: "6px",
      color: "#444",
      lineHeight: 1.2,
      minHeight: "14px",
    };

    const metaRow: React.CSSProperties = {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "6px",
      minHeight: "14px",
    };

    const leftRoleStyle: React.CSSProperties = { fontSize: "10px", color: "#666" };
    const rightDateStyle: React.CSSProperties = { fontSize: "9px", color: "#666", textAlign: "right" };

    const signArea: React.CSSProperties = {
      flex: 1, // ✅ bikin ruang tanda tangan konsisten
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "56px",
    };

    const lineStyle: React.CSSProperties = {
      borderBottom: "1px solid #111",
      height: "1px",
      marginTop: "6px",
    };

    const nameStyle: React.CSSProperties = {
      fontSize: "10px",
      marginTop: "6px",
      textAlign: "center",
      fontWeight: 700,
      color: "#111",
      minHeight: "14px",
    };

    const placeholderNameStyle: React.CSSProperties = {
      ...nameStyle,
      fontWeight: 400,
      color: "#666",
    };

    return (
      <>
        {/* 1) Sales */}
        <div style={cellBase}>
          {(() => {
            const creator = (selectedOrder as any)?.creator;
            const creatorSignatureUrl = creator?.signature_url;
            const creatorName = creator?.full_name || user?.name || "-";
            const createdAt = selectedOrder?.created_at ? new Date(selectedOrder.created_at as string) : null;

            return (
              <>
                <div style={headerStyle}>
                  Ditandatangani oleh <span style={{ fontWeight: 700 }}>{creatorName}</span>
                </div>

                <div style={metaRow}>
                  <div style={leftRoleStyle}>Sales,</div>
                  <div style={rightDateStyle}>{createdAt ? `Pada ${formatDateTimeID(createdAt)}` : "-"}</div>
                </div>

                <div style={signArea}>
                  {creatorSignatureUrl ? (
                    <img
                      src={creatorSignatureUrl}
                      crossOrigin="anonymous"
                      alt="Sales Signature"
                      style={{ height: "52px", maxWidth: "140px", objectFit: "contain" }}
                    />
                  ) : null}
                </div>

                <div style={lineStyle} />
                <div style={creatorSignatureUrl ? nameStyle : placeholderNameStyle}>
                  {creatorSignatureUrl ? creatorName : "(.................................)"}
                </div>
              </>
            );
          })()}
        </div>

        {/* 2) Finance */}
        <div style={cellWithNoLeft}>
          {(() => {
            return (
              <>
                <div style={headerStyle}>
                  Ditandatangani oleh <span style={{ fontWeight: 700 }}>-</span>
                </div>

                <div style={metaRow}>
                  <div style={leftRoleStyle}>Finance,</div>
                  <div style={rightDateStyle}>-</div>
                </div>

                <div style={signArea} />

                <div style={lineStyle} />
                <div style={placeholderNameStyle}>(.................................)</div>
              </>
            );
          })()}
        </div>

        {/* 3) Approve */}
        <div style={cellWithNoLeft}>
          {(() => {
            const approver = (selectedOrder as any)?.approver;
            const signatureUrl = approver?.signature_url;
            const approverName = approver?.full_name || "-";
            const isApproved = !!selectedOrder.approved_by && !!selectedOrder.approved_at;
            const approvedAt = isApproved ? new Date(selectedOrder.approved_at as string) : null;

            const fallbackSignature = approverName.toLowerCase().includes("ferry")
              ? `${window.location.origin}/signature-ferry.png`
              : `${window.location.origin}/approved-signature.png`;

            return (
              <>
                <div style={headerStyle}>
                  Ditandatangani oleh <span style={{ fontWeight: 700 }}>{isApproved ? approverName : "-"}</span>
                </div>

                <div style={metaRow}>
                  <div style={leftRoleStyle}>Approve,</div>
                  <div style={rightDateStyle}>{approvedAt ? `Pada ${formatDateTimeID(approvedAt)}` : "-"}</div>
                </div>

                <div style={signArea}>
                  {isApproved ? (
                    <img
                      src={signatureUrl || fallbackSignature}
                      crossOrigin="anonymous"
                      alt="Approved Signature"
                      style={{ height: "52px", maxWidth: "140px", objectFit: "contain" }}
                    />
                  ) : null}
                </div>

                <div style={lineStyle} />
                <div style={isApproved ? nameStyle : placeholderNameStyle}>
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

              <div style={{ marginTop: "10px", fontSize: "9px", color: "#333" }}>
                Print: {formatDateTimeID(new Date())}
              </div>
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
            <Button variant="outline" onClick={handleDownloadPDF}>
              <Download className="w-4 h-4 mr-2" />
              {language === "en" ? "Print to PDF" : "Cetak ke PDF"}
            </Button>
            <Button
              onClick={() => {
                if (!printRef.current || !selectedOrder) return;
                securePrint({
                  title: `Sales Order - ${selectedOrder.sales_order_number}`,
                  styles: printStyles.salesOrder,
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
