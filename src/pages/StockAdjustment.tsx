import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { notifyNewStockAdjustment } from '@/lib/pushNotifications';
import { securePrint, printStyles } from '@/lib/printUtils';
import { Plus, Search, Eye, Edit, MoreHorizontal, CheckCircle, XCircle, Loader2, Upload, ArrowLeft, Trash2, Printer, Archive, List, TrendingUp, TrendingDown, AlertTriangle, Split, Merge } from 'lucide-react';
import BatchSplitDialog from '@/components/stock-adjustment/BatchSplitDialog';
import MergeBatchDialog from '@/components/stock-adjustment/MergeBatchDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/hooks/usePlanOrders';
import { useProducts, Product } from '@/hooks/useMasterData';
import {
  useStockAdjustments,
  useStockAdjustmentItems,
  useAllBatches,
  createStockAdjustment,
  updateStockAdjustment,
  approveStockAdjustment,
  rejectStockAdjustment,
  deleteStockAdjustment,
  StockAdjustmentHeader,
} from '@/hooks/useStockAdjustments';
import { uploadFile } from '@/lib/storage';
import { generateUniqueStockAdjustmentNumber } from '@/lib/transactionNumberUtils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePagination } from '@/hooks/usePagination';
import { DataTablePagination } from '@/components/DataTablePagination';

interface AdjustmentItem {
  id: string;
  product_id: string;
  batch_id: string;
  adjustment_qty: number;
  physical_qty: number | null; // null = manual mode, number = calculator mode
  notes: string;
  new_expired_date: string;
  new_batch_no: string;
  product?: Partial<Product> & { id: string; name: string };
}

// Helper component for viewing attachments with fresh signed URLs
function AttachmentButton({ urlOrPath, label }: { urlOrPath: string; label: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      let path = urlOrPath;
      // Extract path from full URL if needed
      if (urlOrPath.startsWith('http')) {
        const match = urlOrPath.match(/\/documents\/(.+?)(?:\?|$)/);
        if (match) path = match[1];
      }
      const { getSignedUrl } = await import('@/lib/storage');
      const signed = await getSignedUrl(path, 'documents');
      if (signed) {
        window.open(signed, '_blank');
      } else {
        window.open(urlOrPath, '_blank');
      }
    } catch {
      window.open(urlOrPath, '_blank');
    }
    setLoading(false);
  };

  return (
    <Button variant="outline" onClick={handleClick} disabled={loading}>
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
      {label}
    </Button>
  );
}

const statusConfig: Record<string, { label: string; labelId: string; variant: 'draft' | 'approved' | 'pending' | 'success' | 'cancelled' }> = {
  draft: { label: 'Draft', labelId: 'Draft', variant: 'draft' },
  posted: { label: 'Posted', labelId: 'Diposting', variant: 'success' },
  rejected: { label: 'Rejected', labelId: 'Ditolak', variant: 'cancelled' },
};

