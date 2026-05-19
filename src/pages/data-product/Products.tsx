import React, { useState, useRef } from 'react';
import { Plus, Search, Filter, Download, Upload, MoreHorizontal, Edit, Trash2, Eye, Loader2, Crop } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { useLanguage } from '@/contexts/LanguageContext';
import { useProducts, useCategories, useUnits, useSuppliers, Product } from '@/hooks/useMasterData';
import { supabase } from '@/integrations/supabase/client';
import { uploadFile } from '@/lib/storage';
import { ProductThumbnail, ImagePreviewDialog } from '@/components/ImagePreviewDialog';
import { ImageCropper } from '@/components/ImageCropper';
import { toast } from 'sonner';
import { exportToCSV, parseCSV, readFileAsText, downloadCSVTemplate, checkDuplicates, getColumnValue } from '@/lib/csvUtils';
import { ImportPreviewDialog, ImportPreviewRow } from '@/components/ImportPreviewDialog';
import { DataTablePagination } from '@/components/DataTablePagination';
import { usePagination } from '@/hooks/usePagination';
import { syncProductToSalesPulse } from '@/lib/salesPulseSync';

interface ProductFormData {
  sku: string;
  name: string;
  description: string;
  category_id: string;
  unit_id: string;
  supplier_id: string;
  purchase_price: string;
  selling_price: string;
  min_stock: string;
  max_stock: string;
  location_rack: string;
  is_active: boolean;
  photo_url: string;
}

const initialFormData: ProductFormData = {
  sku: '',
  name: '',
  description: '',
  category_id: '',
  unit_id: '',
  supplier_id: '',
  purchase_price: '',
  selling_price: '',
  min_stock: '0',
  max_stock: '',
  location_rack: '',
  is_active: true,
  photo_url: '',
};

const syncProductSalesPulseAsync = (product: {
  sku?: string | null;
  name: string;
  category?: string | null;
  unit?: string | null;
  purchase_price?: number | null;
  selling_price?: number | null;
  is_active: boolean;
}) => {
  if (!product.sku?.trim()) {
    console.warn('[WMS] Product sync to Sales Pulse skipped: SKU kosong');
    return;
  }

  syncProductToSalesPulse({
    sku: product.sku.trim(),
    name: product.name,
    category: product.category || null,
    unit: product.unit || null,
    purchase_price: product.purchase_price ?? null,
    selling_price: product.selling_price ?? null,
    is_active: product.is_active,
  }).catch((err) => console.warn('[WMS] Product sync to Sales Pulse failed:', err));
};

