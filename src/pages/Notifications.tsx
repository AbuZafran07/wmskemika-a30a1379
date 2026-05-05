import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, Calendar, Package, CheckCircle, FileText, ClipboardList, Volume2, VolumeX, Filter, RefreshCw, BellRing, BellOff, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNotifications, type Notification as NotificationType } from '@/hooks/useNotifications';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { id as idLocale, enUS } from 'date-fns/locale';
import { toast } from 'sonner';

export default function Notifications() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { 
    notifications, 
    loading, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    fetchNotifications,
    soundEnabled,
    toggleSound,
    pushEnabled,
    togglePush,
    requestPushPermission,
    playNotificationSound
  } = useNotifications();

  const [filterType, setFilterType] = useState<string>('all');
  const [filterRead, setFilterRead] = useState<string>('all');
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setPushPermission(Notification.permission);
    }
  }, []);

  const getNotificationIcon = (type: NotificationType['type']) => {
    switch (type) {
      case 'low_stock':
        return <Package className="w-5 h-5 text-warning" />;
      case 'expiring_soon':
        return <Calendar className="w-5 h-5 text-warning" />;
      case 'expired':
        return <AlertTriangle className="w-5 h-5 text-destructive" />;
      case 'approval_pending':
        return <ClipboardList className="w-5 h-5 text-info" />;
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-success" />;
      case 'cancelled':
        return <AlertTriangle className="w-5 h-5 text-destructive" />;
      case 'new_order':
        return <FileText className="w-5 h-5 text-primary" />;
      case 'urgent_request':
        return <AlertTriangle className="w-5 h-5 text-destructive" />;
      case 'urgent_approved':
        return <CheckCircle className="w-5 h-5 text-success" />;
      case 'urgent_rejected':
        return <AlertTriangle className="w-5 h-5 text-destructive" />;
      case 'card_comment':
        return <MessageSquare className="w-5 h-5 text-info" />;
      default:
        return <Bell className="w-5 h-5 text-info" />;
    }
  };

  const getTypeBadge = (type: NotificationType['type']) => {
    const variants: Record<string, { variant: 'default' | 'destructive' | 'outline' | 'secondary'; label: string }> = {
      low_stock: { variant: 'outline', label: language === 'en' ? 'Low Stock' : 'Stok Rendah' },
      expiring_soon: { variant: 'outline', label: language === 'en' ? 'Expiring' : 'Kadaluarsa' },
      expired: { variant: 'destructive', label: language === 'en' ? 'Expired' : 'Kadaluarsa' },
      approval_pending: { variant: 'default', label: language === 'en' ? 'Pending' : 'Menunggu' },
      approved: { variant: 'secondary', label: language === 'en' ? 'Approved' : 'Disetujui' },
      cancelled: { variant: 'destructive', label: language === 'en' ? 'Cancelled' : 'Dibatalkan' },
      new_order: { variant: 'default', label: language === 'en' ? 'New' : 'Baru' },
      urgent_request: { variant: 'destructive', label: 'Urgent/Cito' },
      urgent_approved: { variant: 'secondary', label: 'Urgent Disetujui' },
      urgent_rejected: { variant: 'destructive', label: 'Urgent Ditolak' },
      card_comment: { variant: 'secondary', label: language === 'en' ? 'Comment' : 'Komentar' },
      info: { variant: 'secondary', label: 'Info' },
    };
    const config = variants[type] || variants.info;
    return <Badge variant={config.variant} className="text-xs">{config.label}</Badge>;
  };

  const getNotificationBg = (type: NotificationType['type'], read: boolean) => {
    if (read) return 'bg-muted/30';
    switch (type) {
      case 'expired':
      case 'cancelled':
      case 'urgent_request':
      case 'urgent_rejected':
        return 'bg-destructive/10 border-destructive/20';
      case 'low_stock':
      case 'expiring_soon':
        return 'bg-warning/10 border-warning/20';
      case 'approved':
      case 'urgent_approved':
        return 'bg-success/10 border-success/20';
      case 'approval_pending':
      case 'new_order':
        return 'bg-primary/10 border-primary/20';
      default:
        return 'bg-info/10 border-info/20';
    }
  };

  const handleNotificationClick = (notif: NotificationType) => {
    markAsRead(notif.id);
    if (notif.type === 'low_stock') {
      navigate(notif.productId ? `/data-stock?productId=${notif.productId}` : '/data-stock');
    } else if (notif.type === 'expiring_soon' || notif.type === 'expired') {
      navigate(notif.productId ? `/reports/expiry?productId=${notif.productId}` : '/reports/expiry');
    } else if (notif.module === 'plan_order') {
      navigate(notif.refId ? `/plan-order?id=${notif.refId}` : '/plan-order');
    } else if (notif.module === 'sales_order') {
      navigate(notif.refId ? `/sales-order?id=${notif.refId}` : '/sales-order');
    } else if (notif.module === 'stock_adjustment') {
      navigate(notif.refId ? `/stock-adjustment?id=${notif.refId}` : '/stock-adjustment');
    } else if (notif.module === 'stock_in') {
      navigate(notif.refId ? `/stock-in?id=${notif.refId}` : '/stock-in');
    } else if (notif.module === 'stock_out') {
      navigate(notif.refId ? `/stock-out?id=${notif.refId}` : '/stock-out');
    } else if (notif.module === 'delivery' && notif.refId) {
      navigate(`/request-delivery?card=${notif.refId}`);
    } else if (notif.module === 'delivery') {
      navigate('/request-delivery');
    }
  };

  const filteredNotifications = notifications.filter(notif => {
    if (filterType !== 'all' && notif.type !== filterType) return false;
    if (filterRead === 'unread' && notif.read) return false;
    if (filterRead === 'read' && !notif.read) return false;
    return true;
  });

  const testSound = (type: 'critical' | 'warning' | 'info') => {
    playNotificationSound(type);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {language === 'en' ? 'Notifications' : 'Notifikasi'}
          </h1>
          <p className="text-muted-foreground">
            {language === 'en' 
              ? `${unreadCount} unread notifications` 
              : `${unreadCount} notifikasi belum dibaca`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => fetchNotifications()}
            disabled={loading}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
            {language === 'en' ? 'Refresh' : 'Segarkan'}
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              <CheckCircle className="w-4 h-4 mr-2" />
              {language === 'en' ? 'Mark all read' : 'Tandai semua dibaca'}
            </Button>
          )}
        </div>
      </div>

      {/* Notification Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sound Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              {language === 'en' ? 'Sound Settings' : 'Pengaturan Suara'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="sound-toggle">
                  {language === 'en' ? 'Enable sound alerts' : 'Aktifkan peringatan suara'}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {language === 'en' 
                    ? 'Play sound for important notifications'
                    : 'Mainkan suara untuk notifikasi penting'}
                </p>
              </div>
              <Switch 
                id="sound-toggle"
                checked={soundEnabled} 
                onCheckedChange={toggleSound}
              />
            </div>
            
            {soundEnabled && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <span className="text-sm text-muted-foreground mr-2">
                  {language === 'en' ? 'Test sounds:' : 'Tes suara:'}
                </span>
                <Button variant="outline" size="sm" onClick={() => testSound('critical')}>
                  <AlertTriangle className="w-4 h-4 mr-1 text-destructive" />
                  Critical
                </Button>
                <Button variant="outline" size="sm" onClick={() => testSound('warning')}>
                  <Calendar className="w-4 h-4 mr-1 text-warning" />
                  Warning
                </Button>
                <Button variant="outline" size="sm" onClick={() => testSound('info')}>
                  <Bell className="w-4 h-4 mr-1 text-info" />
                  Info
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Push Notification Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {pushEnabled ? <BellRing className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
              {language === 'en' ? 'Push Notifications' : 'Notifikasi Push'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="push-toggle">
                  {language === 'en' ? 'Enable browser notifications' : 'Aktifkan notifikasi browser'}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {language === 'en' 
                    ? 'Get alerts even when the app is in background'
                    : 'Dapatkan peringatan meski aplikasi di background'}
                </p>
              </div>
              <Switch 
                id="push-toggle"
                checked={pushEnabled} 
                onCheckedChange={togglePush}
              />
            </div>

            {pushPermission !== 'granted' && (
              <div className="pt-2 border-t">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={async () => {
                    const granted = await requestPushPermission();
                    if (granted) {
                      setPushPermission('granted');
                      toast.success(language === 'en' ? 'Push notifications enabled!' : 'Notifikasi push diaktifkan!');
                    } else {
                      toast.error(language === 'en' ? 'Permission denied' : 'Izin ditolak');
                    }
                  }}
                >
                  <BellRing className="w-4 h-4 mr-2" />
                  {pushPermission === 'denied' 
                    ? (language === 'en' ? 'Permission denied - check browser settings' : 'Izin ditolak - cek pengaturan browser')
                    : (language === 'en' ? 'Request permission' : 'Minta izin')}
                </Button>
                {pushPermission === 'default' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {language === 'en' 
                      ? 'You need to allow browser notifications to receive push alerts'
                      : 'Anda perlu mengizinkan notifikasi browser untuk menerima peringatan push'}
                  </p>
                )}
              </div>
            )}

            {pushPermission === 'granted' && pushEnabled && (
              <div className="pt-2 border-t">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    new window.Notification('🔔 Test Notification', {
                      body: language === 'en' ? 'Push notifications are working!' : 'Notifikasi push berfungsi!',
                      icon: '/logo-kemika.png',
                    });
                  }}
                >
                  <Bell className="w-4 h-4 mr-1" />
                  {language === 'en' ? 'Test push notification' : 'Tes notifikasi push'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {language === 'en' ? 'Filter:' : 'Filter:'}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">
                {language === 'en' ? 'Type:' : 'Tipe:'}
              </Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[160px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'en' ? 'All Types' : 'Semua Tipe'}</SelectItem>
                  <SelectItem value="expired">{language === 'en' ? 'Expired' : 'Kadaluarsa'}</SelectItem>
                  <SelectItem value="expiring_soon">{language === 'en' ? 'Expiring Soon' : 'Segera Kadaluarsa'}</SelectItem>
                  <SelectItem value="low_stock">{language === 'en' ? 'Low Stock' : 'Stok Rendah'}</SelectItem>
                  <SelectItem value="approval_pending">{language === 'en' ? 'Pending Approval' : 'Menunggu Persetujuan'}</SelectItem>
                  <SelectItem value="urgent_request">Urgent/Cito</SelectItem>
                  <SelectItem value="urgent_approved">{language === 'en' ? 'Urgent Approved' : 'Urgent Disetujui'}</SelectItem>
                  <SelectItem value="urgent_rejected">{language === 'en' ? 'Urgent Rejected' : 'Urgent Ditolak'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">
                {language === 'en' ? 'Status:' : 'Status:'}
              </Label>
              <Select value={filterRead} onValueChange={setFilterRead}>
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'en' ? 'All' : 'Semua'}</SelectItem>
                  <SelectItem value="unread">{language === 'en' ? 'Unread' : 'Belum Dibaca'}</SelectItem>
                  <SelectItem value="read">{language === 'en' ? 'Read' : 'Sudah Dibaca'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Badge variant="secondary">
              {filteredNotifications.length} {language === 'en' ? 'results' : 'hasil'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-5 h-5" />
            {language === 'en' ? 'All Notifications' : 'Semua Notifikasi'}
            <Badge variant="outline" className="ml-2">{notifications.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              {language === 'en' ? 'Loading notifications...' : 'Memuat notifikasi...'}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">
                {language === 'en' ? 'No notifications' : 'Tidak ada notifikasi'}
              </p>
              <p className="text-sm">
                {language === 'en' 
                  ? 'All caught up! Check back later.'
                  : 'Semua sudah terbaca! Cek kembali nanti.'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    'p-4 cursor-pointer hover:bg-muted/50 transition-colors border-l-4',
                    getNotificationBg(notif.type, notif.read)
                  )}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 mt-1">
                      {getNotificationIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={cn(
                            'text-sm',
                            !notif.read && 'font-semibold'
                          )}>
                            {notif.title}
                          </p>
                          {getTypeBadge(notif.type)}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {format(notif.createdAt, 'dd MMM yyyy HH:mm', {
                              locale: language === 'id' ? idLocale : enUS
                            })}
                          </span>
                          {!notif.read && (
                            <div className="w-2 h-2 bg-primary rounded-full" />
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {notif.message}
                      </p>
                      {notif.refNo && (
                        <div className="mt-2">
                          <Badge variant="outline" className="text-xs">
                            {notif.refNo}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Real-time indicator */}
      <div className="text-center">
        <Badge variant="outline" className="gap-2">
          <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
          {language === 'en' 
            ? 'Real-time updates enabled' 
            : 'Pembaruan real-time aktif'}
        </Badge>
      </div>
    </div>
  );
}
