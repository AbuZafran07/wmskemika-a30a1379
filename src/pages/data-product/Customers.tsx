import React, { useState, useRef } from 'react';
import { syncCustomerToArAp } from '@/lib/arApSync';
import { syncCustomerToSalesPulse } from '@/lib/salesPulseSync';
import { Plus, Search, Filter, MoreHorizontal, Edit, Trash2, Loader2, Eye, Download, Upload, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { useCustomers, Customer } from '@/hooks/useMasterData';
import { supabase } from '@/integrations/supabase/client';
import { generateCustomerCode } from '@/lib/codeGenerator';
import { toast } from 'sonner';
import { exportToCSV, parseCSV, readFileAsText, downloadCSVTemplate, checkDuplicates, getColumnValue, validateContactInfo } from '@/lib/csvUtils';
import { ImportPreviewDialog, ImportPreviewRow } from '@/components/ImportPreviewDialog';
import { DataTablePagination } from '@/components/DataTablePagination';
import { usePagination } from '@/hooks/usePagination';

interface CustomerFormData {
  code: string;
  name: string;
  customer_type: string;
  pic: string;
  jabatan: string;
  phone: string;
  email: string;
  npwp: string;
  terms_payment: string;
  address: string;
  city: string;
  is_active: boolean;
}

const initialFormData: CustomerFormData = {
  code: '',
  name: '',
  customer_type: '',
  pic: '',
  jabatan: '',
  phone: '',
  email: '',
  npwp: '',
  terms_payment: '',
  address: '',
  city: '',
  is_active: true,
};

const customerTypes = ['Corporate', 'Government', 'Individual', 'Distributor', 'Retail'];

const syncCustomerSalesPulseAsync = (customer: {
  code: string;
  name: string;
  customer_type?: string | null;
  pic?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  is_active: boolean;
}) => {
  syncCustomerToSalesPulse({
    code: customer.code,
    name: customer.name,
    customer_type: customer.customer_type || null,
    pic: customer.pic || null,
    phone: customer.phone || null,
    email: customer.email || null,
    city: customer.city || null,
    is_active: customer.is_active,
  }).catch((err) => console.warn('[WMS] Customer sync to Sales Pulse failed:', err));
};

export default function Customers() {
  const { t, language } = useLanguage();
  const { customers, loading, refetch } = useCustomers();
  const { canCreate, canEdit, canDelete, canUpload } = usePermissions();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'code' | 'name' | 'customer_type' | 'pic' | 'phone' | 'city' | 'is_active'>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 inline opacity-50" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 inline" />
      : <ArrowDown className="w-3 h-3 ml-1 inline" />;
  };
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>(initialFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    exportToCSV(
      customers,
      [
        { key: 'code', header: language === 'en' ? 'Code' : 'Kode' },
        { key: 'name', header: language === 'en' ? 'Name' : 'Nama' },
        { key: 'customer_type', header: language === 'en' ? 'Type' : 'Tipe' },
        { key: 'pic', header: 'PIC' },
        { key: 'jabatan', header: language === 'en' ? 'Position' : 'Jabatan' },
        { key: 'phone', header: language === 'en' ? 'Phone' : 'Telepon' },
        { key: 'email', header: 'Email' },
        { key: 'npwp', header: 'NPWP' },
        { key: 'terms_payment', header: language === 'en' ? 'Payment Terms' : 'Termin Pembayaran' },
        { key: 'address', header: language === 'en' ? 'Address' : 'Alamat' },
        { key: 'city', header: language === 'en' ? 'City' : 'Kota' },
        { key: 'is_active', header: 'Status', getValue: (item) => item.is_active ? 'Active' : 'Inactive' },
      ],
      'customers'
    );
    toast.success(language === 'en' ? 'Export successful' : 'Ekspor berhasil');
  };

  const handleDownloadTemplate = () => {
    downloadCSVTemplate(
      [
        { header: language === 'en' ? 'Code' : 'Kode', example: 'CUST2026-0001' },
        { header: language === 'en' ? 'Name' : 'Nama', example: 'PT Customer XYZ' },
        { header: language === 'en' ? 'Type' : 'Tipe', example: 'Corporate' },
        { header: 'PIC', example: 'Jane Doe' },
        { header: language === 'en' ? 'Position' : 'Jabatan', example: 'Purchasing Manager' },
        { header: language === 'en' ? 'Phone' : 'Telepon', example: '+6281234567890' },
        { header: 'Email', example: 'customer@example.com' },
        { header: 'NPWP', example: '12.345.678.9-123.456' },
        { header: language === 'en' ? 'Payment Terms' : 'Termin Pembayaran', example: 'NET 30' },
        { header: language === 'en' ? 'Address' : 'Alamat', example: 'Jl. Contoh No. 456' },
        { header: language === 'en' ? 'City' : 'Kota', example: 'Surabaya' },
        { header: 'Status', example: 'Active' },
      ],
      'customers'
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
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const codeField = language === 'en' ? 'Code' : 'Kode';
      const existingCodes = customers.map(c => c.code);
      const duplicateCheck = checkDuplicates(rows, codeField, existingCodes);

      const preview: ImportPreviewRow[] = rows.map((row, index) => {
        const code = getColumnValue(row, ['Code', 'Kode']);
        const name = getColumnValue(row, ['Name', 'Nama']);
        const dupInfo = duplicateCheck.get(index);

        if (!name) {
          return {
            rowIndex: index + 2,
            data: { code, name, type: getColumnValue(row, ['Type', 'Tipe']), city: getColumnValue(row, ['City', 'Kota']) },
            status: 'error' as const,
            message: language === 'en' ? 'Name is required' : 'Nama wajib diisi',
          };
        }

        // Validate contact info (email & phone)
        const contactValidation = validateContactInfo(row);
        if (!contactValidation.isValid) {
          return {
            rowIndex: index + 2,
            data: { code, name, type: getColumnValue(row, ['Type', 'Tipe']), city: getColumnValue(row, ['City', 'Kota']) },
            status: 'error' as const,
            message: contactValidation.errors.join('; '),
          };
        }

        if (code && dupInfo?.isDuplicate && dupInfo.duplicateType === 'database') {
          const existingCustomer = customers.find(c => c.code.toLowerCase() === code.toLowerCase());
          return {
            rowIndex: index + 2,
            data: { code, name, type: getColumnValue(row, ['Type', 'Tipe']), city: getColumnValue(row, ['City', 'Kota']) },
            status: 'duplicate' as const,
            message: language === 'en' ? 'Code exists (can update)' : 'Kode sudah ada (dapat diupdate)',
            existingId: existingCustomer?.id,
          };
        }

        if (code && dupInfo?.isDuplicate && dupInfo.duplicateType === 'csv') {
          return {
            rowIndex: index + 2,
            data: { code, name, type: getColumnValue(row, ['Type', 'Tipe']), city: getColumnValue(row, ['City', 'Kota']) },
            status: 'error' as const,
            message: language === 'en' ? 'Duplicate code in CSV' : 'Kode duplikat dalam CSV',
          };
        }

        return {
          rowIndex: index + 2,
          data: { code: code || '(auto)', name, type: getColumnValue(row, ['Type', 'Tipe']), city: getColumnValue(row, ['City', 'Kota']) },
          status: 'valid' as const,
          message: !code ? (language === 'en' ? 'Code will be auto-generated' : 'Kode akan dibuat otomatis') : undefined,
        };
      });

      setParsedData(rows);
      setPreviewRows(preview);
      setIsPreviewOpen(true);
    } catch (error) {
      toast.error(language === 'en' ? 'Failed to read file' : 'Gagal membaca file');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async (enableUpsert: boolean) => {
    setIsImporting(true);
    let insertCount = 0;
    let updateCount = 0;
    let errorCount = 0;

    const validRows = previewRows.filter(r => r.status === 'valid');
    const duplicateRows = enableUpsert ? previewRows.filter(r => r.status === 'duplicate' && r.existingId) : [];

    for (const previewRow of validRows) {
      const row = parsedData[previewRow.rowIndex - 2];
      const code = getColumnValue(row, ['Code', 'Kode']);
      const name = getColumnValue(row, ['Name', 'Nama']);
      const customer_type = getColumnValue(row, ['Type', 'Tipe']);
      const pic = row['PIC'];
      const jabatan = getColumnValue(row, ['Position', 'Jabatan']);
      const phone = getColumnValue(row, ['Phone', 'Telepon']);
      const email = row['Email'];
      const npwp = row['NPWP'];
      const terms_payment = getColumnValue(row, ['Payment Terms', 'Termin Pembayaran']);
      const address = getColumnValue(row, ['Address', 'Alamat']);
      const city = getColumnValue(row, ['City', 'Kota']);
      const status = row['Status']?.toLowerCase();

      const autoCode = code || await generateCustomerCode();

      const { error } = await supabase.from('customers').insert({
        code: autoCode.toUpperCase(),
        name,
        customer_type: customer_type || null,
        pic: pic || null,
        jabatan: jabatan || null,
        phone: phone || null,
        email: email || null,
        npwp: npwp || null,
        terms_payment: terms_payment || null,
        address: address || null,
        city: city || null,
        is_active: status !== 'inactive',
      });

      if (error) {
        errorCount++;
      } else {
        insertCount++;
        syncCustomerSalesPulseAsync({
          code: autoCode.toUpperCase(),
          name,
          customer_type: customer_type || null,
          pic: pic || null,
          email: email || null,
          phone: phone || null,
          city: city || null,
          is_active: status !== 'inactive',
        });
      }
    }

    for (const previewRow of duplicateRows) {
      const row = parsedData[previewRow.rowIndex - 2];
      const name = getColumnValue(row, ['Name', 'Nama']);
      const customer_type = getColumnValue(row, ['Type', 'Tipe']);
      const pic = row['PIC'];
      const jabatan = getColumnValue(row, ['Position', 'Jabatan']);
      const phone = getColumnValue(row, ['Phone', 'Telepon']);
      const email = row['Email'];
      const npwp = row['NPWP'];
      const terms_payment = getColumnValue(row, ['Payment Terms', 'Termin Pembayaran']);
      const address = getColumnValue(row, ['Address', 'Alamat']);
      const city = getColumnValue(row, ['City', 'Kota']);
      const status = row['Status']?.toLowerCase();

      const { error } = await supabase.from('customers')
        .update({
          name,
          customer_type: customer_type || null,
          pic: pic || null,
          jabatan: jabatan || null,
          phone: phone || null,
          email: email || null,
          npwp: npwp || null,
          terms_payment: terms_payment || null,
          address: address || null,
          city: city || null,
          is_active: status !== 'inactive',
        })
        .eq('id', previewRow.existingId!);

      if (error) {
        errorCount++;
      } else {
        updateCount++;
        syncCustomerSalesPulseAsync({
          code: customers.find((customer) => customer.id === previewRow.existingId)?.code || '',
          name,
          customer_type: customer_type || null,
          pic: pic || null,
          email: email || null,
          phone: phone || null,
          city: city || null,
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

  const filteredCustomers = customers
    .filter(customer =>
      customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.code.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'is_active') {
        return (Number(b.is_active) - Number(a.is_active)) * dir;
      }
      const av = (a[sortField] ?? '') as string;
      const bv = (b[sortField] ?? '') as string;
      return av.toString().localeCompare(bv.toString(), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });

  const {
    currentPage,
    pageSize,
    totalPages,
    paginatedData: paginatedCustomers,
    setCurrentPage,
    setPageSize,
  } = usePagination(filteredCustomers);

  const handleAdd = async () => {
    setEditingCustomer(null);
    const autoCode = await generateCustomerCode();
    setFormData({ ...initialFormData, code: autoCode });
    setIsDialogOpen(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      code: customer.code,
      name: customer.name,
      customer_type: customer.customer_type || '',
      pic: customer.pic || '',
      jabatan: customer.jabatan || '',
      phone: customer.phone || '',
      email: customer.email || '',
      npwp: customer.npwp || '',
      terms_payment: customer.terms_payment || '',
      address: customer.address || '',
      city: customer.city || '',
      is_active: customer.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleView = (customer: Customer) => {
    setViewingCustomer(customer);
    setIsViewDialogOpen(true);
  };

  const handleDelete = (customer: Customer) => {
    setDeletingCustomer(customer);
    setIsDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    setIsSaving(true);

    const customerData = {
      code: formData.code,
      name: formData.name,
      customer_type: formData.customer_type || null,
      pic: formData.pic || null,
      jabatan: formData.jabatan || null,
      phone: formData.phone || null,
      email: formData.email || null,
      npwp: formData.npwp || null,
      terms_payment: formData.terms_payment || null,
      address: formData.address || null,
      city: formData.city || null,
      is_active: formData.is_active,
    };

    let error;

    if (editingCustomer) {
      const { error: updateError } = await supabase
        .from('customers')
        .update(customerData)
        .eq('id', editingCustomer.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('customers')
        .insert(customerData);
      error = insertError;
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(
        editingCustomer 
          ? (language === 'en' ? 'Customer updated successfully' : 'Customer berhasil diperbarui')
          : (language === 'en' ? 'Customer created successfully' : 'Customer berhasil dibuat')
      );

      // Auto-sync customer ke AR/AP System
      syncCustomerToArAp({
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
      }).then(result => {
        if (result.success) {
          console.log('[WMS] Customer synced to AR/AP');
        }
      }).catch(err => console.warn('[WMS] Customer sync failed:', err));

      syncCustomerSalesPulseAsync({
        code: formData.code,
        name: formData.name,
        customer_type: formData.customer_type || null,
        pic: formData.pic || null,
        email: formData.email || null,
        phone: formData.phone || null,
        city: formData.city || null,
        is_active: formData.is_active,
      });

      setIsDialogOpen(false);
      refetch();
    }

    setIsSaving(false);
  };

  const confirmDelete = async () => {
    if (!deletingCustomer) return;

    const { error } = await supabase
      .from('customers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletingCustomer.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(language === 'en' ? 'Customer deleted successfully' : 'Customer berhasil dihapus');
      refetch();
    }

    setIsDeleteDialogOpen(false);
    setDeletingCustomer(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.customers')}</h1>
          <p className="text-muted-foreground">
            {language === 'en' ? 'Manage customer data' : 'Kelola data customer'}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileSelect}
          />
          {canUpload('customer') && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={isImporting}>
                  {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  {t('common.import')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
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
          {canCreate('customer') && (
            <Button size="sm" onClick={handleAdd}>
              <Plus className="w-4 h-4 mr-2" />
              {t('common.add')} Customer
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
                placeholder={language === 'en' ? 'Search customers...' : 'Cari customer...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              {t('common.filter')}
            </Button>
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
                  <TableHead>{language === 'en' ? 'Code' : 'Kode'}</TableHead>
                  <TableHead>{language === 'en' ? 'Name' : 'Nama'}</TableHead>
                  <TableHead>{language === 'en' ? 'Type' : 'Tipe'}</TableHead>
                  <TableHead>PIC</TableHead>
                  <TableHead>{language === 'en' ? 'Phone' : 'Telepon'}</TableHead>
                  <TableHead>{language === 'en' ? 'City' : 'Kota'}</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      {language === 'en' ? 'No customers found' : 'Tidak ada customer ditemukan'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedCustomers.map((customer) => (
                    <TableRow 
                      key={customer.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleView(customer)}
                    >
                      <TableCell className="font-medium">{customer.code}</TableCell>
                      <TableCell>{customer.name}</TableCell>
                      <TableCell>
                        {customer.customer_type && (
                          <Badge variant="secondary">{customer.customer_type}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{customer.pic || '-'}</TableCell>
                      <TableCell>{customer.phone || '-'}</TableCell>
                      <TableCell>{customer.city || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={customer.is_active ? 'success' : 'draft'}>
                          {customer.is_active ? t('status.active') : t('status.inactive')}
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
                            <DropdownMenuItem onClick={() => handleView(customer)}>
                              <Eye className="w-4 h-4 mr-2" />
                              {language === 'en' ? 'View Details' : 'Lihat Detail'}
                            </DropdownMenuItem>
                            {canEdit('customer') && (
                              <DropdownMenuItem onClick={() => handleEdit(customer)}>
                                <Edit className="w-4 h-4 mr-2" />
                                {t('common.edit')}
                              </DropdownMenuItem>
                            )}
                            {canDelete('customer') && (
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(customer)}>
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
          {!loading && filteredCustomers.length > 0 && (
            <DataTablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={filteredCustomers.length}
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
              {editingCustomer 
                ? (language === 'en' ? 'Edit Customer' : 'Edit Customer')
                : (language === 'en' ? 'Add New Customer' : 'Tambah Customer Baru')
              }
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Code' : 'Kode'} *</Label>
                <Input
                  placeholder="e.g., CUS-001"
                  value={formData.code}
                  onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Name' : 'Nama'} *</Label>
                <Input
                  placeholder={language === 'en' ? 'Enter customer name' : 'Masukkan nama customer'}
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Customer Type' : 'Tipe Customer'}</Label>
                <Select
                  value={formData.customer_type}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, customer_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'Select type' : 'Pilih tipe'} />
                  </SelectTrigger>
                  <SelectContent>
                    {customerTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>NPWP</Label>
                <Input
                  placeholder="XX.XXX.XXX.X-XXX.XXX"
                  value={formData.npwp}
                  onChange={(e) => setFormData(prev => ({ ...prev, npwp: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PIC</Label>
                <Input
                  placeholder={language === 'en' ? 'Person in charge' : 'Penanggung jawab'}
                  value={formData.pic}
                  onChange={(e) => setFormData(prev => ({ ...prev, pic: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Position' : 'Jabatan'}</Label>
                <Input
                  placeholder={language === 'en' ? 'Position' : 'Jabatan'}
                  value={formData.jabatan}
                  onChange={(e) => setFormData(prev => ({ ...prev, jabatan: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Phone' : 'Telepon'}</Label>
                <Input
                  placeholder="+62..."
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="email@customer.com"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Payment Terms' : 'Termin Pembayaran'}</Label>
                <Input
                  placeholder="e.g., NET 30"
                  value={formData.terms_payment}
                  onChange={(e) => setFormData(prev => ({ ...prev, terms_payment: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'City' : 'Kota'}</Label>
                <Input
                  placeholder={language === 'en' ? 'Enter city' : 'Masukkan kota'}
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Address' : 'Alamat'}</Label>
              <Textarea
                placeholder={language === 'en' ? 'Enter full address' : 'Masukkan alamat lengkap'}
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>{language === 'en' ? 'Active Status' : 'Status Aktif'}</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
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
            <DialogTitle>{language === 'en' ? 'Customer Details' : 'Detail Customer'}</DialogTitle>
          </DialogHeader>
          {viewingCustomer && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Code' : 'Kode'}</Label>
                  <p className="font-medium">{viewingCustomer.code}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Name' : 'Nama'}</Label>
                  <p className="font-medium">{viewingCustomer.name}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Type' : 'Tipe'}</Label>
                  <p className="font-medium">{viewingCustomer.customer_type || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">NPWP</Label>
                  <p className="font-medium">{viewingCustomer.npwp || '-'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">PIC</Label>
                  <p className="font-medium">{viewingCustomer.pic || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Position' : 'Jabatan'}</Label>
                  <p className="font-medium">{viewingCustomer.jabatan || '-'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Phone' : 'Telepon'}</Label>
                  <p className="font-medium">{viewingCustomer.phone || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{viewingCustomer.email || '-'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Payment Terms' : 'Termin'}</Label>
                  <p className="font-medium">{viewingCustomer.terms_payment || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'City' : 'Kota'}</Label>
                  <p className="font-medium">{viewingCustomer.city || '-'}</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">{language === 'en' ? 'Address' : 'Alamat'}</Label>
                <p className="font-medium">{viewingCustomer.address || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <Badge variant={viewingCustomer.is_active ? 'success' : 'draft'} className="mt-1">
                  {viewingCustomer.is_active ? t('status.active') : t('status.inactive')}
                </Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              {language === 'en' ? 'Close' : 'Tutup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Delete Customer' : 'Hapus Customer'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to delete "${deletingCustomer?.name}"? This action cannot be undone.`
                : `Apakah Anda yakin ingin menghapus "${deletingCustomer?.name}"? Tindakan ini tidak dapat dibatalkan.`}
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
        title={language === 'en' ? 'Preview Import Customers' : 'Preview Impor Customer'}
        rows={previewRows}
        columns={[
          { key: 'code', header: language === 'en' ? 'Code' : 'Kode' },
          { key: 'name', header: language === 'en' ? 'Name' : 'Nama' },
          { key: 'type', header: language === 'en' ? 'Type' : 'Tipe' },
          { key: 'city', header: language === 'en' ? 'City' : 'Kota' },
        ]}
        isImporting={isImporting}
      />
    </div>
  );
}