export default function Products() {
  const { t, language } = useLanguage();
  const { products, loading, refetch } = useProducts();
  const { categories } = useCategories();
  const { units } = useUnits();
  const { suppliers } = useSuppliers();
  const { canCreate, canEdit, canDelete, canUpload, canViewPurchasePrice, canViewSupplier } = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
  const [previewingProduct, setPreviewingProduct] = useState<Product | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [tempFileForCrop, setTempFileForCrop] = useState<File | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const columns = [
      { key: 'sku', header: 'SKU' },
      { key: 'name', header: language === 'en' ? 'Product Name' : 'Nama Produk' },
      { key: 'description', header: language === 'en' ? 'Description' : 'Keterangan', getValue: (item: Product) => (item as any).description || '' },
      { key: 'category', header: language === 'en' ? 'Category' : 'Kategori', getValue: (item: Product) => item.category?.name || '' },
      { key: 'unit', header: language === 'en' ? 'Unit' : 'Satuan', getValue: (item: Product) => item.unit?.name || '' },
      { key: 'supplier', header: 'Supplier', getValue: (item: Product) => item.supplier?.name || '' },
    ];
    
    // Only include purchase_price for authorized roles
    if (canViewPurchasePrice()) {
      columns.push({ key: 'purchase_price', header: language === 'en' ? 'Purchase Price' : 'Harga Beli' });
    }
    
    columns.push(
      { key: 'selling_price', header: language === 'en' ? 'Selling Price' : 'Harga Jual' },
      { key: 'min_stock', header: language === 'en' ? 'Min Stock' : 'Stok Min' },
      { key: 'max_stock', header: language === 'en' ? 'Max Stock' : 'Stok Maks' },
      { key: 'location_rack', header: language === 'en' ? 'Location' : 'Lokasi' },
      { key: 'is_active', header: 'Status', getValue: (item: Product) => item.is_active ? 'Active' : 'Inactive' },
    );
    
    exportToCSV(products, columns, 'products');
    toast.success(language === 'en' ? 'Export successful' : 'Ekspor berhasil');
  };

  const handleDownloadTemplate = () => {
    downloadCSVTemplate(
      [
        { header: 'SKU', example: 'CHM-001' },
        { header: language === 'en' ? 'Product Name' : 'Nama Produk', example: 'Sodium Chloride' },
        { header: language === 'en' ? 'Description' : 'Keterangan', example: 'NaCl 99.5% purity, industrial grade' },
        { header: language === 'en' ? 'Category Code' : 'Kode Kategori', example: 'CAT-001' },
        { header: language === 'en' ? 'Unit Code' : 'Kode Satuan', example: 'KG' },
        { header: 'Supplier Code', example: 'VND2026-0001' },
        { header: language === 'en' ? 'Purchase Price' : 'Harga Beli', example: '50000' },
        { header: language === 'en' ? 'Selling Price' : 'Harga Jual', example: '75000' },
        { header: language === 'en' ? 'Min Stock' : 'Stok Min', example: '10' },
        { header: language === 'en' ? 'Max Stock' : 'Stok Maks', example: '100' },
        { header: language === 'en' ? 'Location' : 'Lokasi', example: 'A-01' },
        { header: 'Status', example: 'Active' },
      ],
      'products'
    );
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await readFileAsText(file);
      const rows = parseCSV(content);
      
      if (rows.length === 0) {
        toast.error(language === 'en' ? 'No data found in file' : 'Tidak ada data dalam file');
        if (csvInputRef.current) csvInputRef.current.value = '';
        return;
      }

      const existingSkus = products.filter(p => p.sku).map(p => p.sku as string);
      const duplicateCheck = checkDuplicates(rows, 'SKU', existingSkus);

      const preview: ImportPreviewRow[] = rows.map((row, index) => {
        const sku = row['SKU'] || '';
        const name = getColumnValue(row, ['Product Name', 'Nama Produk']);
        const categoryCode = getColumnValue(row, ['Category Code', 'Kode Kategori']);
        const unitCode = getColumnValue(row, ['Unit Code', 'Kode Satuan']);
        const supplierCode = row['Supplier Code'];
        const purchase_price = getColumnValue(row, ['Purchase Price', 'Harga Beli']);
        const dupInfo = duplicateCheck.get(index);

        const category = categories.find(c => c.code.toLowerCase() === categoryCode?.toLowerCase());
        const unit = units.find(u => u.code.toLowerCase() === unitCode?.toLowerCase());
        const supplier = suppliers.find(s => s.code.toLowerCase() === supplierCode?.toLowerCase());

        if (!name || !purchase_price) {
          return {
            rowIndex: index + 2,
            data: { sku, name, category: categoryCode, unit: unitCode },
            status: 'error' as const,
            message: language === 'en' ? 'Name and Purchase Price required' : 'Nama dan Harga Beli wajib',
          };
        }

        if (!category || !unit || !supplier) {
          return {
            rowIndex: index + 2,
            data: { sku, name, category: categoryCode, unit: unitCode },
            status: 'error' as const,
            message: language === 'en' ? 'Invalid category/unit/supplier code' : 'Kode kategori/satuan/supplier tidak valid',
          };
        }

        if (sku && dupInfo?.isDuplicate && dupInfo.duplicateType === 'database') {
          const existingProduct = products.find(p => p.sku?.toLowerCase() === sku.toLowerCase());
          return {
            rowIndex: index + 2,
            data: { sku, name, category: category.name, unit: unit.name },
            status: 'duplicate' as const,
            message: language === 'en' ? 'SKU already exists (can update)' : 'SKU sudah ada (dapat diupdate)',
            existingId: existingProduct?.id,
          };
        }

        if (sku && dupInfo?.isDuplicate && dupInfo.duplicateType === 'csv') {
          return {
            rowIndex: index + 2,
            data: { sku, name, category: category.name, unit: unit.name },
            status: 'error' as const,
            message: language === 'en' ? 'Duplicate SKU in CSV file' : 'SKU duplikat dalam file CSV',
          };
        }

        return {
          rowIndex: index + 2,
          data: { sku: sku || '(none)', name, category: category.name, unit: unit.name },
          status: 'valid' as const,
        };
      });

      setParsedData(rows);
      setPreviewRows(preview);
      setIsPreviewOpen(true);
    } catch (error) {
      toast.error(language === 'en' ? 'Failed to read file' : 'Gagal membaca file');
    } finally {
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async (enableUpsert: boolean) => {
    setIsImporting(true);
    let insertCount = 0;
    let updateCount = 0;
    let errorCount = 0;

    // Get rows to process based on upsert setting
    const validRows = previewRows.filter(r => r.status === 'valid');
    const duplicateRows = enableUpsert ? previewRows.filter(r => r.status === 'duplicate' && r.existingId) : [];

    // Insert new rows
    for (const previewRow of validRows) {
      const row = parsedData[previewRow.rowIndex - 2];
      const sku = row['SKU'];
      const name = getColumnValue(row, ['Product Name', 'Nama Produk']);
      const categoryCode = getColumnValue(row, ['Category Code', 'Kode Kategori']);
      const unitCode = getColumnValue(row, ['Unit Code', 'Kode Satuan']);
      const supplierCode = row['Supplier Code'];
      const purchase_price = getColumnValue(row, ['Purchase Price', 'Harga Beli']);
      const selling_price = getColumnValue(row, ['Selling Price', 'Harga Jual']);
      const min_stock = getColumnValue(row, ['Min Stock', 'Stok Min']);
      const max_stock = getColumnValue(row, ['Max Stock', 'Stok Maks']);
      const location_rack = getColumnValue(row, ['Location', 'Lokasi']);
      const status = row['Status']?.toLowerCase();

      const category = categories.find(c => c.code.toLowerCase() === categoryCode?.toLowerCase());
      const unit = units.find(u => u.code.toLowerCase() === unitCode?.toLowerCase());
      const supplier = suppliers.find(s => s.code.toLowerCase() === supplierCode?.toLowerCase());

      const description = getColumnValue(row, ['Description', 'Keterangan']);

      const { error } = await supabase.from('products').insert({
        sku: sku || null,
        barcode: generateBarcode(),
        name,
        description: description || null,
        category_id: category!.id,
        unit_id: unit!.id,
        supplier_id: supplier!.id,
        purchase_price: parseFloat(purchase_price),
        selling_price: selling_price ? parseFloat(selling_price) : null,
        min_stock: parseInt(min_stock) || 0,
        max_stock: max_stock ? parseInt(max_stock) : null,
        location_rack: location_rack || null,
        is_active: status !== 'inactive',
      });

      if (error) {
        errorCount++;
      } else {
        insertCount++;
        syncProductSalesPulseAsync({
          sku: sku || null,
          name,
          category: category?.name || null,
          unit: unit?.name || null,
          purchase_price: parseFloat(purchase_price),
          selling_price: selling_price ? parseFloat(selling_price) : null,
          is_active: status !== 'inactive',
        });
      }
    }

    // Update existing rows if upsert enabled
    for (const previewRow of duplicateRows) {
      const row = parsedData[previewRow.rowIndex - 2];
      const name = getColumnValue(row, ['Product Name', 'Nama Produk']);
      const categoryCode = getColumnValue(row, ['Category Code', 'Kode Kategori']);
      const unitCode = getColumnValue(row, ['Unit Code', 'Kode Satuan']);
      const supplierCode = row['Supplier Code'];
      const purchase_price = getColumnValue(row, ['Purchase Price', 'Harga Beli']);
      const selling_price = getColumnValue(row, ['Selling Price', 'Harga Jual']);
      const min_stock = getColumnValue(row, ['Min Stock', 'Stok Min']);
      const max_stock = getColumnValue(row, ['Max Stock', 'Stok Maks']);
      const location_rack = getColumnValue(row, ['Location', 'Lokasi']);
      const status = row['Status']?.toLowerCase();

      const category = categories.find(c => c.code.toLowerCase() === categoryCode?.toLowerCase());
      const unit = units.find(u => u.code.toLowerCase() === unitCode?.toLowerCase());
      const supplier = suppliers.find(s => s.code.toLowerCase() === supplierCode?.toLowerCase());

      const description = getColumnValue(row, ['Description', 'Keterangan']);

      const { error } = await supabase.from('products')
        .update({
          name,
          description: description || null,
          category_id: category!.id,
          unit_id: unit!.id,
          supplier_id: supplier!.id,
          purchase_price: parseFloat(purchase_price),
          selling_price: selling_price ? parseFloat(selling_price) : null,
          min_stock: parseInt(min_stock) || 0,
          max_stock: max_stock ? parseInt(max_stock) : null,
          location_rack: location_rack || null,
          is_active: status !== 'inactive',
        })
        .eq('id', previewRow.existingId!);

      if (error) {
        errorCount++;
      } else {
        updateCount++;
        syncProductSalesPulseAsync({
          sku: products.find((product) => product.id === previewRow.existingId)?.sku || null,
          name,
          category: category?.name || null,
          unit: unit?.name || null,
          purchase_price: parseFloat(purchase_price),
          selling_price: selling_price ? parseFloat(selling_price) : null,
          is_active: status !== 'inactive',
        });
      }
    }

    const message = language === 'en'
      ? `Import complete: ${insertCount} inserted, ${updateCount} updated, ${errorCount} failed`
      : `Impor selesai: ${insertCount} ditambahkan, ${updateCount} diupdate, ${errorCount} gagal`;
    
    toast.success(message);
    
    setIsPreviewOpen(false);
    setPreviewRows([]);
    setParsedData([]);
    refetch();
    setIsImporting(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const activeFilterCount = [filterCategory, filterSupplier, filterStatus].filter(Boolean).length;

  const filteredProducts = products.filter(product => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      product.name.toLowerCase().includes(q) ||
      (product.sku && product.sku.toLowerCase().includes(q)) ||
      (product.category?.name && product.category.name.toLowerCase().includes(q)) ||
      (product.category?.code && product.category.code.toLowerCase().includes(q)) ||
      (product.supplier?.name && product.supplier.name.toLowerCase().includes(q)) ||
      (product.unit?.name && product.unit.name.toLowerCase().includes(q));
    const matchCategory = !filterCategory || product.category_id === filterCategory;
    const matchSupplier = !filterSupplier || product.supplier_id === filterSupplier;
    const matchStatus = !filterStatus || (filterStatus === 'active' ? product.is_active : !product.is_active);
    return matchSearch && matchCategory && matchSupplier && matchStatus;
  });

  const {
    currentPage,
    pageSize,
    totalPages,
    paginatedData: paginatedProducts,
    setCurrentPage,
    setPageSize,
  } = usePagination(filteredProducts);

  const handleAdd = () => {
    setEditingProduct(null);
    setFormData(initialFormData);
    setSelectedFile(null);
    setCroppedBlob(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      sku: product.sku || '',
      name: product.name,
      description: (product as any).description || '',
      category_id: product.category_id || '',
      unit_id: product.unit_id || '',
      supplier_id: product.supplier_id || '',
      purchase_price: product.purchase_price.toString(),
      selling_price: product.selling_price?.toString() || '',
      min_stock: product.min_stock.toString(),
      max_stock: product.max_stock?.toString() || '',
      location_rack: product.location_rack || '',
      is_active: product.is_active,
      photo_url: product.photo_url || '',
    });
    setSelectedFile(null);
    setCroppedBlob(null);
    setIsDialogOpen(true);
  };

  const handleImageClick = (product: Product) => {
    setPreviewingProduct(product);
    setIsImagePreviewOpen(true);
  };

  const handleView = (product: Product) => {
    setViewingProduct(product);
    setIsViewDialogOpen(true);
  };

  const handleDelete = (product: Product) => {
    setDeletingProduct(product);
    setIsDeleteDialogOpen(true);
  };

  const generateBarcode = () => {
    const timestamp = Date.now().toString().slice(-10);
    const randomArray = new Uint8Array(1);
    crypto.getRandomValues(randomArray);
    const random = (randomArray[0] % 100).toString().padStart(2, '0');
    return `899${timestamp}${random}`;
  };

  const handleSave = async () => {
    if (!formData.name || !formData.category_id || !formData.unit_id || !formData.supplier_id || !formData.purchase_price) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    setIsSaving(true);

    // Handle file upload if a cropped blob is available
    let photoPath = formData.photo_url;
    if (croppedBlob) {
      setIsUploading(true);
      // Convert blob to File for uploadFile function (WebP format)
      const croppedFile = new File([croppedBlob], 'product-photo.webp', { type: 'image/webp' });
      const result = await uploadFile(croppedFile, 'product-photos', 'products');
      if (result) {
        photoPath = result.path;
      } else {
        toast.error(language === 'en' ? 'Failed to upload image' : 'Gagal mengunggah gambar');
        setIsSaving(false);
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    const productData = {
      sku: formData.sku || null,
      barcode: editingProduct?.barcode || generateBarcode(),
      name: formData.name,
      description: formData.description || null,
      category_id: formData.category_id,
      unit_id: formData.unit_id,
      supplier_id: formData.supplier_id,
      purchase_price: parseFloat(formData.purchase_price),
      selling_price: formData.selling_price ? parseFloat(formData.selling_price) : null,
      min_stock: parseInt(formData.min_stock) || 0,
      max_stock: formData.max_stock ? parseInt(formData.max_stock) : null,
      location_rack: formData.location_rack || null,
      is_active: formData.is_active,
      photo_url: photoPath || null,
    };

    let error;

    if (editingProduct) {
      const { error: updateError } = await supabase
        .from('products')
        .update(productData)
        .eq('id', editingProduct.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('products')
        .insert(productData);
      error = insertError;
    }

    if (error) {
      toast.error(error.message);
    } else {
      syncProductSalesPulseAsync({
        sku: productData.sku,
        name: productData.name,
        category: categories.find((category) => category.id === productData.category_id)?.name || null,
        unit: units.find((unit) => unit.id === productData.unit_id)?.name || null,
        purchase_price: productData.purchase_price,
        selling_price: productData.selling_price,
        is_active: productData.is_active,
      });

      toast.success(
        editingProduct 
          ? (language === 'en' ? 'Product updated successfully' : 'Produk berhasil diperbarui')
          : (language === 'en' ? 'Product created successfully' : 'Produk berhasil dibuat')
      );
      setIsDialogOpen(false);
      refetch();
    }

    setIsSaving(false);
  };

  const confirmDelete = async () => {
    if (!deletingProduct) return;

    const { error } = await supabase
      .from('products')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletingProduct.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(language === 'en' ? 'Product deleted successfully' : 'Produk berhasil dihapus');
      refetch();
    }

    setIsDeleteDialogOpen(false);
    setDeletingProduct(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.products')}</h1>
          <p className="text-muted-foreground">
            {language === 'en' ? 'Manage your product catalog' : 'Kelola katalog produk Anda'}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileSelect}
          />
          {canUpload('product') && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={isImporting}>
                  {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  {t('common.import')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => csvInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  {language === 'en' ? 'Import CSV' : 'Impor CSV'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadTemplate}>
                  <Download className="w-4 h-4 mr-2" />
                  {language === 'en' ? 'Download Template' : 'Unduh Template'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            {t('common.export')}
          </Button>
          {canCreate('product') && (
            <Button size="sm" onClick={handleAdd}>
              <Plus className="w-4 h-4 mr-2" />
              {t('common.add')} Product
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder={language === 'en' ? 'Search products...' : 'Cari produk...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <Button
              variant={showFilterPanel ? 'default' : 'outline'}
              onClick={() => setShowFilterPanel(v => !v)}
            >
              <Filter className="w-4 h-4 mr-2" />
              {t('common.filter')}
              {activeFilterCount > 0 && (
                <span className="ml-2 bg-primary-foreground text-primary rounded-full text-xs px-1.5">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>
          {showFilterPanel && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">{language === 'en' ? 'Category' : 'Kategori'}</label>
                <Select value={filterCategory || 'all'} onValueChange={v => setFilterCategory(v === 'all' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'All categories' : 'Semua kategori'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'en' ? 'All categories' : 'Semua kategori'}</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canViewSupplier() && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Supplier</label>
                  <Select value={filterSupplier || 'all'} onValueChange={v => setFilterSupplier(v === 'all' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder={language === 'en' ? 'All suppliers' : 'Semua supplier'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{language === 'en' ? 'All suppliers' : 'Semua supplier'}</SelectItem>
                      {suppliers.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-sm font-medium">Status</label>
                <Select value={filterStatus || 'all'} onValueChange={v => setFilterStatus(v === 'all' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'All status' : 'Semua status'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'en' ? 'All status' : 'Semua status'}</SelectItem>
                    <SelectItem value="active">{language === 'en' ? 'Active' : 'Aktif'}</SelectItem>
                    <SelectItem value="inactive">{language === 'en' ? 'Inactive' : 'Tidak Aktif'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {activeFilterCount > 0 && (
                <div className="sm:col-span-3 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setFilterCategory(''); setFilterSupplier(''); setFilterStatus(''); }}
                  >
                    {language === 'en' ? 'Reset filters' : 'Reset filter'}
                  </Button>
                </div>
              )}
            </div>
          )}
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
                  <TableHead>{language === 'en' ? 'Photo' : 'Foto'}</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>{language === 'en' ? 'Product Name' : 'Nama Produk'}</TableHead>
                  <TableHead>{language === 'en' ? 'Category' : 'Kategori'}</TableHead>
                  <TableHead>{language === 'en' ? 'Unit' : 'Satuan'}</TableHead>
                  {canViewSupplier() && (
                    <TableHead>Supplier</TableHead>
                  )}
                  {canViewPurchasePrice() && (
                    <TableHead className="text-right">{language === 'en' ? 'Purchase Price' : 'Harga Beli'}</TableHead>
                  )}
                  <TableHead className="text-right">{language === 'en' ? 'Selling Price' : 'Harga Jual'}</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7 + (canViewSupplier() ? 1 : 0) + (canViewPurchasePrice() ? 1 : 0)} className="text-center py-12 text-muted-foreground">
                      {language === 'en' ? 'No products found' : 'Tidak ada produk ditemukan'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedProducts.map((product) => (
                    <TableRow 
                      key={product.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleView(product)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <ProductThumbnail 
                          photoPath={product.photo_url} 
                          alt={product.name}
                          className="w-10 h-10"
                          onClick={() => handleImageClick(product)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{product.sku || '-'}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.barcode}</p>
                        </div>
                      </TableCell>
                      <TableCell>{product.category?.name || '-'}</TableCell>
                      <TableCell>{product.unit?.name || '-'}</TableCell>
                      {canViewSupplier() && (
                        <TableCell>{product.supplier?.name || '-'}</TableCell>
                      )}
                      {canViewPurchasePrice() && (
                        <TableCell className="text-right">{formatCurrency(product.purchase_price)}</TableCell>
                      )}
                      <TableCell className="text-right">{product.selling_price ? formatCurrency(product.selling_price) : '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={product.is_active ? 'success' : 'draft'}>
                          {product.is_active ? t('status.active') : t('status.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="iconSm">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleView(product)}>
                              <Eye className="w-4 h-4 mr-2" />
                              {language === 'en' ? 'View Details' : 'Lihat Detail'}
                            </DropdownMenuItem>
                            {canEdit('product') && (
                              <DropdownMenuItem onClick={() => handleEdit(product)}>
                                <Edit className="w-4 h-4 mr-2" />
                                {t('common.edit')}
                              </DropdownMenuItem>
                            )}
                            {canDelete('product') && (
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(product)}>
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t('common.delete')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
          {!loading && filteredProducts.length > 0 && (
            <DataTablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={filteredProducts.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct 
                ? (language === 'en' ? 'Edit Product' : 'Edit Produk')
                : (language === 'en' ? 'Add New Product' : 'Tambah Produk Baru')
              }
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Photo Upload */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                {language === 'en' ? 'Product Photo' : 'Foto Produk'} ({language === 'en' ? 'optional' : 'opsional'})
                <Crop className="w-3 h-3 text-muted-foreground" />
              </Label>
              <div className="flex items-center gap-4">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      // Validate file size (max 5MB)
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error(language === 'en' ? 'File size must be less than 5MB' : 'Ukuran file maksimal 5MB');
                        return;
                      }
                      // Open cropper instead of setting file directly
                      setTempFileForCrop(file);
                      setIsCropperOpen(true);
                    }
                    // Reset input so same file can be selected again
                    if (photoInputRef.current) photoInputRef.current.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {language === 'en' ? 'Upload & Crop Photo' : 'Unggah & Crop Foto'}
                </Button>
                {(croppedBlob || formData.photo_url) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedFile(null);
                      setCroppedBlob(null);
                      setFormData(prev => ({ ...prev, photo_url: '' }));
                    }}
                  >
                    {language === 'en' ? 'Remove' : 'Hapus'}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {language === 'en' 
                  ? 'Max 5MB. Supported formats: JPG, PNG, WebP. Image will be cropped to 1:1 ratio.'
                  : 'Maks 5MB. Format: JPG, PNG, WebP. Gambar akan di-crop ke rasio 1:1.'}
              </p>
              {/* Preview cropped image or existing photo */}
              {croppedBlob ? (
                <div className="mt-2">
                  <img
                    src={URL.createObjectURL(croppedBlob)}
                    alt="Preview"
                    className="w-20 h-20 rounded border border-border object-cover"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {language === 'en' ? 'Cropped & ready to upload' : 'Sudah di-crop & siap diunggah'}
                  </p>
                </div>
              ) : formData.photo_url ? (
                <div className="mt-2">
                  <ProductThumbnail 
                    photoPath={formData.photo_url} 
                    alt="Preview"
                    className="w-20 h-20"
                  />
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SKU ({language === 'en' ? 'Optional' : 'Opsional'})</Label>
                <Input
                  placeholder="e.g., CHM-001"
                  value={formData.sku}
                  onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Product Name' : 'Nama Produk'} *</Label>
                <Input
                  placeholder={language === 'en' ? 'Enter product name' : 'Masukkan nama produk'}
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{language === 'en' ? 'Description / Specification' : 'Keterangan / Spesifikasi'}</Label>
              <Textarea
                placeholder={language === 'en' ? 'Enter product description or specification' : 'Masukkan keterangan atau spesifikasi produk'}
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Category' : 'Kategori'} *</Label>
                <SearchableSelect
                  value={formData.category_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value }))}
                  options={categories.map((cat) => ({
                    value: cat.id,
                    label: cat.name,
                    description: cat.code,
                  }))}
                  placeholder={language === 'en' ? 'Select category' : 'Pilih kategori'}
                  searchPlaceholder={language === 'en' ? 'Search category...' : 'Cari kategori...'}
                  emptyMessage={language === 'en' ? 'No category found' : 'Kategori tidak ditemukan'}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Unit' : 'Satuan'} *</Label>
                <SearchableSelect
                  value={formData.unit_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, unit_id: value }))}
                  options={units.map((unit) => ({
                    value: unit.id,
                    label: unit.name,
                    description: unit.code,
                  }))}
                  placeholder={language === 'en' ? 'Select unit' : 'Pilih satuan'}
                  searchPlaceholder={language === 'en' ? 'Search unit...' : 'Cari satuan...'}
                  emptyMessage={language === 'en' ? 'No unit found' : 'Satuan tidak ditemukan'}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Default Supplier' : 'Supplier Default'} *</Label>
                <SearchableSelect
                  value={formData.supplier_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, supplier_id: value }))}
                  options={suppliers.map((sup) => ({
                    value: sup.id,
                    label: sup.name,
                    description: sup.code,
                  }))}
                  placeholder={language === 'en' ? 'Select supplier' : 'Pilih supplier'}
                  searchPlaceholder={language === 'en' ? 'Search supplier...' : 'Cari supplier...'}
                  emptyMessage={language === 'en' ? 'No supplier found' : 'Supplier tidak ditemukan'}
                />
              </div>
            </div>

            <div className={canViewPurchasePrice() ? "grid grid-cols-2 gap-4" : ""}>
              {canViewPurchasePrice() && (
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Purchase Price' : 'Harga Beli'} (IDR) *</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.purchase_price}
                    onChange={(e) => setFormData(prev => ({ ...prev, purchase_price: e.target.value }))}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Selling Price' : 'Harga Jual'} (IDR)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.selling_price}
                  onChange={(e) => setFormData(prev => ({ ...prev, selling_price: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Min Stock *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.min_stock}
                  onChange={(e) => setFormData(prev => ({ ...prev, min_stock: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Stock</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.max_stock}
                  onChange={(e) => setFormData(prev => ({ ...prev, max_stock: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Location/Rack' : 'Lokasi/Rak'}</Label>
                <Input
                  placeholder="e.g., A-01"
                  value={formData.location_rack}
                  onChange={(e) => setFormData(prev => ({ ...prev, location_rack: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is-active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
              <Label htmlFor="is-active">{language === 'en' ? 'Active' : 'Aktif'}</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{language === 'en' ? 'Product Details' : 'Detail Produk'}</DialogTitle>
          </DialogHeader>
          {viewingProduct && (
            <div className="space-y-4">
              {viewingProduct.photo_url && (
                <ProductThumbnail 
                  photoPath={viewingProduct.photo_url} 
                  alt={viewingProduct.name}
                  className="w-full h-48"
                  onClick={() => handleImageClick(viewingProduct)}
                />
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">SKU</p>
                  <p className="font-medium">{viewingProduct.sku || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Barcode</p>
                  <p className="font-medium">{viewingProduct.barcode || '-'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">{language === 'en' ? 'Name' : 'Nama'}</p>
                  <p className="font-medium">{viewingProduct.name}</p>
                </div>
                {(viewingProduct as any).description && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">{language === 'en' ? 'Description / Specification' : 'Keterangan / Spesifikasi'}</p>
                    <p className="font-medium whitespace-pre-wrap">{(viewingProduct as any).description}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">{language === 'en' ? 'Category' : 'Kategori'}</p>
                  <p className="font-medium">{viewingProduct.category?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{language === 'en' ? 'Unit' : 'Satuan'}</p>
                  <p className="font-medium">{viewingProduct.unit?.name || '-'}</p>
                </div>
                {canViewPurchasePrice() && (
                  <div>
                    <p className="text-muted-foreground">{language === 'en' ? 'Purchase Price' : 'Harga Beli'}</p>
                    <p className="font-medium">{formatCurrency(viewingProduct.purchase_price)}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">{language === 'en' ? 'Selling Price' : 'Harga Jual'}</p>
                  <p className="font-medium">{viewingProduct.selling_price ? formatCurrency(viewingProduct.selling_price) : '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Min Stock</p>
                  <p className="font-medium">{viewingProduct.min_stock}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Max Stock</p>
                  <p className="font-medium">{viewingProduct.max_stock || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{language === 'en' ? 'Supplier' : 'Supplier'}</p>
                  <p className="font-medium">{viewingProduct.supplier?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{language === 'en' ? 'Location' : 'Lokasi'}</p>
                  <p className="font-medium">{viewingProduct.location_rack || '-'}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Delete Product' : 'Hapus Produk'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to delete "${deletingProduct?.name}"? This action cannot be undone.`
                : `Apakah Anda yakin ingin menghapus "${deletingProduct?.name}"? Tindakan ini tidak dapat dibatalkan.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Preview Dialog */}
      <ImportPreviewDialog
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewRows([]);
          setParsedData([]);
        }}
        onConfirm={handleConfirmImport}
        title={language === 'en' ? 'Preview Import Products' : 'Preview Impor Produk'}
        rows={previewRows}
        columns={[
          { key: 'sku', header: 'SKU' },
          { key: 'name', header: language === 'en' ? 'Name' : 'Nama' },
          { key: 'category', header: language === 'en' ? 'Category' : 'Kategori' },
          { key: 'unit', header: language === 'en' ? 'Unit' : 'Satuan' },
        ]}
        isImporting={isImporting}
        showUpsertOption={true}
      />

      {/* Image Preview Dialog */}
      <ImagePreviewDialog
        isOpen={isImagePreviewOpen}
        onOpenChange={setIsImagePreviewOpen}
        photoPath={previewingProduct?.photo_url}
        alt={previewingProduct?.name || 'Product'}
      />

      {/* Image Cropper Dialog */}
      <ImageCropper
        open={isCropperOpen}
        onClose={() => {
          setIsCropperOpen(false);
          setTempFileForCrop(null);
        }}
        file={tempFileForCrop}
        onCropComplete={(blob) => {
          setCroppedBlob(blob);
          setSelectedFile(null);
          setTempFileForCrop(null);
        }}
        aspectRatio={1}
        outputSize={512}
      />
    </div>
  );
}