export default function StockAdjustment() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { adjustments, loading, refetch } = useStockAdjustments();
  const { products } = useProducts();
  const { batches: allBatches } = useAllBatches();
  const { allowAdminApprove } = useSettings();
  
  // RBAC Permissions
  const { canCreate, canEdit, canDelete, canApproveOrder } = usePermissions();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState<StockAdjustmentHeader | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingAdjustmentId, setEditingAdjustmentId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  
  const { items: selectedItems, loading: itemsLoading } = useStockAdjustmentItems(selectedAdjustment?.id || null);
  
  // Form state
  const [adjustmentNumber, setAdjustmentNumber] = useState('');
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentKey, setAttachmentKey] = useState('');
  const [adjustmentItems, setAdjustmentItems] = useState<AdjustmentItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSplitDialogOpen, setIsSplitDialogOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Use RBAC hook for approve permission (only super_admin for stock_adjustment)
  const canApprove = canApproveOrder('stock_adjustment');

  // Filter logic
  const filteredAdjustments = useMemo(() => {
    return adjustments.filter(adj => {
      const matchesSearch = 
        adj.adjustment_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        adj.reason.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || adj.status === statusFilter;
      
      const adjDate = new Date(adj.adjustment_date);
      const matchesDateFrom = !dateFrom || adjDate >= new Date(dateFrom);
      const matchesDateTo = !dateTo || adjDate <= new Date(dateTo);
      
      const activeStatuses = ['draft'];
      const archivedStatuses = ['posted', 'rejected'];
      const matchesViewMode = viewMode === 'active' 
        ? activeStatuses.includes(adj.status)
        : archivedStatuses.includes(adj.status);
      
      return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && matchesViewMode;
    });
  }, [adjustments, searchQuery, statusFilter, dateFrom, dateTo, viewMode]);

  // Pagination
  const {
    currentPage,
    pageSize,
    totalPages,
    paginatedData: paginatedAdjustments,
    setCurrentPage,
    setPageSize,
  } = usePagination(filteredAdjustments);

  const clearFilters = () => {
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = statusFilter !== 'all' || dateFrom || dateTo;

  const handleExportPDF = () => {
    if (!selectedAdjustment || !printRef.current) return;
    
    securePrint({
      title: `Stock Adjustment - ${selectedAdjustment.adjustment_number}`,
      styles: printStyles.stockAdjustment,
      content: printRef.current.innerHTML
    });
  };

  const generateAdjustmentNumber = async () => {
    const number = await generateUniqueStockAdjustmentNumber();
    setAdjustmentNumber(number);
  };

  const resetForm = () => {
    setAdjustmentNumber('');
    setAdjustmentDate(new Date().toISOString().split('T')[0]);
    setReason('');
    setAttachmentUrl('');
    setAttachmentKey('');
    setAttachmentPreviewUrl('');
    setAdjustmentItems([]);
  };

  const handleAddItem = () => {
    setAdjustmentItems(prev => [...prev, {
      id: Date.now().toString(),
      product_id: '',
      batch_id: '',
      adjustment_qty: 0,
      physical_qty: null,
      notes: '',
      new_expired_date: '',
      new_batch_no: '',
    }]);
  };

  const handleRemoveItem = (id: string) => {
    setAdjustmentItems(prev => prev.filter(item => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof AdjustmentItem | 'physical_qty', value: string | number | null) => {
    setAdjustmentItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      if (field === 'product_id') {
        const product = products.find(p => p.id === value);
        return {
          ...item,
          product_id: value as string,
          product,
          batch_id: '',
          physical_qty: null,
          adjustment_qty: 0,
        };
      }

      if (field === 'physical_qty') {
        const batch = allBatches.find(b => b.id === item.batch_id);
        const currentQty = batch?.qty_on_hand ?? 0;
        const physicalVal = value === null || value === '' ? null : Number(value);
        return {
          ...item,
          physical_qty: physicalVal,
          adjustment_qty: physicalVal !== null ? physicalVal - currentQty : 0,
        };
      }

      if (field === 'adjustment_qty') {
        return { ...item, adjustment_qty: value as number, physical_qty: null };
      }
      
      return { ...item, [field]: value };
    }));
  };

  const getBatchesForProduct = (productId: string) => {
    return allBatches.filter(b => b.product_id === productId);
  };

  // State for signed attachment preview URL
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState('');

  const resolveAttachmentUrl = useCallback(async (urlOrPath: string) => {
    if (!urlOrPath) return '';
    // If it's already a full signed URL that's still valid, try it
    if (urlOrPath.startsWith('http')) {
      // It might be an old public URL or expired signed URL - extract path
      const match = urlOrPath.match(/\/documents\/(.+?)(?:\?|$)/);
      if (match) {
        const { getSignedUrl } = await import('@/lib/storage');
        const signed = await getSignedUrl(match[1], 'documents');
        return signed || urlOrPath;
      }
      return urlOrPath;
    }
    // It's a path - generate signed URL
    const { getSignedUrl } = await import('@/lib/storage');
    const signed = await getSignedUrl(urlOrPath, 'documents');
    return signed || urlOrPath;
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const result = await uploadFile(file, 'documents', 'adjustments');
    
    if (result) {
      // Store the path for database persistence (not the expiring signed URL)
      setAttachmentUrl(result.path);
      setAttachmentKey(result.path);
      setAttachmentPreviewUrl(result.url);
      toast.success(language === 'en' ? 'Document uploaded' : 'Dokumen diupload');
    } else {
      toast.error(language === 'en' ? 'Failed to upload' : 'Gagal upload');
    }
    setIsUploading(false);
  };

  const normalizeDate = (val?: string | null) => {
    if (!val) return null;
    // Handles DATE and TIMESTAMP strings safely
    return val.split('T')[0];
  };

  const isExpiryChanged = (item: AdjustmentItem) => {
    if (!item.batch_id || !item.new_expired_date) return false;

    const batch = allBatches.find((b) => b.id === item.batch_id);
    const oldExpiry = normalizeDate(batch?.expired_date ?? null);
    const newExpiry = normalizeDate(item.new_expired_date);

    return !!newExpiry && newExpiry !== oldExpiry;
  };

  const isBatchNoChanged = (item: AdjustmentItem) => {
    if (!item.batch_id || !item.new_batch_no?.trim()) return false;
    const batch = allBatches.find((b) => b.id === item.batch_id);
    return !!batch && item.new_batch_no.trim() !== batch.batch_no;
  };

  const isLineItemComplete = (item: AdjustmentItem) => {
    if (!item.product_id || !item.batch_id) return false;

    // Valid if: qty changes OR expiry actually changes OR batch_no changes
    const qtyChanged = item.adjustment_qty !== 0;
    return qtyChanged || isExpiryChanged(item) || isBatchNoChanged(item);
  };

  const handleSplitBatchSubmit = async (data: {
    reason: string;
    attachmentUrl: string;
    attachmentKey: string;
    items: Array<{
      product_id: string;
      batch_id: string;
      adjustment_qty: number;
      notes: string;
      new_batch_no: string;
      new_expired_date: string | null;
    }>;
  }) => {
    const adjNum = await generateUniqueStockAdjustmentNumber();
    const result = await createStockAdjustment(
      {
        adjustment_number: adjNum,
        adjustment_date: new Date().toISOString().split('T')[0],
        reason: data.reason,
        attachment_url: data.attachmentUrl,
      },
      data.items.map(item => ({
        product_id: item.product_id,
        batch_id: item.batch_id,
        adjustment_qty: item.adjustment_qty,
        notes: item.notes,
        new_expired_date: item.new_expired_date,
        new_batch_no: item.new_batch_no,
      })),
      data.attachmentKey ? { file_key: data.attachmentKey, url: data.attachmentUrl } : undefined
    );

    if (result.success) {
      toast.success(language === 'en' ? 'Batch split adjustment created' : 'Pecah batch berhasil dibuat');
      notifyNewStockAdjustment(adjNum, user?.id);
      refetch();
    } else {
      toast.error(result.error || 'Failed');
      throw new Error(result.error);
    }
  };

  const handleSubmit = async () => {
    if (!adjustmentNumber || !reason || adjustmentItems.length === 0) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    if (adjustmentItems.some((item) => !isLineItemComplete(item))) {
      toast.error(
        language === 'en'
          ? 'Please complete all line items: set Adj. Qty (non-zero), change New Expiry, or change New Batch No'
          : 'Harap lengkapi semua item: isi Adj. Qty (tidak nol), ubah Exp. Baru, atau ubah Batch Baru'
      );
      return;
    }

    // Validate batch split items: qty must be positive when new_batch_no differs from source
    const invalidSplitItems = adjustmentItems.filter((item) => {
      if (!isBatchNoChanged(item)) return false;
      return item.adjustment_qty <= 0;
    });
    if (invalidSplitItems.length > 0) {
      toast.error(
        language === 'en'
          ? 'Batch split requires positive Adj. Qty (qty to move to new batch)'
          : 'Batch split memerlukan Adj. Qty positif (jumlah yang dipindahkan ke batch baru)'
      );
      return;
    }

    // Validate split qty doesn't exceed source batch
    const splitOverflow = adjustmentItems.filter((item) => {
      if (!isBatchNoChanged(item)) return false;
      const batch = allBatches.find((b) => b.id === item.batch_id);
      if (!batch) return false;
      // Sum all split qty from same source batch in this adjustment
      const totalSplitFromBatch = adjustmentItems
        .filter((i) => i.batch_id === item.batch_id && isBatchNoChanged(i))
        .reduce((sum, i) => sum + i.adjustment_qty, 0);
      return totalSplitFromBatch > batch.qty_on_hand;
    });
    if (splitOverflow.length > 0) {
      toast.error(
        language === 'en'
          ? 'Total split qty exceeds source batch stock'
          : 'Total qty split melebihi stok batch asal'
      );
      return;
    }

    if (!attachmentUrl) {
      toast.error(language === 'en' ? 'Please upload evidence/attachment' : 'Harap upload bukti/lampiran');
      return;
    }

    setIsSaving(true);

    const result = await createStockAdjustment(
      {
        adjustment_number: adjustmentNumber,
        adjustment_date: adjustmentDate,
        reason,
        attachment_url: attachmentUrl,
      },
      adjustmentItems.map((item) => ({
        product_id: item.product_id,
        batch_id: item.batch_id,
        adjustment_qty: item.adjustment_qty,
        notes: item.notes,
        new_expired_date: item.new_expired_date || null,
        new_batch_no: item.new_batch_no || null,
      })),
      attachmentKey
        ? {
            file_key: attachmentKey,
            url: attachmentUrl,
          }
        : undefined
    );

    if (result.success) {
      toast.success(language === 'en' ? 'Stock Adjustment created' : 'Penyesuaian Stok dibuat');
      // Send push notification to admin/super_admin
      notifyNewStockAdjustment(adjustmentNumber, user?.id);
      setIsFormOpen(false);
      resetForm();
      refetch();
    } else {
      toast.error(result.error || 'Failed');
    }

    setIsSaving(false);
  };

  const handleUpdate = async () => {
    if (!editingAdjustmentId || !adjustmentNumber || !reason || adjustmentItems.length === 0) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    if (adjustmentItems.some((item) => !isLineItemComplete(item))) {
      toast.error(
        language === 'en'
          ? 'Please complete all line items: set Adj. Qty (non-zero), change New Expiry, or change New Batch No'
          : 'Harap lengkapi semua item: isi Adj. Qty (tidak nol), ubah Exp. Baru, atau ubah Batch Baru'
      );
      return;
    }

    setIsSaving(true);

    const result = await updateStockAdjustment(
      editingAdjustmentId,
      {
        adjustment_number: adjustmentNumber,
        adjustment_date: adjustmentDate,
        reason,
        attachment_url: attachmentUrl,
      },
      adjustmentItems.map((item) => ({
        product_id: item.product_id,
        batch_id: item.batch_id,
        adjustment_qty: item.adjustment_qty,
        notes: item.notes,
        new_expired_date: item.new_expired_date || null,
        new_batch_no: item.new_batch_no || null,
      }))
    );

    if (result.success) {
      toast.success(language === 'en' ? 'Stock Adjustment updated' : 'Penyesuaian Stok diupdate');
      setIsFormOpen(false);
      setIsEditMode(false);
      setEditingAdjustmentId(null);
      resetForm();
      refetch();
    } else {
      toast.error(result.error || 'Failed');
    }

    setIsSaving(false);
  };

  const handleApprove = async () => {
    if (!selectedAdjustment) return;
    
    if (!canApprove) {
      toast.error(language === 'en' ? 'No permission to approve' : 'Tidak ada izin untuk menyetujui');
      return;
    }

    setIsApproving(true);
    const result = await approveStockAdjustment(selectedAdjustment.id);
    
    if (result.success) {
      toast.success(language === 'en' ? 'Adjustment approved and posted to inventory' : 'Penyesuaian disetujui dan diposting ke inventori');
      // Notify creator about approval
      if (selectedAdjustment.created_by) {
        const { notifyOrderApproved } = await import('@/lib/pushNotifications');
        notifyOrderApproved(selectedAdjustment.created_by, 'Stock Adjustment', selectedAdjustment.adjustment_number);
      }
      refetch();
    } else {
      toast.error(result.error || 'Failed to approve');
    }

    setIsApproving(false);
    setIsApproveDialogOpen(false);
    setSelectedAdjustment(null);
  };

  const handleReject = async () => {
    if (!selectedAdjustment) return;

    setIsRejecting(true);
    const result = await rejectStockAdjustment(selectedAdjustment.id, rejectReason);
    
    if (result.success) {
      toast.success(language === 'en' ? 'Adjustment rejected' : 'Penyesuaian ditolak');
      // Notify creator about rejection
      if (selectedAdjustment.created_by) {
        const { notifyOrderRejected } = await import('@/lib/pushNotifications');
        notifyOrderRejected(selectedAdjustment.created_by, 'Stock Adjustment', selectedAdjustment.adjustment_number, rejectReason);
      }
      refetch();
    } else {
      toast.error(result.error || 'Failed to reject');
    }

    setIsRejecting(false);
    setIsRejectDialogOpen(false);
    setRejectReason('');
    setSelectedAdjustment(null);
  };

  const handleDelete = async () => {
    if (!selectedAdjustment) return;

    setIsDeleting(true);
    const result = await deleteStockAdjustment(selectedAdjustment.id);
    
    if (result.success) {
      toast.success(language === 'en' ? 'Adjustment deleted' : 'Penyesuaian dihapus');
      refetch();
    } else {
      toast.error(result.error || 'Failed to delete');
    }

    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
    setSelectedAdjustment(null);
  };

  const handleViewDetail = (adj: StockAdjustmentHeader) => {
    setSelectedAdjustment(adj);
    setIsDetailDialogOpen(true);
  };

  // Auto-open detail dialog from URL query param ?id=<adjustmentId>
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || adjustments.length === 0) return;
    const adj = adjustments.find((a) => a.id === id);
    if (adj) {
      handleViewDetail(adj);
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, adjustments]);

  const handleEdit = async (adj: StockAdjustmentHeader) => {
    setAdjustmentNumber(adj.adjustment_number);
    setAdjustmentDate(adj.adjustment_date);
    setReason(adj.reason);
    setAttachmentUrl(adj.attachment_url || '');
    setAttachmentKey('');
    // Resolve signed URL for preview
    if (adj.attachment_url) {
      resolveAttachmentUrl(adj.attachment_url).then(url => setAttachmentPreviewUrl(url));
    } else {
      setAttachmentPreviewUrl('');
    }
    setEditingAdjustmentId(adj.id);
    setIsEditMode(true);
    setIsFormOpen(true);
    
    // Fetch items
    const { data } = await supabase
      .from('stock_adjustment_items')
      .select(`*, product:products(id, name, sku), batch:inventory_batches(expired_date)`)
      .eq('adjustment_id', adj.id);
    
    if (data) {
      setAdjustmentItems(data.map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        adjustment_qty: item.adjustment_qty,
        physical_qty: null,
        notes: item.notes || '',
        new_expired_date: item.new_expired_date || '',
        new_batch_no: item.new_batch_no || '',
        product: item.product,
      })));
    }
  };

  // Form View
  if (isFormOpen) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => { setIsFormOpen(false); setIsEditMode(false); setEditingAdjustmentId(null); resetForm(); }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-display">
              {isEditMode ? (language === 'en' ? 'Edit Stock Adjustment' : 'Edit Penyesuaian Stok') : (language === 'en' ? 'Create Stock Adjustment' : 'Buat Penyesuaian Stok')}
            </h1>
            <p className="text-muted-foreground">
              {language === 'en' ? 'Adjust inventory quantities with approval' : 'Sesuaikan kuantitas inventori dengan persetujuan'}
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'en' ? 'Adjustment Information' : 'Informasi Penyesuaian'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'Adjustment Number' : 'Nomor Penyesuaian'} *</Label>
                    <Input
                      value={adjustmentNumber}
                      disabled
                      className="bg-muted font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'Date' : 'Tanggal'} *</Label>
                    <Input
                      type="date"
                      value={adjustmentDate}
                      onChange={(e) => setAdjustmentDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Reason' : 'Alasan'} *</Label>
                  <Textarea
                    placeholder={language === 'en' ? 'Reason for adjustment (e.g., physical count variance, damage, etc.)' : 'Alasan penyesuaian (misal: selisih hitung fisik, kerusakan, dll.)'}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Evidence/Attachment' : 'Bukti/Lampiran'} *</Label>
                  <div className="flex items-center gap-4">
                    {(attachmentPreviewUrl || attachmentUrl) ? (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded">
                        <a href={attachmentPreviewUrl || attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-sm truncate max-w-xs text-primary hover:underline">
                          {(attachmentPreviewUrl || attachmentUrl).split('/').pop()?.split('?')[0]}
                        </a>
                        <Button variant="ghost" size="iconSm" onClick={() => { setAttachmentUrl(''); setAttachmentKey(''); setAttachmentPreviewUrl(''); }}>
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                        {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                        {language === 'en' ? 'Upload Evidence' : 'Upload Bukti'}
                      </Button>
                    )}
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={handleFileUpload} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{language === 'en' ? 'Adjustment Items' : 'Item Penyesuaian'}</CardTitle>
                <Button size="sm" onClick={handleAddItem}>
                  <Plus className="w-4 h-4 mr-2" />
                  {language === 'en' ? 'Add Item' : 'Tambah Item'}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto -mx-6 px-6">
                <Table>
                  <TableHeader>
                     <TableRow>
                       <TableHead className="w-[180px]">{language === 'en' ? 'Product' : 'Produk'}</TableHead>
                       <TableHead className="w-[150px]">Batch</TableHead>
                       <TableHead className="text-center w-[80px]">{language === 'en' ? 'Curr. Qty' : 'Qty Sistem'}</TableHead>
                       <TableHead className="text-center w-[100px]">{language === 'en' ? 'Physical Qty' : 'Stok Fisik'}</TableHead>
                       <TableHead className="text-center w-[100px]">{language === 'en' ? 'Adj. Qty' : 'Adj. Qty'}</TableHead>
                       <TableHead className="w-[120px]">{language === 'en' ? 'New Batch No' : 'Batch Baru'}</TableHead>
                       <TableHead className="text-center w-[110px]">{language === 'en' ? 'Curr. Expiry' : 'Exp. Lama'}</TableHead>
                       <TableHead className="text-center w-[130px]">{language === 'en' ? 'New Expiry' : 'Exp. Baru'}</TableHead>
                       <TableHead className="w-[120px]">{language === 'en' ? 'Notes' : 'Catatan'}</TableHead>
                       <TableHead className="w-[50px]"></TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {adjustmentItems.length === 0 ? (
                       <TableRow>
                         <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                            {language === 'en' ? 'No items added yet' : 'Belum ada item'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      adjustmentItems.map((item) => {
                        const productBatches = getBatchesForProduct(item.product_id);
                        const selectedBatch = allBatches.find(b => b.id === item.batch_id);
                        
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <SearchableSelect
                                value={item.product_id}
                                onValueChange={(value) => handleItemChange(item.id, 'product_id', value)}
                                options={products.map((p) => ({
                                  value: p.id,
                                  label: `${p.name}${p.sku ? ` (${p.sku})` : ''}`,
                                  description: p.category?.name || undefined,
                                }))}
                                placeholder={language === 'en' ? 'Select product' : 'Pilih produk'}
                                searchPlaceholder={language === 'en' ? 'Search product...' : 'Cari produk...'}
                                emptyMessage={language === 'en' ? 'No product found' : 'Produk tidak ditemukan'}
                              />
                            </TableCell>
                            <TableCell>
                              <SearchableSelect
                                value={item.batch_id}
                                onValueChange={(value) => handleItemChange(item.id, 'batch_id', value)}
                                disabled={!item.product_id}
                                options={productBatches.map((b) => ({
                                  value: b.id,
                                  label: b.batch_no,
                                  description: `Qty: ${b.qty_on_hand}${b.expired_date ? ` | Exp: ${formatDate(b.expired_date)}` : ''}`,
                                }))}
                                placeholder={language === 'en' ? 'Select batch' : 'Pilih batch'}
                                searchPlaceholder={language === 'en' ? 'Search batch...' : 'Cari batch...'}
                                emptyMessage={language === 'en' ? 'No batch found' : 'Batch tidak ditemukan'}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              {selectedBatch ? selectedBatch.qty_on_hand : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                className={`w-20 text-center ${item.physical_qty !== null ? 'border-primary ring-1 ring-primary' : ''}`}
                                value={item.physical_qty ?? ''}
                                placeholder={selectedBatch ? String(selectedBatch.qty_on_hand) : '-'}
                                onChange={(e) => handleItemChange(item.id, 'physical_qty', e.target.value)}
                                disabled={!selectedBatch}
                              />
                              {item.physical_qty !== null && selectedBatch && (
                                <span className="text-[10px] text-muted-foreground mt-1 block">
                                  = {item.physical_qty - selectedBatch.qty_on_hand >= 0 ? '+' : ''}{item.physical_qty - selectedBatch.qty_on_hand}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1 justify-center">
                                  <Input
                                    type="number"
                                    className={`w-20 text-center ${item.physical_qty !== null ? 'bg-muted' : ''}`}
                                    value={item.adjustment_qty}
                                    onChange={(e) => handleItemChange(item.id, 'adjustment_qty', parseInt(e.target.value) || 0)}
                                    readOnly={item.physical_qty !== null}
                                  />
                                  {item.adjustment_qty > 0 && <TrendingUp className="w-4 h-4 text-success" />}
                                  {item.adjustment_qty < 0 && <TrendingDown className="w-4 h-4 text-destructive" />}
                                </div>
                                {isBatchNoChanged(item) && (
                                  <span className="text-[10px] text-primary font-medium">
                                    Split → {item.new_batch_no}
                                  </span>
                                )}
                              </div>
                             </TableCell>
                             <TableCell>
                               <Input
                                 placeholder={selectedBatch?.batch_no || (language === 'en' ? 'New batch no' : 'No. batch baru')}
                                 value={item.new_batch_no}
                                 className={`w-[110px] ${isBatchNoChanged(item) ? 'border-primary ring-1 ring-primary' : ''}`}
                                 onChange={(e) => handleItemChange(item.id, 'new_batch_no', e.target.value)}
                               />
                             </TableCell>
                             <TableCell className="text-center text-sm text-muted-foreground">
                               {selectedBatch?.expired_date ? formatDate(selectedBatch.expired_date) : '-'}
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const oldExpiry = selectedBatch?.expired_date;
                                const newExpiry = item.new_expired_date;
                                const isExtended = oldExpiry && newExpiry && new Date(newExpiry) > new Date(oldExpiry);
                                
                                return (
                                  <div className="flex flex-col gap-1">
                                    <Input
                                      type="date"
                                      className={`w-[130px] ${isExtended ? 'border-warning ring-1 ring-warning' : ''}`}
                                      value={item.new_expired_date}
                                      onChange={(e) => handleItemChange(item.id, 'new_expired_date', e.target.value)}
                                      placeholder={language === 'en' ? 'New expiry' : 'Exp. baru'}
                                    />
                                    {isExtended && (
                                      <span className="text-[10px] text-warning flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        {language === 'en' ? 'Extended!' : 'Diperpanjang!'}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <Input
                                placeholder="Notes"
                                value={item.notes}
                                className="w-[100px]"
                                onChange={(e) => handleItemChange(item.id, 'notes', e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="iconSm" onClick={() => handleRemoveItem(item.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'en' ? 'Summary' : 'Ringkasan'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{language === 'en' ? 'Total Items' : 'Total Item'}</span>
                  <span>{adjustmentItems.length}</span>
                </div>
                {adjustmentItems.some(i => i.physical_qty !== null) && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{language === 'en' ? 'Auto-calculated' : 'Hitung Otomatis'}</span>
                    <Badge variant="draft" className="text-xs">{adjustmentItems.filter(i => i.physical_qty !== null).length} item</Badge>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{language === 'en' ? 'Total Increase' : 'Total Penambahan'}</span>
                  <span className="text-success">+{adjustmentItems.filter(i => i.adjustment_qty > 0).reduce((s, i) => s + i.adjustment_qty, 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{language === 'en' ? 'Total Decrease' : 'Total Pengurangan'}</span>
                  <span className="text-destructive">{adjustmentItems.filter(i => i.adjustment_qty < 0).reduce((s, i) => s + i.adjustment_qty, 0)}</span>
                </div>
                {/* Expiry date extension warnings */}
                {adjustmentItems.some(item => {
                  const batch = allBatches.find(b => b.id === item.batch_id);
                  return batch?.expired_date && item.new_expired_date && 
                         new Date(item.new_expired_date) > new Date(batch.expired_date);
                }) && (
                  <Alert className="bg-warning/10 border-warning">
                    <AlertTriangle className="w-4 h-4 text-warning" />
                    <AlertDescription className="text-warning text-xs">
                      {language === 'en' 
                        ? 'Warning: Some items have extended expiry dates. Please ensure this is intentional and documented.' 
                        : 'Peringatan: Beberapa item memiliki tanggal expired yang diperpanjang. Pastikan ini disengaja dan terdokumentasi.'}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{language === 'en' ? 'Batch No Changes' : 'Perubahan No. Batch'}</span>
                  <span>{adjustmentItems.filter(i => isBatchNoChanged(i)).length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{language === 'en' ? 'Expiry Changes' : 'Perubahan Expired'}</span>
                  <span>
                    {adjustmentItems.filter(i => isExpiryChanged(i)).length}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Live Stock Preview */}
            {adjustmentItems.some(i => i.batch_id && i.adjustment_qty !== 0) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{language === 'en' ? 'Stock Preview' : 'Pratinjau Stok'}</CardTitle>
                  <p className="text-xs text-muted-foreground">{language === 'en' ? 'Estimated stock after approval' : 'Perkiraan stok setelah disetujui'}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Per-batch detail */}
                  <div className="space-y-1">
                    {adjustmentItems
                      .filter(i => i.batch_id && i.adjustment_qty !== 0)
                      .map((item) => {
                        const batch = allBatches.find(b => b.id === item.batch_id);
                        const product = products.find(p => p.id === item.product_id);
                        if (!batch || !product) return null;
                        const isSplit = isBatchNoChanged(item);
                        const after = isSplit ? batch.qty_on_hand - item.adjustment_qty : batch.qty_on_hand + item.adjustment_qty;
                        return (
                          <div key={item.id} className="text-xs border rounded-md p-2 space-y-1">
                            <div className="font-medium truncate">{product.name}</div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>{batch.batch_no}</span>
                              <span>
                                {batch.qty_on_hand} → <span className={after > batch.qty_on_hand ? 'text-success font-semibold' : after < batch.qty_on_hand ? 'text-destructive font-semibold' : ''}>{after}</span>
                              </span>
                            </div>
                            {isSplit && (
                              <div className="flex justify-between text-muted-foreground">
                                <span className="text-primary">{item.new_batch_no} <Badge variant="draft" className="text-[9px] px-1 py-0">Baru</Badge></span>
                                <span className="text-success font-semibold">{item.adjustment_qty}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                  {/* Per-product summary */}
                  {(() => {
                    const productMap = new Map<string, { name: string; currentTotal: number; afterTotal: number }>();
                    adjustmentItems.filter(i => i.batch_id && i.product_id).forEach(item => {
                      const product = products.find(p => p.id === item.product_id);
                      const batch = allBatches.find(b => b.id === item.batch_id);
                      if (!product || !batch) return;
                      if (!productMap.has(item.product_id)) {
                        // Sum all batches for this product
                        const allProductBatches = allBatches.filter(b => b.product_id === item.product_id);
                        const currentTotal = allProductBatches.reduce((s, b) => s + b.qty_on_hand, 0);
                        productMap.set(item.product_id, { name: product.name, currentTotal, afterTotal: currentTotal });
                      }
                      const entry = productMap.get(item.product_id)!;
                      const isSplit = isBatchNoChanged(item);
                      // Split doesn't change total, only regular adj changes total
                      if (!isSplit) {
                        entry.afterTotal += item.adjustment_qty;
                      }
                    });
                    const entries = Array.from(productMap.values());
                    if (entries.length === 0) return null;
                    return (
                      <div className="border-t pt-2 space-y-1">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          {language === 'en' ? 'Product Total' : 'Total Produk'}
                        </div>
                        {entries.map((e, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="truncate mr-2">{e.name}</span>
                            <span className="whitespace-nowrap">
                              {e.currentTotal} → <span className={e.afterTotal > e.currentTotal ? 'text-success font-semibold' : e.afterTotal < e.currentTotal ? 'text-destructive font-semibold' : 'font-semibold'}>{e.afterTotal}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            <div className="flex flex-col gap-2">
              <Button onClick={isEditMode ? handleUpdate : handleSubmit} disabled={isSaving} className="w-full">
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditMode ? (language === 'en' ? 'Update' : 'Update') : (language === 'en' ? 'Save as Draft' : 'Simpan Draft')}
              </Button>
              <Button variant="outline" onClick={() => { setIsFormOpen(false); setIsEditMode(false); setEditingAdjustmentId(null); resetForm(); }}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{language === 'en' ? 'Stock Adjustment' : 'Penyesuaian Stok'}</h1>
          <p className="text-muted-foreground">{language === 'en' ? 'Adjust inventory with approval workflow' : 'Sesuaikan inventori dengan alur persetujuan'}</p>
        </div>
        {canCreate('stock_adjustment') && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsMergeDialogOpen(true)}>
              <Merge className="w-4 h-4 mr-2" />
              {language === 'en' ? 'Merge Batch' : 'Gabung Batch'}
            </Button>
            <Button variant="outline" onClick={() => setIsSplitDialogOpen(true)}>
              <Split className="w-4 h-4 mr-2" />
              {language === 'en' ? 'Split Batch' : 'Pecah Batch'}
            </Button>
            <Button onClick={async () => { await generateAdjustmentNumber(); setAdjustmentDate(new Date().toISOString().split('T')[0]); setIsFormOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              {language === 'en' ? 'Create Adjustment' : 'Buat Penyesuaian'}
            </Button>
          </div>
        )}
      </div>

      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'active' | 'archived')}>
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            <List className="w-4 h-4" />
            {language === 'en' ? 'Active' : 'Aktif'}
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2">
            <Archive className="w-4 h-4" />
            {language === 'en' ? 'Archived' : 'Arsip'}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={language === 'en' ? 'Search adjustments...' : 'Cari penyesuaian...'}
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'en' ? 'All Status' : 'Semua Status'}</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="posted">{language === 'en' ? 'Posted' : 'Diposting'}</SelectItem>
                  <SelectItem value="rejected">{language === 'en' ? 'Rejected' : 'Ditolak'}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                className="w-[140px]"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="From"
              />
              <Input
                type="date"
                className="w-[140px]"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="To"
              />
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <XCircle className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Adjustment #' : 'No. Penyesuaian'}</TableHead>
                <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                <TableHead>{language === 'en' ? 'Reason' : 'Alasan'}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : paginatedAdjustments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {language === 'en' ? 'No adjustments found' : 'Tidak ada penyesuaian'}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedAdjustments.map((adj) => {
                  const config = statusConfig[adj.status] || statusConfig.draft;
                  // RBAC: Check permissions AND status - rename to avoid shadowing
                  const allowEdit = adj.status === 'draft' && canEdit('stock_adjustment');
                  const allowDelete = adj.status === 'draft' && canDelete('stock_adjustment');
                  const canApproveThis = adj.status === 'draft' && canApprove;
                  
                  return (
                    <TableRow 
                      key={adj.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleViewDetail(adj)}
                    >
                      <TableCell className="font-medium">{adj.adjustment_number}</TableCell>
                      <TableCell>{formatDate(adj.adjustment_date)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{adj.reason}</TableCell>
                      <TableCell>
                        <Badge variant={config.variant}>
                          {language === 'en' ? config.label : config.labelId}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewDetail(adj)}>
                              <Eye className="w-4 h-4 mr-2" />
                              {t('common.view')}
                            </DropdownMenuItem>
                            {allowEdit && (
                              <DropdownMenuItem onClick={() => handleEdit(adj)}>
                                <Edit className="w-4 h-4 mr-2" />
                                {t('common.edit')}
                              </DropdownMenuItem>
                            )}
                            {canApproveThis && (
                              <>
                                <DropdownMenuItem onClick={() => { setSelectedAdjustment(adj); setIsApproveDialogOpen(true); }}>
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  {language === 'en' ? 'Approve & Post' : 'Setujui & Posting'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setSelectedAdjustment(adj); setIsRejectDialogOpen(true); }}>
                                  <XCircle className="w-4 h-4 mr-2" />
                                  {language === 'en' ? 'Reject' : 'Tolak'}
                                </DropdownMenuItem>
                              </>
                            )}
                            {allowDelete && (
                              <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedAdjustment(adj); setIsDeleteDialogOpen(true); }}>
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t('common.delete')}
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
          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredAdjustments.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{language === 'en' ? 'Adjustment Details' : 'Detail Penyesuaian'}</DialogTitle>
          </DialogHeader>
          
          {selectedAdjustment && (
            <>
              <div ref={printRef}>
                <div className="header">
                  <div className="company-name">PT. Kemika Karya Pratama</div>
                  <div className="document-title">{language === 'en' ? 'Stock Adjustment' : 'Penyesuaian Stok'}</div>
                </div>
                
                <div className="info-grid grid grid-cols-2 gap-4 mb-4">
                  <div className="info-item">
                    <label className="text-xs text-muted-foreground">{language === 'en' ? 'Adjustment Number' : 'Nomor'}</label>
                    <p className="font-medium">{selectedAdjustment.adjustment_number}</p>
                  </div>
                  <div className="info-item">
                    <label className="text-xs text-muted-foreground">{language === 'en' ? 'Date' : 'Tanggal'}</label>
                    <p className="font-medium">{formatDate(selectedAdjustment.adjustment_date)}</p>
                  </div>
                  <div className="info-item col-span-2">
                    <label className="text-xs text-muted-foreground">{language === 'en' ? 'Reason' : 'Alasan'}</label>
                    <p className="font-medium">{selectedAdjustment.reason}</p>
                  </div>
                  <div className="info-item">
                    <label className="text-xs text-muted-foreground">Status</label>
                    <Badge variant={statusConfig[selectedAdjustment.status]?.variant || 'draft'}>
                      {language === 'en' ? statusConfig[selectedAdjustment.status]?.label : statusConfig[selectedAdjustment.status]?.labelId}
                    </Badge>
                  </div>
                  {selectedAdjustment.rejected_reason && (
                    <div className="info-item col-span-2">
                      <label className="text-xs text-muted-foreground">{language === 'en' ? 'Rejection Reason' : 'Alasan Penolakan'}</label>
                      <p className="font-medium text-destructive">{selectedAdjustment.rejected_reason}</p>
                    </div>
                  )}
                </div>
                
                <Table>
                  <TableHeader>
                     <TableRow>
                       <TableHead>SKU</TableHead>
                       <TableHead>{language === 'en' ? 'Product' : 'Produk'}</TableHead>
                       <TableHead>Batch</TableHead>
                       <TableHead>{language === 'en' ? 'New Batch No' : 'Batch Baru'}</TableHead>
                       <TableHead className="text-center">{language === 'en' ? 'Adj. Qty' : 'Adj. Qty'}</TableHead>
                       <TableHead className="text-center">{language === 'en' ? 'New Expiry' : 'Exp. Baru'}</TableHead>
                       <TableHead>{language === 'en' ? 'Notes' : 'Catatan'}</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {itemsLoading ? (
                       <TableRow>
                         <TableCell colSpan={7} className="text-center py-4">
                           <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                         </TableCell>
                       </TableRow>
                     ) : (
                       selectedItems.map((item) => (
                         <TableRow key={item.id}>
                           <TableCell>{item.product?.sku || '-'}</TableCell>
                           <TableCell>{item.product?.name || '-'}</TableCell>
                           <TableCell>{item.batch?.batch_no || '-'}</TableCell>
                           <TableCell>
                             {(item as any).new_batch_no ? (
                               <span className="text-primary font-medium">{(item as any).new_batch_no}</span>
                             ) : '-'}
                           </TableCell>
                           <TableCell className="text-center">
                             <span className={item.adjustment_qty >= 0 ? 'text-success' : 'text-destructive'}>
                               {item.adjustment_qty >= 0 ? '+' : ''}{item.adjustment_qty}
                             </span>
                           </TableCell>
                           <TableCell className="text-center">
                             {item.new_expired_date ? formatDate(item.new_expired_date) : '-'}
                           </TableCell>
                           <TableCell>{item.notes || '-'}</TableCell>
                         </TableRow>
                       ))
                     )}
                  </TableBody>
                </Table>
              </div>
              
              <DialogFooter>
                {selectedAdjustment.attachment_url && (
                  <AttachmentButton urlOrPath={selectedAdjustment.attachment_url} label={language === 'en' ? 'View Attachment' : 'Lihat Lampiran'} />
                )}
                <Button variant="outline" onClick={handleExportPDF}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print / PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Approve & Post Adjustment?' : 'Setujui & Posting Penyesuaian?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? 'This will update inventory quantities immediately. This action cannot be undone.'
                : 'Ini akan mengupdate kuantitas inventori segera. Aksi ini tidak dapat dibatalkan.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={isApproving}>
              {isApproving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Approve & Post' : 'Setujui & Posting'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Reject Adjustment?' : 'Tolak Penyesuaian?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' ? 'Please provide a reason for rejection.' : 'Berikan alasan penolakan.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder={language === 'en' ? 'Rejection reason...' : 'Alasan penolakan...'}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="my-4"
          />
          <div className="flex items-center justify-between mb-4">
            <p className={`text-xs ${rejectReason.trim().length < 20 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {rejectReason.trim().length}/20 {language === 'en' ? 'min characters' : 'karakter minimum'}
            </p>
            {rejectReason.trim().length >= 20 && <span className="text-xs text-green-600">✓</span>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectReason('')}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={isRejecting || rejectReason.trim().length < 20} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isRejecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Reject' : 'Tolak'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Delete Adjustment?' : 'Hapus Penyesuaian?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' ? 'This will soft delete the adjustment. It can be recovered if needed.' : 'Ini akan menghapus penyesuaian (soft delete). Dapat dipulihkan jika diperlukan.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Split Dialog */}
      <BatchSplitDialog
        open={isSplitDialogOpen}
        onOpenChange={setIsSplitDialogOpen}
        products={products}
        allBatches={allBatches}
        onSubmit={handleSplitBatchSubmit}
      />

      {/* Batch Merge Dialog */}
      <MergeBatchDialog
        open={isMergeDialogOpen}
        onOpenChange={setIsMergeDialogOpen}
        products={products}
        allBatches={allBatches}
        onSubmit={handleSplitBatchSubmit}
      />
    </div>
  );
}
