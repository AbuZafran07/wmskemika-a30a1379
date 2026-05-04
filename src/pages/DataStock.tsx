import React, { useState, useEffect } from 'react';
import { Search, Filter, ChevronDown, ChevronRight, Package, Calendar, AlertTriangle, RefreshCw, Loader2, Download } from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';
import { DataTablePagination } from '@/components/DataTablePagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Batch {
  id: string;
  batch_no: string;
  expired_date: string | null;
  qty_on_hand: number;
  qty_booked: number;
  qty_available: number;
}

interface StockItem {
  id: string;
  sku: string | null;
  name: string;
  category: string;
  unit: string;
  min_stock: number;
  max_stock: number;
  totalStock: number;
  totalBooked: number;
  totalAvailable: number;
  batches: Batch[];
}

export default function DataStock() {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch categories
      const { data: catData } = await supabase
        .from('categories')
        .select('id, name')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name');
      
      setCategories(catData || []);

      // Fetch products with batches
      const { data: products, error: prodError } = await supabase
        .from('products')
        .select(`
          id, sku, name, min_stock, max_stock,
          category:categories(id, name),
          unit:units(id, name)
        `)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name');

      if (prodError) throw prodError;

      // Fetch all inventory batches
      const { data: batches, error: batchError } = await supabase
        .from('inventory_batches')
        .select('id, product_id, batch_no, expired_date, qty_on_hand')
        .gt('qty_on_hand', 0)
        .order('expired_date', { ascending: true, nullsFirst: false });

      if (batchError) throw batchError;

      // Fetch booking info per batch from available_stock view
      const { data: availData, error: availError } = await supabase
        .from('available_stock' as any)
        .select('batch_id, qty_booked, qty_available');

      if (availError) console.warn('available_stock fetch warning:', availError);

      const bookingMap = new Map<string, { qty_booked: number; qty_available: number }>();
      (availData || []).forEach((a: any) => {
        bookingMap.set(a.batch_id, {
          qty_booked: a.qty_booked || 0,
          qty_available: a.qty_available || 0,
        });
      });

      // Map batches to products
      const stockItems: StockItem[] = (products || []).map((product: any) => {
        const productBatches = (batches || []).filter((b: any) => b.product_id === product.id);
        const totalStock = productBatches.reduce((sum: number, b: any) => sum + (b.qty_on_hand || 0), 0);
        const enrichedBatches = productBatches.map((b: any) => {
          const bk = bookingMap.get(b.id) || { qty_booked: 0, qty_available: b.qty_on_hand };
          return {
            id: b.id,
            batch_no: b.batch_no,
            expired_date: b.expired_date,
            qty_on_hand: b.qty_on_hand,
            qty_booked: bk.qty_booked,
            qty_available: bk.qty_available,
          };
        });
        const totalBooked = enrichedBatches.reduce((s, b) => s + b.qty_booked, 0);
        const totalAvailable = enrichedBatches.reduce((s, b) => s + b.qty_available, 0);

        return {
          id: product.id,
          sku: product.sku,
          name: product.name,
          category: product.category?.name || '-',
          unit: product.unit?.name || '-',
          min_stock: product.min_stock || 0,
          max_stock: product.max_stock || 0,
          totalStock,
          totalBooked,
          totalAvailable,
          batches: enrichedBatches,
        };
      });

      setStockData(stockItems);
    } catch (error) {
      console.error('Error fetching stock data:', error);
      toast.error(language === 'en' ? 'Failed to load stock data' : 'Gagal memuat data stok');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleRow = (id: string) => {
    setExpandedRows(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const isLowStock = (current: number, min: number) => current > 0 && current <= min;
  const isOutOfStock = (current: number) => current === 0;
  const isNearExpiry = (dateStr: string | null) => {
    if (!dateStr) return false;
    const expiry = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 90 && diffDays > 0;
  };
  const isExpired = (dateStr: string | null) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  const filteredStock = stockData.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.sku || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    
    let matchesStockFilter = true;
    if (stockFilter === 'low') {
      matchesStockFilter = isLowStock(item.totalStock, item.min_stock);
    } else if (stockFilter === 'out') {
      matchesStockFilter = isOutOfStock(item.totalStock);
    } else if (stockFilter === 'available') {
      matchesStockFilter = item.totalStock > item.min_stock;
    }

    return matchesSearch && matchesCategory && matchesStockFilter;
  });

  const {
    currentPage,
    pageSize,
    totalPages,
    paginatedData,
    setCurrentPage,
    setPageSize,
  } = usePagination(filteredStock);

  const totalProducts = stockData.length;
  const lowStockCount = stockData.filter(s => isLowStock(s.totalStock, s.min_stock)).length;
  const outOfStockCount = stockData.filter(s => isOutOfStock(s.totalStock)).length;
  const totalBatches = stockData.reduce((acc, s) => acc + s.batches.length, 0);

  const exportCSV = () => {
    const headers = ['SKU', 'Product Name', 'Category', 'Unit', 'Total Stock', 'Booked', 'Available', 'Min Stock', 'Max Stock', 'Status'];
    const rows = filteredStock.map(item => [
      item.sku || '-',
      item.name,
      item.category,
      item.unit,
      item.totalStock,
      item.totalBooked,
      item.totalAvailable,
      item.min_stock,
      item.max_stock,
      isOutOfStock(item.totalStock) ? 'Out of Stock' : isLowStock(item.totalStock, item.min_stock) ? 'Low Stock' : 'Available'
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `stock-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.dataStock')}</h1>
          <p className="text-muted-foreground">
            {language === 'en' ? 'View stock levels with batch/FEFO details' : 'Lihat level stok dengan detail batch/FEFO'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Package className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalProducts}</p>
              <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Products' : 'Total Produk'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-warning/10 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{lowStockCount}</p>
              <p className="text-sm text-muted-foreground">{language === 'en' ? 'Low Stock Items' : 'Stok Rendah'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-destructive/10 rounded-xl">
              <Package className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{outOfStockCount}</p>
              <p className="text-sm text-muted-foreground">{language === 'en' ? 'Out of Stock' : 'Stok Habis'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-info/10 rounded-xl">
              <Calendar className="w-6 h-6 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalBatches}</p>
              <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Batches' : 'Total Batch'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder={language === 'en' ? 'Search by product name or SKU...' : 'Cari berdasarkan nama produk atau SKU...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={language === 'en' ? 'All Categories' : 'Semua Kategori'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'en' ? 'All Categories' : 'Semua Kategori'}</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={language === 'en' ? 'All Stock Levels' : 'Semua Level Stok'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'en' ? 'All Stock Levels' : 'Semua Level Stok'}</SelectItem>
                <SelectItem value="available">{language === 'en' ? 'Available' : 'Tersedia'}</SelectItem>
                <SelectItem value="low">{language === 'en' ? 'Low Stock' : 'Stok Rendah'}</SelectItem>
                <SelectItem value="out">{language === 'en' ? 'Out of Stock' : 'Stok Habis'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>{language === 'en' ? 'Product Name' : 'Nama Produk'}</TableHead>
                <TableHead>{language === 'en' ? 'Category' : 'Kategori'}</TableHead>
                <TableHead>{language === 'en' ? 'Unit' : 'Satuan'}</TableHead>
                <TableHead className="text-center">{language === 'en' ? 'Total Stock' : 'Total Stok'}</TableHead>
                <TableHead className="text-center">{language === 'en' ? 'Min Stock' : 'Stok Min'}</TableHead>
                <TableHead className="text-center">{language === 'en' ? 'Batches' : 'Batch'}</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {language === 'en' ? 'No stock data found' : 'Tidak ada data stok'}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((item) => {
                  const isExpanded = expandedRows.includes(item.id);
                  const lowStock = isLowStock(item.totalStock, item.min_stock);
                  const outStock = isOutOfStock(item.totalStock);
                  
                  return (
                    <React.Fragment key={item.id}>
                      <TableRow 
                        className={cn(
                          "cursor-pointer hover:bg-muted/50",
                          outStock && "bg-destructive/5",
                          lowStock && !outStock && "bg-warning/5"
                        )}
                        onClick={() => toggleRow(item.id)}
                      >
                        <TableCell>
                          <Button variant="ghost" size="iconSm" className="h-6 w-6">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium font-mono">{item.sku || '-'}</TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell className="text-center font-medium">{item.totalStock}</TableCell>
                        <TableCell className="text-center">{item.min_stock}</TableCell>
                        <TableCell className="text-center">{item.batches.length}</TableCell>
                        <TableCell className="text-center">
                          {outStock ? (
                            <Badge variant="destructive">{language === 'en' ? 'Out of Stock' : 'Habis'}</Badge>
                          ) : lowStock ? (
                            <Badge variant="warning">{language === 'en' ? 'Low Stock' : 'Rendah'}</Badge>
                          ) : (
                            <Badge variant="success">{language === 'en' ? 'Available' : 'Tersedia'}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                      
                      {isExpanded && item.batches.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="bg-muted/30 p-0">
                            <div className="p-4">
                              <h4 className="text-sm font-medium mb-3">
                                {language === 'en' ? 'Batch Details (FEFO Order)' : 'Detail Batch (Urutan FEFO)'}
                              </h4>
                              <div className="bg-card rounded-lg border overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>{language === 'en' ? 'Batch No' : 'No. Batch'}</TableHead>
                                      <TableHead>{language === 'en' ? 'Expired Date' : 'Tgl. Kadaluarsa'}</TableHead>
                                      <TableHead className="text-right">{language === 'en' ? 'Quantity' : 'Kuantitas'}</TableHead>
                                      <TableHead className="text-center">Status</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {item.batches
                                      .sort((a, b) => {
                                        if (!a.expired_date) return 1;
                                        if (!b.expired_date) return -1;
                                        return new Date(a.expired_date).getTime() - new Date(b.expired_date).getTime();
                                      })
                                      .map((batch) => {
                                        const nearExpiry = isNearExpiry(batch.expired_date);
                                        const expired = isExpired(batch.expired_date);
                                        return (
                                          <TableRow key={batch.id}>
                                            <TableCell className="font-medium font-mono">{batch.batch_no}</TableCell>
                                            <TableCell>
                                              <div className="flex items-center gap-2">
                                                {formatDate(batch.expired_date)}
                                                {expired && (
                                                  <Badge variant="destructive" className="text-[10px]">
                                                    {language === 'en' ? 'Expired' : 'Kadaluarsa'}
                                                  </Badge>
                                                )}
                                                {nearExpiry && !expired && (
                                                  <Badge variant="warning" className="text-[10px]">
                                                    {language === 'en' ? 'Near Expiry' : 'Hampir Kadaluarsa'}
                                                  </Badge>
                                                )}
                                              </div>
                                            </TableCell>
                                            <TableCell className="text-right">{batch.qty_on_hand} {item.unit}</TableCell>
                                            <TableCell className="text-center">
                                              {expired ? (
                                                <Badge variant="destructive">{language === 'en' ? 'Expired' : 'Kadaluarsa'}</Badge>
                                              ) : (
                                                <Badge variant="success">{language === 'en' ? 'Available' : 'Tersedia'}</Badge>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}

                      {isExpanded && item.batches.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="bg-muted/30 p-4 text-center text-muted-foreground">
                            {language === 'en' ? 'No batches available' : 'Tidak ada batch tersedia'}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
          
          {filteredStock.length > 0 && (
            <div className="border-t">
              <DataTablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={filteredStock.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
