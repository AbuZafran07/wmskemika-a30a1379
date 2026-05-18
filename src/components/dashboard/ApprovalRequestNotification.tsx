import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, ClipboardList, Package, ChevronRight, RefreshCw, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { id as idLocale, enUS } from 'date-fns/locale';

interface ApprovalRequest {
  id: string;
  type: 'plan_order' | 'sales_order' | 'adjustment';
  refNo: string;
  status: string;
  description: string;
  createdAt: Date;
  createdBy: string;
  creatorName: string;
}

export function ApprovalRequestNotification() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const previousCountRef = useRef<number>(0);
  const audioRef = useRef<AudioContext | null>(null);
  const isInitialMount = useRef(true);

  // Show for super_admin and admin only
  const canViewApprovals = user?.role === 'super_admin' || user?.role === 'admin';

  const playNotificationSound = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.value = 600;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.log('Audio play failed:', e);
    }
  };

  const fetchPendingApprovals = async () => {
    if (!canViewApprovals) return;
    
    setLoading(true);
    const approvalRequests: ApprovalRequest[] = [];

    try {
      // Fetch Plan Orders pending approval (draft status needs approval)
      const { data: planOrders } = await supabase
        .from('plan_order_headers')
        .select(`
          id, plan_number, status, created_at, created_by,
          suppliers(name)
        `)
        .in('status', ['draft', 'pending', 'revision_requested'])
        .is('is_deleted', false)
        .order('created_at', { ascending: false });

      // Fetch Sales Orders pending approval (draft status needs approval)
      const { data: salesOrders } = await supabase
        .from('sales_order_headers')
        .select(`
          id, sales_order_number, status, created_at, created_by,
          customers(name)
        `)
        .in('status', ['draft', 'pending', 'revision_requested'])
        .is('is_deleted', false)
        .order('created_at', { ascending: false });

      // Fetch Stock Adjustments pending approval (draft and submitted need approval)
      const { data: adjustments } = await supabase
        .from('stock_adjustments')
        .select('id, adjustment_number, status, created_at, created_by, reason')
        .in('status', ['draft', 'submitted', 'pending'])
        .is('is_deleted', false)
        .order('created_at', { ascending: false });

      // Get all creator IDs
      const creatorIds = new Set<string>();
      planOrders?.forEach((p: any) => p.created_by && creatorIds.add(p.created_by));
      salesOrders?.forEach((s: any) => s.created_by && creatorIds.add(s.created_by));
      adjustments?.forEach((a: any) => a.created_by && creatorIds.add(a.created_by));

      // Fetch creator names
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(creatorIds));

      const profileMap: Record<string, string> = {};
      profiles?.forEach(p => {
        profileMap[p.id] = p.full_name || '';
      });

      // Map Plan Orders
      planOrders?.forEach((item: any) => {
        approvalRequests.push({
          id: item.id,
          type: 'plan_order',
          refNo: item.plan_number,
          status: item.status,
          description: `Supplier: ${item.suppliers?.name || 'Unknown'}`,
          createdAt: new Date(item.created_at),
          createdBy: item.created_by,
          creatorName: profileMap[item.created_by] || 'Unknown',
        });
      });

      // Map Sales Orders
      salesOrders?.forEach((item: any) => {
        approvalRequests.push({
          id: item.id,
          type: 'sales_order',
          refNo: item.sales_order_number,
          status: item.status,
          description: `Customer: ${item.customers?.name || 'Unknown'}`,
          createdAt: new Date(item.created_at),
          createdBy: item.created_by,
          creatorName: profileMap[item.created_by] || 'Unknown',
        });
      });

      // Map Adjustments
      adjustments?.forEach((item: any) => {
        approvalRequests.push({
          id: item.id,
          type: 'adjustment',
          refNo: item.adjustment_number,
          status: item.status,
          description: item.reason,
          createdAt: new Date(item.created_at),
          createdBy: item.created_by,
          creatorName: profileMap[item.created_by] || 'Unknown',
        });
      });

      // Sort by date descending
      approvalRequests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // Play sound if new requests (but not on initial load)
      if (!isInitialMount.current && approvalRequests.length > previousCountRef.current && previousCountRef.current >= 0) {
        playNotificationSound();
        toast.info(
          language === 'en' 
            ? `New approval request received!` 
            : `Permintaan approval baru diterima!`,
          { duration: 5000 }
        );
      }
      isInitialMount.current = false;
      previousCountRef.current = approvalRequests.length;

      setRequests(approvalRequests);
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!canViewApprovals) return;

    fetchPendingApprovals();

    // Setup realtime subscriptions
    const planOrderChannel = supabase
      .channel('approval-plan-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_order_headers' }, () => {
        fetchPendingApprovals();
      })
      .subscribe();

    const salesOrderChannel = supabase
      .channel('approval-sales-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_order_headers' }, () => {
        fetchPendingApprovals();
      })
      .subscribe();

    const adjustmentChannel = supabase
      .channel('approval-adjustments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_adjustments' }, () => {
        fetchPendingApprovals();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(planOrderChannel);
      supabase.removeChannel(salesOrderChannel);
      supabase.removeChannel(adjustmentChannel);
    };
  }, [canViewApprovals, language]);

  const handleRequestClick = (request: ApprovalRequest) => {
    switch (request.type) {
      case 'plan_order':
        navigate('/plan-order');
        break;
      case 'sales_order':
        navigate('/sales-order');
        break;
      case 'adjustment':
        navigate('/stock-adjustment');
        break;
    }
  };

  const getTypeIcon = (type: ApprovalRequest['type']) => {
    switch (type) {
      case 'plan_order':
        return <ClipboardList className="w-4 h-4" />;
      case 'sales_order':
        return <ClipboardList className="w-4 h-4" />;
      case 'adjustment':
        return <Package className="w-4 h-4" />;
    }
  };

  const getTypeLabel = (type: ApprovalRequest['type']) => {
    switch (type) {
      case 'plan_order':
        return 'Plan Order';
      case 'sales_order':
        return 'Sales Order';
      case 'adjustment':
        return 'Stock Adjustment';
    }
  };

  if (!canViewApprovals) return null;

  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-warning/20">
              <Bell className="w-5 h-5 text-warning" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {language === 'en' ? 'Approval Requests' : 'Permintaan Approval'}
                {requests.length > 0 && (
                  <Badge variant="destructive" className="animate-pulse">
                    {requests.length}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {language === 'en' 
                  ? 'Pending orders waiting for your approval' 
                  : 'Order yang menunggu persetujuan Anda'}
              </CardDescription>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={fetchPendingApprovals}
            disabled={loading}
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 text-success opacity-50" />
            <p className="text-sm font-medium">
              {language === 'en' ? 'All caught up!' : 'Semua sudah diproses!'}
            </p>
            <p className="text-xs mt-1">
              {language === 'en' ? 'No pending approval requests' : 'Tidak ada permintaan approval'}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[200px] pr-2">
            <div className="space-y-2">
              {requests.map((request) => (
                <div
                  key={`${request.type}_${request.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-background border border-warning/30 cursor-pointer hover:bg-warning/10 transition-colors"
                  onClick={() => handleRequestClick(request)}
                >
                  <div className="p-2 rounded-lg bg-warning/20 text-warning">
                    {getTypeIcon(request.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{request.refNo}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {getTypeLabel(request.type)}
                      </Badge>
                      {request.status === 'revision_requested' && (
                        <Badge variant="destructive" className="text-[10px] animate-pulse">
                          {language === 'en' ? 'Revision Request' : 'Minta Revisi'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{request.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        {format(request.createdAt, 'dd MMM yyyy HH:mm', { 
                          locale: language === 'id' ? idLocale : enUS 
                        })}
                      </span>
                      <span className="text-[10px] text-muted-foreground">•</span>
                      <span className="text-[10px] text-muted-foreground">
                        {language === 'en' ? 'by' : 'oleh'} {request.creatorName}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default ApprovalRequestNotification;
