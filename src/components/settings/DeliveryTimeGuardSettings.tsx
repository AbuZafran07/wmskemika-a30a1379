import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Clock, Loader2, Save } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

interface Config {
  on_hold_hour: number;
  approval_hour: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function DeliveryTimeGuardSettings() {
  const { isSuperAdmin } = usePermissions();
  const canModify = isSuperAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<Config>({ on_hold_hour: 15, approval_hour: 10 });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'delivery_time_guard_config')
          .maybeSingle();
        const v = (data?.value ?? {}) as Partial<Config>;
        setConfig({
          on_hold_hour: typeof v.on_hold_hour === 'number' ? v.on_hold_hour : 15,
          approval_hour: typeof v.approval_hour === 'number' ? v.approval_hour : 10,
        });
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!canModify) {
      toast.error('Hanya super_admin yang dapat mengubah pengaturan');
      return;
    }
    if (config.on_hold_hour === config.approval_hour) {
      toast.error('Jam On Hold dan Approval tidak boleh sama');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('settings')
        .upsert(
          {
            key: 'delivery_time_guard_config',
            value: config as unknown as any,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );
      if (error) throw error;

      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        user_id: userData.user?.id,
        user_email: userData.user?.email,
        action: 'update',
        module: 'settings',
        ref_table: 'settings',
        ref_no: 'delivery_time_guard_config',
        new_data: config as unknown as any,
      });

      toast.success('Pengaturan jadwal Delivery berhasil disimpan');
    } catch (e) {
      console.error(e);
      toast.error('Gagal menyimpan pengaturan');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00 WIB`;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10">
              <Clock className="w-5 h-5 text-warning" />
            </div>
            <div>
              <CardTitle className="text-lg">Jadwal Auto-Move Delivery Board</CardTitle>
              <CardDescription>
                Atur jam otomatis perpindahan card antara Approval Delivery Order dan On Hold Delivery Order.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 rounded-lg border bg-card space-y-2">
              <Label className="text-base font-medium">Jam pindah ke On Hold</Label>
              <p className="text-xs text-muted-foreground">
                Setelah jam ini, semua card di kolom <strong>Approval Delivery Order</strong> akan dipindahkan otomatis ke <strong>On Hold Delivery Order</strong>.
              </p>
              <Select
                value={String(config.on_hold_hour)}
                onValueChange={(v) => setConfig((c) => ({ ...c, on_hold_hour: Number(v) }))}
                disabled={!canModify}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {fmt(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-4 rounded-lg border bg-card space-y-2">
              <Label className="text-base font-medium">Jam kembali ke Approval</Label>
              <p className="text-xs text-muted-foreground">
                Setelah jam ini di pagi berikutnya, semua card di <strong>On Hold Delivery Order</strong> akan dikembalikan ke <strong>Approval Delivery Order</strong>.
              </p>
              <Select
                value={String(config.approval_hour)}
                onValueChange={(v) => setConfig((c) => ({ ...c, approval_hour: Number(v) }))}
                disabled={!canModify}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {fmt(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-1">
            <p>
              <strong>Ringkasan:</strong> Card aktif di kolom <em>Approval Delivery Order</em> dari jam{' '}
              <strong>{fmt(config.approval_hour)}</strong> sampai <strong>{fmt(config.on_hold_hour)}</strong>.
            </p>
            <p className="text-muted-foreground text-xs">
              Catatan: perpindahan dijalankan oleh cron job per jam. Perubahan berlaku pada eksekusi cron berikutnya tanpa perlu deploy ulang.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || !canModify}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Simpan Perubahan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
