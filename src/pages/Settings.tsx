import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Loader2, Users, Bell, Database, Smartphone, Clock, CalendarDays, Receipt, Link2, Eye, EyeOff, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BackupRestore from '@/components/settings/BackupRestore';
import HolidayManager from '@/components/settings/HolidayManager';
import SalesPulseSyncMonitor from '@/components/settings/SalesPulseSyncMonitor';
import DeliveryTimeGuardSettings from '@/components/settings/DeliveryTimeGuardSettings';
import { PushNotificationToggle } from '@/components/settings/PushNotificationToggle';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { clearApiKeyCache } from '@/lib/arApSync';

interface SettingsData {
  allow_admin_approve: boolean;
  stock_alert_schedule: 'daily' | 'weekly' | 'monthly';
  materai_amount: number;
}

export default function SettingsPage() {
  const { language } = useLanguage();
  const { isSuperAdmin } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SettingsData>({
    allow_admin_approve: false,
    stock_alert_schedule: 'weekly',
    materai_amount: 10000,
  });

  // Access is already controlled by RouteGuard - this is additional safety
  const canModify = isSuperAdmin();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['allow_admin_approve', 'stock_alert_schedule', 'materai_amount']);

      if (error) throw error;

      const settingsMap: SettingsData = {
        allow_admin_approve: false,
        stock_alert_schedule: 'weekly',
        materai_amount: 10000,
      };

      data?.forEach(item => {
        if (item.key === 'allow_admin_approve') {
          let value = false;
          if (typeof item.value === 'boolean') {
            value = item.value;
          } else if (item.value === 'true') {
            value = true;
          } else if (typeof item.value === 'object' && item.value !== null && !Array.isArray(item.value)) {
            const objValue = item.value as Record<string, unknown>;
            value = objValue.value === true;
          }
          settingsMap.allow_admin_approve = value;
        }
        if (item.key === 'stock_alert_schedule') {
          const val = typeof item.value === 'string' ? item.value : 'weekly';
          if (['daily', 'weekly', 'monthly'].includes(val)) {
            settingsMap.stock_alert_schedule = val as 'daily' | 'weekly' | 'monthly';
          }
        }
        if (item.key === 'materai_amount') {
          settingsMap.materai_amount = typeof item.value === 'number' ? item.value : Number(item.value) || 10000;
        }
      });

      setSettings(settingsMap);
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error(language === 'en' ? 'Failed to load settings' : 'Gagal memuat pengaturan');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!canModify) {
      toast.error(language === 'en' ? 'Only super_admin can modify settings' : 'Hanya super_admin yang dapat mengubah pengaturan');
      return;
    }

    setSaving(true);
    try {
      // Update allow_admin_approve setting
      const { error } = await supabase
        .from('settings')
        .update({ 
          value: settings.allow_admin_approve,
          updated_at: new Date().toISOString()
        })
        .eq('key', 'allow_admin_approve');

      if (error) throw error;

      // Update stock_alert_schedule setting
      const { error: schedError } = await supabase
        .from('settings')
        .upsert({ 
          key: 'stock_alert_schedule',
          value: settings.stock_alert_schedule as unknown as any,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

      if (schedError) throw schedError;

      // Update materai_amount setting
      const { error: materaiError } = await supabase
        .from('settings')
        .upsert({ 
          key: 'materai_amount',
          value: settings.materai_amount as unknown as any,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

      if (materaiError) throw materaiError;

      // Update the cron schedule based on selected frequency
      const cronExpression = settings.stock_alert_schedule === 'daily' 
        ? '0 8 * * *'        // Every day at 08:00 UTC
        : settings.stock_alert_schedule === 'monthly'
        ? '0 8 1 * *'        // 1st of every month at 08:00 UTC
        : '0 8 * * 1';       // Every Monday at 08:00 UTC (default weekly)

      // Update cron job via edge function
      await supabase.functions.invoke('check-stock-alerts', {
        body: { action: 'update_schedule', cron_expression: cronExpression }
      });

      // Log the change
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        user_id: userData.user?.id,
        user_email: userData.user?.email,
        action: 'update',
        module: 'settings',
        ref_table: 'settings',
        ref_no: 'stock_alert_schedule',
        new_data: { 
          allow_admin_approve: settings.allow_admin_approve,
          stock_alert_schedule: settings.stock_alert_schedule,
        },
      });

      // Update cached schedule for client-side throttle
      localStorage.setItem('stock_alert_schedule', settings.stock_alert_schedule);
      // Reset last shown so next check uses new schedule
      localStorage.removeItem('stock_alert_last_shown');

      toast.success(language === 'en' ? 'Settings saved successfully' : 'Pengaturan berhasil disimpan');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(language === 'en' ? 'Failed to save settings' : 'Gagal menyimpan pengaturan');
    }
    setSaving(false);
  };

  // Access is controlled by RouteGuard - if user reaches here without permission,
  // they will be redirected to dashboard. No need for "Access Denied" screen.

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <SettingsIcon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">
              {language === 'en' ? 'Settings' : 'Pengaturan'}
            </h1>
            <p className="text-muted-foreground">
              {language === 'en' ? 'System configuration and preferences' : 'Konfigurasi dan preferensi sistem'}
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {language === 'en' ? 'Save Changes' : 'Simpan Perubahan'}
        </Button>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">
            <SettingsIcon className="w-4 h-4 mr-2" />
            Umum
          </TabsTrigger>
          <TabsTrigger value="holidays">
            <CalendarDays className="w-4 h-4 mr-2" />
            Hari Libur
          </TabsTrigger>
          <TabsTrigger value="delivery">
            <Clock className="w-4 h-4 mr-2" />
            Delivery
          </TabsTrigger>
          <TabsTrigger value="arap">
            <Link2 className="w-4 h-4 mr-2" />
            AR/AP
          </TabsTrigger>
          <TabsTrigger value="backup">
            <Database className="w-4 h-4 mr-2" />
            Backup & Restore
          </TabsTrigger>
          <TabsTrigger value="sales-pulse">
            <RefreshCw className="w-4 h-4 mr-2" />
            Sales Pulse
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid gap-6">
              {/* Approval Settings */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-success/10">
                      <Users className="w-5 h-5 text-success" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {language === 'en' ? 'Approval Settings' : 'Pengaturan Persetujuan'}
                      </CardTitle>
                      <CardDescription>
                        {language === 'en' 
                          ? 'Configure who can approve orders in the system'
                          : 'Konfigurasi siapa yang dapat menyetujui order dalam sistem'
                        }
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                    <div className="space-y-1">
                      <Label htmlFor="allow-admin-approve" className="text-base font-medium">
                        {language === 'en' ? 'Allow Admin to Approve Orders' : 'Izinkan Admin Menyetujui Order'}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {language === 'en' 
                          ? 'When enabled, users with "admin" role can approve Plan Orders and Sales Orders. By default, only super_admin can approve.'
                          : 'Jika diaktifkan, pengguna dengan role "admin" dapat menyetujui Plan Order dan Sales Order. Secara default, hanya super_admin yang dapat menyetujui.'
                        }
                      </p>
                    </div>
                    <Switch
                      id="allow-admin-approve"
                      checked={settings.allow_admin_approve}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, allow_admin_approve: checked }))}
                    />
                  </div>

                  <Separator />

                  <div className="rounded-lg bg-muted/50 p-4">
                    <h4 className="text-sm font-medium mb-2">
                      {language === 'en' ? 'Current Approval Permissions:' : 'Izin Persetujuan Saat Ini:'}
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-success" />
                        <strong>super_admin:</strong> {language === 'en' ? 'Can always approve' : 'Selalu dapat menyetujui'}
                      </li>
                      <li className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${settings.allow_admin_approve ? 'bg-success' : 'bg-muted-foreground'}`} />
                        <strong>admin:</strong> {settings.allow_admin_approve 
                          ? (language === 'en' ? 'Can approve (enabled)' : 'Dapat menyetujui (aktif)')
                          : (language === 'en' ? 'Cannot approve (disabled)' : 'Tidak dapat menyetujui (nonaktif)')
                        }
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                        <strong>{language === 'en' ? 'Other roles:' : 'Role lainnya:'}</strong> {language === 'en' ? 'Cannot approve' : 'Tidak dapat menyetujui'}
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Materai Settings */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Receipt className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {language === 'en' ? 'Stamp Duty (Materai)' : 'Biaya Materai'}
                      </CardTitle>
                      <CardDescription>
                        {language === 'en' 
                          ? 'Set stamp duty amount for Proforma Invoice'
                          : 'Atur nominal materai untuk Proforma Invoice'
                        }
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                    <div className="space-y-1">
                      <Label className="text-base font-medium">
                        {language === 'en' ? 'Materai Amount' : 'Nominal Materai'}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {language === 'en' 
                          ? 'Applied to non-government customers when total > Rp 5.000.000'
                          : 'Dikenakan untuk customer non-government jika total > Rp 5.000.000'
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Rp</span>
                      <input
                        type="number"
                        className="w-32 h-9 px-3 rounded-md border bg-background text-sm"
                        value={settings.materai_amount}
                        onChange={(e) => setSettings(prev => ({ ...prev, materai_amount: Number(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Smartphone className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {language === 'en' ? 'Push Notifications' : 'Push Notifikasi'}
                      </CardTitle>
                      <CardDescription>
                        {language === 'en' 
                          ? 'Receive notifications even when the browser is closed'
                          : 'Terima notifikasi walau browser tertutup'
                        }
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                    <div className="space-y-1">
                      <Label className="text-base font-medium">
                        Web Push Notification
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {language === 'en'
                          ? 'Get push notifications for K\'talk messages, approvals, and alerts'
                          : 'Dapatkan notifikasi push untuk pesan K\'talk, approval, dan peringatan'
                        }
                      </p>
                    </div>
                    <PushNotificationToggle />
                  </div>

                  <Separator />

                  <div className="rounded-lg bg-muted/50 p-4">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Bell className="w-4 h-4 text-primary" />
                      {language === 'en' ? 'Active Notification Types' : 'Jenis Notifikasi Aktif'}
                    </h4>
                    <div className="space-y-3">
                      {/* K'talk */}
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-primary uppercase tracking-wider">K'talk</p>
                        <ul className="text-sm text-muted-foreground space-y-0.5 ml-4">
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            Pesan baru (private & global)
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            Mention (@user) di chat
                          </li>
                        </ul>
                      </div>

                      {/* Approval Workflow */}
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-warning uppercase tracking-wider">Approval Workflow</p>
                        <ul className="text-sm text-muted-foreground space-y-0.5 ml-4">
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
                            Plan Order baru menunggu approval
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
                            Sales Order baru menunggu approval
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
                            Stock Adjustment menunggu persetujuan
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
                            Permintaan revisi dokumen
                          </li>
                        </ul>
                      </div>

                      {/* Approval Results */}
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-success uppercase tracking-wider">Hasil Approval</p>
                        <ul className="text-sm text-muted-foreground space-y-0.5 ml-4">
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                            Order disetujui (notifikasi ke pembuat)
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive flex-shrink-0" />
                            Order ditolak (notifikasi ke pembuat)
                          </li>
                        </ul>
                      </div>

                      {/* Delivery Board */}
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Delivery Board</p>
                        <ul className="text-sm text-muted-foreground space-y-0.5 ml-4">
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                            Card baru ditambahkan ke board
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                            Perpindahan status card (termasuk auto-delivered)
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                            Permintaan label Urgent/Cito
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                            Label Urgent/Cito disetujui
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                            Label Urgent/Cito ditolak
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Stock Alert Schedule */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-warning/10">
                      <Clock className="w-5 h-5 text-warning" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {language === 'en' ? 'Stock Alert Schedule' : 'Jadwal Peringatan Stok'}
                      </CardTitle>
                      <CardDescription>
                        {language === 'en' 
                          ? 'Set how often expired & low stock alerts appear'
                          : 'Atur seberapa sering peringatan expired & low stock muncul'
                        }
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                    <div className="space-y-1 flex-1 mr-4">
                      <Label className="text-base font-medium">
                        {language === 'en' ? 'Alert Frequency' : 'Frekuensi Peringatan'}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {language === 'en'
                          ? 'Controls how often expired/low stock notifications appear in-app and via push notification'
                          : 'Mengatur seberapa sering notifikasi expired/low stock muncul di aplikasi dan push notification'
                        }
                      </p>
                    </div>
                    <Select 
                      value={settings.stock_alert_schedule} 
                      onValueChange={(val) => setSettings(prev => ({ ...prev, stock_alert_schedule: val as 'daily' | 'weekly' | 'monthly' }))}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">
                          {language === 'en' ? 'Daily' : 'Harian'}
                        </SelectItem>
                        <SelectItem value="weekly">
                          {language === 'en' ? 'Weekly' : 'Mingguan'}
                        </SelectItem>
                        <SelectItem value="monthly">
                          {language === 'en' ? 'Monthly' : 'Bulanan'}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-lg bg-muted/50 p-4">
                    <h4 className="text-sm font-medium mb-2">
                      {language === 'en' ? 'Schedule Details:' : 'Detail Jadwal:'}
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${settings.stock_alert_schedule === 'daily' ? 'bg-success' : 'bg-muted-foreground'}`} />
                        <strong>{language === 'en' ? 'Daily:' : 'Harian:'}</strong> {language === 'en' ? 'Every day at 15:00 WIB' : 'Setiap hari pukul 15:00 WIB'}
                      </li>
                      <li className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${settings.stock_alert_schedule === 'weekly' ? 'bg-success' : 'bg-muted-foreground'}`} />
                        <strong>{language === 'en' ? 'Weekly:' : 'Mingguan:'}</strong> {language === 'en' ? 'Every Monday at 15:00 WIB' : 'Setiap Senin pukul 15:00 WIB'}
                      </li>
                      <li className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${settings.stock_alert_schedule === 'monthly' ? 'bg-success' : 'bg-muted-foreground'}`} />
                        <strong>{language === 'en' ? 'Monthly:' : 'Bulanan:'}</strong> {language === 'en' ? 'First day of month at 15:00 WIB' : 'Tanggal 1 setiap bulan pukul 15:00 WIB'}
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* System Info */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Bell className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {language === 'en' ? 'System Information' : 'Informasi Sistem'}
                      </CardTitle>
                      <CardDescription>
                        {language === 'en' 
                          ? 'Application version and system status'
                          : 'Versi aplikasi dan status sistem'
                        }
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {language === 'en' ? 'Application' : 'Aplikasi'}
                      </p>
                      <p className="font-semibold mt-1">WMS Kemika</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {language === 'en' ? 'Version' : 'Versi'}
                      </p>
                      <p className="font-semibold mt-1">1.0.0</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {language === 'en' ? 'Environment' : 'Lingkungan'}
                      </p>
                      <p className="font-semibold mt-1">Production</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {language === 'en' ? 'Status' : 'Status'}
                      </p>
                      <p className="font-semibold mt-1 text-success">
                        {language === 'en' ? 'Online' : 'Aktif'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="holidays">
          <HolidayManager />
        </TabsContent>

        <TabsContent value="delivery">
          <DeliveryTimeGuardSettings />
        </TabsContent>

        <TabsContent value="arap">
          <ArApSettings language={language} />
        </TabsContent>

        <TabsContent value="backup">
          <BackupRestore />
        </TabsContent>

        <TabsContent value="sales-pulse">
          <SalesPulseSyncMonitor />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================
// AR/AP Integration Settings Component
// ============================================
function ArApSettings({ language }: { language: string }) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchApiKey();
  }, []);

  const fetchApiKey = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'arap_api_key')
        .single();

      if (data?.value) {
        const key = typeof data.value === 'string' ? data.value : String(data.value);
        setApiKey(key);
        setHasKey(true);
      }
    } catch {
      // Key doesn't exist yet
    }
    setLoading(false);
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      toast.error('API Key tidak boleh kosong');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('settings')
        .upsert(
          { key: 'arap_api_key', value: apiKey.trim() as unknown as any, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );

      if (error) throw error;

      clearApiKeyCache();
      setHasKey(true);
      setTestResult(null);

      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        user_id: userData.user?.id,
        user_email: userData.user?.email,
        action: 'update',
        module: 'settings',
        ref_table: 'settings',
        ref_no: 'arap_api_key',
        new_data: { key_updated: true },
      });

      toast.success('API Key AR/AP berhasil disimpan');
    } catch (error) {
      console.error('Error saving AR/AP API key:', error);
      toast.error('Gagal menyimpan API Key');
    }
    setSaving(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    if (!apiKey || apiKey.trim() === '') {
      setTestResult({ success: false, message: 'API Key belum diisi. Silakan simpan API Key terlebih dahulu.' });
      setTesting(false);
      return;
    }

    try {
      const payload = {
        entity: 'customer' as const,
        action: 'upsert' as const,
        data: { customer_name: 'Test Connection WMS' }
      };

      const response = await fetch('https://qekexdtidnbspqzwerrd.supabase.co/functions/v1/wms-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      
      if (response.ok || response.status === 404) {
        setTestResult({ success: true, message: 'Koneksi berhasil! Endpoint AR/AP merespons dengan benar.' });
      } else if (response.status === 401 || response.status === 403) {
        setTestResult({ success: false, message: 'API Key tidak valid atau tidak memiliki akses.' });
      } else if (response.status === 400) {
        // 400 with validation error means endpoint is reachable but rejected payload
        const details = result.details ? JSON.stringify(result.details) : result.error;
        setTestResult({ success: false, message: `Endpoint merespons tapi menolak request: ${details}` });
      } else {
        setTestResult({ success: false, message: `HTTP ${response.status}: ${result.error || 'Endpoint tidak merespons'}` });
      }
    } catch (err) {
      setTestResult({ success: false, message: `Koneksi gagal: ${err instanceof Error ? err.message : 'Network error'}` });
    }
    setTesting(false);
  };

  const handleDeleteKey = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('settings')
        .delete()
        .eq('key', 'arap_api_key');

      if (error) throw error;

      clearApiKeyCache();
      setApiKey('');
      setHasKey(false);
      setTestResult(null);
      toast.success('API Key AR/AP berhasil dihapus');
    } catch (error) {
      console.error('Error deleting AR/AP API key:', error);
      toast.error('Gagal menghapus API Key');
    }
    setSaving(false);
  };

  const maskedKey = apiKey ? apiKey.slice(0, 8) + '••••••••' + apiKey.slice(-4) : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* API Key Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Link2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">
                Integrasi AR/AP System
              </CardTitle>
              <CardDescription>
                Konfigurasi koneksi ke sistem Accounts Receivable & Accounts Payable
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Connection Status */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
            <div className="space-y-1">
              <Label className="text-base font-medium">Status Koneksi</Label>
              <p className="text-sm text-muted-foreground">
                Endpoint: wms-sync
              </p>
            </div>
            <Badge variant={hasKey ? 'default' : 'secondary'} className={hasKey ? 'bg-success text-success-foreground' : ''}>
              {hasKey ? '● Terkonfigurasi' : '○ Belum Dikonfigurasi'}
            </Badge>
          </div>

          <Separator />

          {/* API Key Input */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder="Masukkan API Key AR/AP system..."
                  value={showKey ? apiKey : (hasKey && !apiKey ? maskedKey : apiKey)}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button onClick={handleSaveKey} disabled={saving || !apiKey.trim()}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span className="ml-2 hidden sm:inline">Simpan</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              API Key digunakan untuk autentikasi saat sinkronisasi data ke sistem AR/AP eksternal.
            </p>
          </div>

          <Separator />

          {/* Test & Delete buttons */}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !hasKey}
            >
              {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Test Koneksi
            </Button>
            {hasKey && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteKey}
                disabled={saving}
              >
                Hapus API Key
              </Button>
            )}
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`flex items-start gap-3 p-4 rounded-lg border ${testResult.success ? 'bg-success/5 border-success/30' : 'bg-destructive/5 border-destructive/30'}`}>
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-medium ${testResult.success ? 'text-success' : 'text-destructive'}`}>
                  {testResult.success ? 'Berhasil' : 'Gagal'}
                </p>
                <p className="text-sm text-muted-foreground">{testResult.message}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-Sync Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10">
              <RefreshCw className="w-5 h-5 text-warning" />
            </div>
            <div>
              <CardTitle className="text-lg">Auto-Sync Triggers</CardTitle>
              <CardDescription>
                Data akan otomatis disinkronisasi ke AR/AP system pada event berikut
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">Accounts Receivable (AR)</p>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                  Sales Order di-approve → Invoice AR dibuat otomatis
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                  Customer baru dibuat/diupdate → Data customer disinkronisasi
                </li>
              </ul>
            </div>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-warning uppercase tracking-wider">Accounts Payable (AP)</p>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
                  Plan Order di-approve → Invoice AP dibuat otomatis
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
                  Supplier baru dibuat/diupdate → Data vendor disinkronisasi
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
