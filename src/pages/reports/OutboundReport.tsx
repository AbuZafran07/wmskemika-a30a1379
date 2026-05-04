import { useState, useEffect, useRef } from 'react';
import { Search, Download, CalendarIcon, ArrowUpFromLine, Loader2, MoreHorizontal, Eye, Printer, Info, FileText, FileSpreadsheet, Clock, CheckCircle2, XCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { usePagination } from '@/hooks/usePagination';
import { DataTablePagination } from '@/components/DataTablePagination';
import { OutboundDetailModal } from '@/components/reports/OutboundDetailModal';
import { OutboundPdfPreview } from '@/components/reports/OutboundPdfPreview';
import { OutboundBulkPdfPreview } from '@/components/reports/OutboundBulkPdfPreview';
import { exportToXlsx } from '@/lib/xlsxExport';

interface StockOutRecord {
  id: string;
  stock_out_number: string;
  delivery_date: string;
  delivery_number: string | null;
  delivery_actual_date: string | null;
  notes?: string | null;
  booking_status?: string | null;
  delivered_at?: string | null;
  released_at?: string | null;
  release_reason?: string | null;
  sales_order: {
    sales_order_number: string;
    customer: { name: string } | null;
  } | null;
  items: {
    id: string;
    qty_out: number;
    batch: { batch_no: string; expired_date: string | null } | null;
    product: { name: string; sku: string | null } | null;
  }[];
}

export default function OutboundReport() {
  const { language } = useLanguage();
  const { canUpload } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<StockOutRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('__all__');
  const [bookingStatusFilter, setBookingStatusFilter] = useState('__all__');

  // Modal states
  const [selectedOutbound, setSelectedOutbound] = useState<StockOutRecord | null>(null);
  const [isOutboundDetailOpen, setIsOutboundDetailOpen] = useState(false);
  const [isOutboundPdfPreviewOpen, setIsOutboundPdfPreviewOpen] = useState(false);
  const [isBulkPdfOpen, setIsBulkPdfOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_out_headers')
      .select(`
        id, stock_out_number, delivery_date, delivery_number, delivery_actual_date, notes,
        booking_status, delivered_at, released_at, release_reason,
        sales_order:sales_order_headers(
          sales_order_number,
          customer:customers(name)
        ),
        items:stock_out_items(
          id, qty_out,
          batch:inventory_batches(batch_no, expired_date),
          product:products(name, sku)
        )
      `)
      .order('delivery_date', { ascending: false });

    if (error) {
      console.error(error);
    } else {
      setRecords(data || []);
    }
    setLoading(false);
  };

  // Extract unique customer names for dropdown
  const uniqueCustomers = Array.from(
    new Set(
      records
        .map(r => r.sales_order?.customer?.name)
        .filter(Boolean) as string[]
    )
  ).sort();

  const filteredRecords = records.filter(record => {
    const displayNo = record.delivery_number || record.stock_out_number;
    const matchesSearch = 
      displayNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.stock_out_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.sales_order?.sales_order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.sales_order?.customer?.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Product name filter
    const matchesProduct = !productFilter || 
      record.items.some(item => 
        item.product?.name?.toLowerCase().includes(productFilter.toLowerCase())
      );

    // Customer filter
    const matchesCustomer = customerFilter === '__all__' || 
      record.sales_order?.customer?.name === customerFilter;

    // Booking status filter
    const matchesBookingStatus = bookingStatusFilter === '__all__' ||
      (record.booking_status || 'delivered') === bookingStatusFilter;

    const displayDate = record.delivery_actual_date || record.delivery_date;
    const recordDate = new Date(displayDate);
    const matchesDateFrom = !dateFrom || recordDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || recordDate <= new Date(dateTo);
    
    return matchesSearch && matchesProduct && matchesCustomer && matchesBookingStatus && matchesDateFrom && matchesDateTo;
  });

  // Pagination
  const {
    currentPage,
    pageSize,
    totalPages,
    paginatedData: paginatedRecords,
    setCurrentPage,
    setPageSize,
  } = usePagination(filteredRecords);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setProductFilter('');
    setCustomerFilter('__all__');
    setBookingStatusFilter('__all__');
    setSearchQuery('');
  };

  const hasActiveFilters = dateFrom || dateTo || productFilter || customerFilter !== '__all__' || bookingStatusFilter !== '__all__';
  const activeFilterCount = [dateFrom || dateTo, productFilter, customerFilter !== '__all__', bookingStatusFilter !== '__all__'].filter(Boolean).length;

  const totalQtyOut = filteredRecords.reduce(
    (sum, r) => sum + r.items.reduce((s, i) => s + i.qty_out, 0),
    0
  );

  const handleExportCSV = () => {
    const headers = ['Delivery No', 'Date', 'Sales Order', 'Customer', 'Product', 'SKU', 'Qty Out', 'Batch No', 'Expiry Date'];
    const rows: string[][] = [];

    filteredRecords.forEach(record => {
      const displayNo = record.delivery_number || record.stock_out_number;
      const displayDate = record.delivery_actual_date || record.delivery_date;
      record.items.forEach(item => {
        rows.push([
          displayNo,
          formatDate(displayDate),
          record.sales_order?.sales_order_number || '',
          record.sales_order?.customer?.name || '',
          item.product?.name || '',
          item.product?.sku || '',
          item.qty_out.toString(),
          item.batch?.batch_no || '',
          item.batch?.expired_date ? formatDate(item.batch.expired_date) : '',
        ]);
      });
    });

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `outbound-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleExportXlsx = () => {
    const xlsxRows: Record<string, any>[] = [];
    filteredRecords.forEach(record => {
      const displayNo = record.delivery_number || record.stock_out_number;
      const displayDate = record.delivery_actual_date || record.delivery_date;
      record.items.forEach(item => {
        xlsxRows.push({
          delivery_no: displayNo,
          date: formatDate(displayDate),
          sales_order: record.sales_order?.sales_order_number || '',
          customer: record.sales_order?.customer?.name || '',
          product: item.product?.name || '',
          sku: item.product?.sku || '',
          qty_out: item.qty_out,
          batch_no: item.batch?.batch_no || '',
          expiry: item.batch?.expired_date ? formatDate(item.batch.expired_date) : '',
        });
      });
    });
    exportToXlsx(xlsxRows, [
      { header: 'Delivery No', key: 'delivery_no', width: 20 },
      { header: 'Tanggal', key: 'date', width: 14 },
      { header: 'Sales Order', key: 'sales_order', width: 20 },
      { header: 'Customer', key: 'customer', width: 22 },
      { header: 'Produk', key: 'product', width: 25 },
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Qty Out', key: 'qty_out', width: 8 },
      { header: 'Batch No', key: 'batch_no', width: 15 },
      { header: 'Expiry', key: 'expiry', width: 14 },
    ], `outbound-report-${new Date().toISOString().split('T')[0]}.xlsx`, 'Outbound Report');
  };

  const handleViewDetail = (record: StockOutRecord) => {
    setSelectedOutbound(record);
    setIsOutboundDetailOpen(true);
  };

  const handlePrintPdf = (record: StockOutRecord) => {
    setSelectedOutbound(record);
    setIsOutboundPdfPreviewOpen(true);
  };

  // Build filter description for bulk PDF
  const getFilterDescription = () => {
    const parts: string[] = [];
    if (customerFilter !== '__all__') parts.push(`Customer: ${customerFilter}`);
    if (productFilter) parts.push(`Produk: ${productFilter}`);
    if (dateFrom) parts.push(`Dari: ${formatDate(dateFrom)}`);
    if (dateTo) parts.push(`Sampai: ${formatDate(dateTo)}`);
    if (searchQuery) parts.push(`Pencarian: ${searchQuery}`);
    return parts.length > 0 ? parts.join(' | ') : 'Semua Data';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-info/10 rounded-lg">
            <ArrowUpFromLine className="w-6 h-6 text-info" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">
              {language === 'en' ? 'Outbound Report' : 'Laporan Pengiriman'}
            </h1>
            <p className="text-muted-foreground text-sm">
              {language === 'en' ? 'View and export outbound transaction history' : 'Lihat dan ekspor riwayat transaksi pengiriman'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => setIsBulkPdfOpen(true)} 
            variant="outline"
            disabled={filteredRecords.length === 0}
          >
            <FileText className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Print Report' : 'Cetak Report'}
            {filteredRecords.length > 0 && (
              <Badge variant="secondary" className="ml-2">{filteredRecords.length}</Badge>
            )}
          </Button>
          {canUpload('report') && (
            <>
              <Button onClick={handleExportXlsx} variant="outline">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export Excel
              </Button>
              <Button onClick={handleExportCSV} variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Transactions' : 'Total Transaksi'}</p>
            <p className="text-2xl font-bold">{filteredRecords.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Items' : 'Total Item'}</p>
            <p className="text-2xl font-bold">{filteredRecords.reduce((sum, r) => sum + r.items.length, 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Qty Out' : 'Total Qty Keluar'}</p>
            <p className="text-2xl font-bold text-info">{totalQtyOut.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Input
                  placeholder={language === 'en' ? 'Search by stock out no, SO, or customer...' : 'Cari berdasarkan no stock out, SO, atau customer...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  icon={<Search className="w-4 h-4" />}
                />
              </div>
              <div className="flex-1">
                <Input
                  placeholder={language === 'en' ? 'Filter by product name...' : 'Filter nama barang...'}
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                  icon={<Search className="w-4 h-4" />}
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="sm:w-64">
                <Select value={customerFilter} onValueChange={setCustomerFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'All Customers' : 'Semua Customer'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{language === 'en' ? 'All Customers' : 'Semua Customer'}</SelectItem>
                    {uniqueCustomers.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    {language === 'en' ? 'Date Range' : 'Rentang Tanggal'}
                    {(dateFrom || dateTo) && <Badge variant="secondary" className="ml-1">1</Badge>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>{language === 'en' ? 'From Date' : 'Dari Tanggal'}</Label>
                      <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'en' ? 'To Date' : 'Sampai Tanggal'}</Label>
                      <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                    {(dateFrom || dateTo) && (
                      <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }} className="w-full">
                        {language === 'en' ? 'Clear Date' : 'Hapus Tanggal'}
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  {language === 'en' ? 'Clear All Filters' : 'Hapus Semua Filter'}
                  <Badge variant="destructive" className="ml-2">{activeFilterCount}</Badge>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
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
                  <TableHead>{language === 'en' ? 'Delivery No' : 'No. Pengiriman'}</TableHead>
                  <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                  <TableHead>{language === 'en' ? 'Sales Order' : 'Sales Order'}</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>{language === 'en' ? 'Product' : 'Produk'}</TableHead>
                  <TableHead className="text-center">{language === 'en' ? 'Qty' : 'Qty'}</TableHead>
                  <TableHead>{language === 'en' ? 'Batch No' : 'No. Batch'}</TableHead>
                  <TableHead>{language === 'en' ? 'Expiry' : 'Kadaluarsa'}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      {language === 'en' ? 'No outbound records found' : 'Tidak ada data pengiriman'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRecords.flatMap((record) =>
                    record.items.map((item, idx) => (
                      <TableRow key={`${record.id}-${item.id}`}>
                        {idx === 0 ? (
                          <>
                            <TableCell rowSpan={record.items.length} className="font-medium align-top">
                              <div className="flex items-center gap-1">
                                {record.delivery_number || record.stock_out_number}
                                {record.delivery_number && record.delivery_number !== record.stock_out_number && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="h-3.5 w-3.5 text-primary cursor-help shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent side="right" className="text-xs">
                                        <p className="font-semibold">No. Stock Out Asli:</p>
                                        <p>{record.stock_out_number}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </TableCell>
                            <TableCell rowSpan={record.items.length} className="align-top">
                              <div className="flex items-center gap-1">
                                {formatDate(record.delivery_actual_date || record.delivery_date)}
                                {record.delivery_actual_date && record.delivery_actual_date !== record.delivery_date && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="h-3.5 w-3.5 text-primary cursor-help shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent side="right" className="text-xs">
                                        <p className="font-semibold">Tgl. Rencana Asli:</p>
                                        <p>{formatDate(record.delivery_date)}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </TableCell>
                            <TableCell rowSpan={record.items.length} className="align-top">
                              {record.sales_order?.sales_order_number}
                            </TableCell>
                            <TableCell rowSpan={record.items.length} className="align-top">
                              {record.sales_order?.customer?.name}
                            </TableCell>
                          </>
                        ) : null}
                        <TableCell>{item.product?.name}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="info">{item.qty_out}</Badge>
                        </TableCell>
                        <TableCell>{item.batch?.batch_no || '-'}</TableCell>
                        <TableCell>{item.batch?.expired_date ? formatDate(item.batch.expired_date) : '-'}</TableCell>
                        {idx === 0 ? (
                          <TableCell rowSpan={record.items.length} className="text-right align-top">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewDetail(record)}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Detail
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePrintPdf(record)}>
                                  <Printer className="w-4 h-4 mr-2" />
                                  Cetak PDF
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))
                  )
                )}
              </TableBody>
            </Table>
          )}
          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredRecords.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </CardContent>
      </Card>

      {/* Modals */}
      <OutboundDetailModal
        open={isOutboundDetailOpen}
        onOpenChange={setIsOutboundDetailOpen}
        record={selectedOutbound}
      />
      <OutboundPdfPreview
        open={isOutboundPdfPreviewOpen}
        onOpenChange={setIsOutboundPdfPreviewOpen}
        record={selectedOutbound}
      />
      <OutboundBulkPdfPreview
        open={isBulkPdfOpen}
        onOpenChange={setIsBulkPdfOpen}
        records={filteredRecords}
        filterDescription={getFilterDescription()}
      />
    </div>
  );
}
