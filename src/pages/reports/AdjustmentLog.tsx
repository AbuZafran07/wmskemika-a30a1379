import React, { useState, useEffect } from 'react';
import { Search, Download, RefreshCw, Filter, FileSpreadsheet, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePagination } from '@/hooks/usePagination';
import { DataTablePagination } from '@/components/DataTablePagination';

interface AdjustmentWithItems {
  id: string;
  adjustment_number: string;
  adjustment_date: string;
  reason: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  rejected_reason: string | null;
  items: {
    id: string;
    product_name: string;
    batch_no: string;
    adjustment_qty: number;
    notes: string | null;
  }[];
  approver_name?: string;
  creator_email?: string;
}

const statusConfig: Record<string, { variant: 'success' | 'pending' | 'cancelled' | 'draft'; label: { en: string; id: string } }> = {
  draft: { variant: 'draft', label: { en: 'Draft', id: 'Draft' } },
  pending: { variant: 'pending', label: { en: 'Pending', id: 'Menunggu' } },
  approved: { variant: 'success', label: { en: 'Approved', id: 'Disetujui' } },
  rejected: { variant: 'cancelled', label: { en: 'Rejected', id: 'Ditolak' } },
};

export default function AdjustmentLog() {
  const { language } = useLanguage();
  const { canUpload } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [adjustments, setAdjustments] = useState<AdjustmentWithItems[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchAdjustments = async () => {
    setLoading(true);
    try {
      // Fetch adjustments
      let query = supabase
        .from('stock_adjustments')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (dateFrom) {
        query = query.gte('adjustment_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('adjustment_date', dateTo);
      }

      const { data: adjustmentsData, error } = await query;

      if (error) throw error;

      // Fetch items for each adjustment
      const adjustmentIds = (adjustmentsData || []).map(a => a.id);
      
      const { data: itemsData } = await supabase
        .from('stock_adjustment_items')
        .select(`
          id,
          adjustment_id,
          product_id,
          batch_id,
          adjustment_qty,
          notes,
          products!inner(name),
          inventory_batches!inner(batch_no)
        `)
        .in('adjustment_id', adjustmentIds);

      // Fetch approver names
      const approverIds = (adjustmentsData || [])
        .filter(a => a.approved_by)
        .map(a => a.approved_by);
      
      const { data: profiles } = approverIds.length > 0 
        ? await supabase.from('profiles_chat_view').select('id, full_name').in('id', approverIds)
        : { data: [] };

      const profileMap: Record<string, string> = {};
      (profiles || []).forEach(p => {
        profileMap[p.id] = p.full_name || '';
      });

      // Map items to adjustments
      const adjustmentsWithItems: AdjustmentWithItems[] = (adjustmentsData || []).map(adj => {
        const items = (itemsData || [])
          .filter(item => item.adjustment_id === adj.id)
          .map(item => ({
            id: item.id,
            product_name: (item.products as any)?.name || 'Unknown',
            batch_no: (item.inventory_batches as any)?.batch_no || '-',
            adjustment_qty: item.adjustment_qty,
            notes: item.notes,
          }));

        return {
          ...adj,
          items,
          approver_name: adj.approved_by ? profileMap[adj.approved_by] : undefined,
        };
      });

      setAdjustments(adjustmentsWithItems);
    } catch (error: any) {
      toast.error(language === 'en' ? 'Failed to fetch adjustment log' : 'Gagal memuat log penyesuaian');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdjustments();
  }, [statusFilter, dateFrom, dateTo]);

  const filteredAdjustments = adjustments.filter(adj => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      adj.adjustment_number.toLowerCase().includes(searchLower) ||
      adj.reason.toLowerCase().includes(searchLower) ||
      adj.items.some(item => item.product_name.toLowerCase().includes(searchLower))
    );
  });

  // Pagination
  const {
    currentPage,
    pageSize,
    totalPages,
    paginatedData: paginatedAdjustments,
    setCurrentPage,
    setPageSize,
  } = usePagination(filteredAdjustments);

  const exportToCSV = () => {
    const headers = ['Adjustment Number', 'Date', 'Reason', 'Status', 'Products', 'Total Qty', 'Approved By', 'Approved At'];
    const rows = filteredAdjustments.map(adj => [
      adj.adjustment_number,
      new Date(adj.adjustment_date).toLocaleDateString('id-ID'),
      adj.reason,
      adj.status,
      adj.items.map(i => i.product_name).join('; '),
      adj.items.reduce((sum, i) => sum + i.adjustment_qty, 0),
      adj.approver_name || '-',
      adj.approved_at ? new Date(adj.approved_at).toLocaleString('id-ID') : '-',
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `adjustment-log-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success(language === 'en' ? 'CSV exported successfully' : 'CSV berhasil diekspor');
  };

  // Summary stats
  const totalAdjustments = filteredAdjustments.length;
  const approvedCount = filteredAdjustments.filter(a => a.status === 'approved').length;
  const pendingCount = filteredAdjustments.filter(a => a.status === 'pending' || a.status === 'draft').length;
  const rejectedCount = filteredAdjustments.filter(a => a.status === 'rejected').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display">
          {language === 'en' ? 'Adjustment Log' : 'Log Penyesuaian Stok'}
        </h1>
        <p className="text-muted-foreground">
          {language === 'en' 
            ? 'View stock adjustment history and approvals.' 
            : 'Lihat riwayat penyesuaian stok dan persetujuan.'}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalAdjustments}</p>
                <p className="text-xs text-muted-foreground">{language === 'en' ? 'Total Adjustments' : 'Total Penyesuaian'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <CheckCircle className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{approvedCount}</p>
                <p className="text-xs text-muted-foreground">{language === 'en' ? 'Approved' : 'Disetujui'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <Clock className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">{language === 'en' ? 'Pending' : 'Menunggu'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{rejectedCount}</p>
                <p className="text-xs text-muted-foreground">{language === 'en' ? 'Rejected' : 'Ditolak'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={language === 'en' ? 'Search by number, reason, or product...' : 'Cari berdasarkan nomor, alasan, atau produk...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder={language === 'en' ? 'Status' : 'Status'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'en' ? 'All Status' : 'Semua Status'}</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending">{language === 'en' ? 'Pending' : 'Menunggu'}</SelectItem>
                <SelectItem value="approved">{language === 'en' ? 'Approved' : 'Disetujui'}</SelectItem>
                <SelectItem value="rejected">{language === 'en' ? 'Rejected' : 'Ditolak'}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full md:w-40"
              placeholder="From"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full md:w-40"
              placeholder="To"
            />
            <Button variant="outline" onClick={fetchAdjustments}>
              <RefreshCw className="w-4 h-4 mr-2" />
              {language === 'en' ? 'Refresh' : 'Segarkan'}
            </Button>
            {canUpload('report') && (
              <Button variant="outline" onClick={exportToCSV}>
                <Download className="w-4 h-4 mr-2" />
                CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAdjustments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{language === 'en' ? 'No adjustment records found' : 'Tidak ada catatan penyesuaian ditemukan'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'en' ? 'Adjustment No.' : 'No. Penyesuaian'}</TableHead>
                  <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                  <TableHead>{language === 'en' ? 'Reason' : 'Alasan'}</TableHead>
                  <TableHead>{language === 'en' ? 'Products' : 'Produk'}</TableHead>
                  <TableHead className="text-right">{language === 'en' ? 'Qty Change' : 'Perubahan Qty'}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>{language === 'en' ? 'Approved By' : 'Disetujui Oleh'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedAdjustments.map((adj) => {
                  const totalQty = adj.items.reduce((sum, i) => sum + i.adjustment_qty, 0);
                  const statusCfg = statusConfig[adj.status] || statusConfig.draft;
                  
                  return (
                    <TableRow key={adj.id}>
                      <TableCell className="font-medium">{adj.adjustment_number}</TableCell>
                      <TableCell>{new Date(adj.adjustment_date).toLocaleDateString('id-ID')}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{adj.reason}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {adj.items.slice(0, 2).map((item, idx) => (
                            <div key={idx} className="text-sm">
                              <span className="font-medium">{item.product_name}</span>
                              <span className="text-muted-foreground ml-1">({item.batch_no})</span>
                            </div>
                          ))}
                          {adj.items.length > 2 && (
                            <span className="text-xs text-muted-foreground">
                              +{adj.items.length - 2} {language === 'en' ? 'more' : 'lainnya'}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={totalQty >= 0 ? 'text-success' : 'text-destructive'}>
                          {totalQty >= 0 ? '+' : ''}{totalQty}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusCfg.variant}>
                          {language === 'en' ? statusCfg.label.en : statusCfg.label.id}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {adj.status === 'approved' && adj.approver_name ? (
                          <div>
                            <p className="text-sm">{adj.approver_name}</p>
                            {adj.approved_at && (
                              <p className="text-xs text-muted-foreground">
                                {new Date(adj.approved_at).toLocaleString('id-ID')}
                              </p>
                            )}
                          </div>
                        ) : adj.status === 'rejected' ? (
                          <div>
                            <p className="text-sm text-destructive">{adj.rejected_reason || '-'}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
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
    </div>
  );
}
