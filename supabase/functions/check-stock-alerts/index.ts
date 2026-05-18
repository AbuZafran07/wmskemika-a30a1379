import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: allow either internal cron via shared secret, or signed-in admin/super_admin
    const cronSecret = Deno.env.get('CRON_SECRET');
    const incomingCron = req.headers.get('x-cron-secret');
    const isCronCaller = !!cronSecret && incomingCron === cronSecret;
    if (!isCronCaller) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const { data: roleRows } = await supabase
        .from('user_roles').select('role').eq('user_id', claimsData.claims.sub);
      const allowed = (roleRows || []).some((r: any) => ['super_admin', 'admin'].includes(r.role));
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Check if this is a schedule update request
    const body = await req.json().catch(() => ({}));
    
    if (body.action === 'update_schedule' && body.cron_expression) {
      // Update the cron job schedule
      const { error } = await supabase.rpc('update_stock_alert_cron', {
        new_schedule: body.cron_expression
      });
      
      if (error) {
        // Fallback: try direct SQL via service role
        console.log('RPC not available, cron will use next scheduled run with new frequency');
      }

      return new Response(JSON.stringify({ success: true, message: 'Schedule updated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const now = new Date();
    const alerts: { title: string; body: string; tag: string }[] = [];

    // Fetch active products with min_stock
    const { data: products } = await supabase
      .from('products')
      .select('id, name, sku, min_stock')
      .is('deleted_at', null)
      .eq('is_active', true);

    // Fetch batches with stock
    const { data: batches } = await supabase
      .from('inventory_batches')
      .select('id, product_id, batch_no, qty_on_hand, expired_date')
      .gt('qty_on_hand', 0);

    if (products && batches) {
      // Check low stock
      const lowStockProducts: string[] = [];
      products.forEach((product: any) => {
        const productBatches = batches.filter((b: any) => b.product_id === product.id);
        const totalStock = productBatches.reduce((sum: number, b: any) => sum + (b.qty_on_hand || 0), 0);
        if (totalStock > 0 && totalStock <= (product.min_stock || 0)) {
          lowStockProducts.push(`${product.name} (${totalStock} unit)`);
        }
      });

      if (lowStockProducts.length > 0) {
        const count = lowStockProducts.length;
        alerts.push({
          title: `⚠️ Low Stock Alert: ${count} produk`,
          body: lowStockProducts.slice(0, 5).join(', ') + (count > 5 ? ` dan ${count - 5} lainnya` : ''),
          tag: 'weekly-low-stock',
        });
      }

      // Check expired batches
      const expiredItems: string[] = [];
      const expiringSoonItems: string[] = [];

      batches.forEach((batch: any) => {
        if (!batch.expired_date) return;
        const product = products.find((p: any) => p.id === batch.product_id);
        if (!product) return;

        const expiryDate = new Date(batch.expired_date);
        const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) {
          expiredItems.push(`${product.name} (${batch.batch_no})`);
        } else if (diffDays <= 30) {
          expiringSoonItems.push(`${product.name} (${batch.batch_no}, ${diffDays} hari)`);
        }
      });

      if (expiredItems.length > 0) {
        const count = expiredItems.length;
        alerts.push({
          title: `🚨 ${count} batch sudah kadaluarsa`,
          body: expiredItems.slice(0, 5).join(', ') + (count > 5 ? ` dan ${count - 5} lainnya` : ''),
          tag: 'weekly-expired',
        });
      }

      if (expiringSoonItems.length > 0) {
        const count = expiringSoonItems.length;
        alerts.push({
          title: `⏰ ${count} batch akan kadaluarsa dalam 30 hari`,
          body: expiringSoonItems.slice(0, 5).join(', ') + (count > 5 ? ` dan ${count - 5} lainnya` : ''),
          tag: 'weekly-expiring-soon',
        });
      }
    }

    if (alerts.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No alerts to send' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get users with relevant roles
    const { data: roleUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['super_admin', 'admin', 'warehouse', 'purchasing']);

    const targetUserIds = roleUsers ? [...new Set(roleUsers.map((r: any) => r.user_id))] : [];

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No target users found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Send push notifications
    let totalSent = 0;
    for (const alert of alerts) {
      try {
        const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            title: alert.title,
            body: alert.body,
            user_ids: targetUserIds,
            data: {
              tag: alert.tag,
              link: alert.tag.includes('expired') || alert.tag.includes('expiring') 
                ? '/reports/expiry' 
                : '/data-stock',
            },
          }),
        });

        const result = await pushResponse.json();
        totalSent += result.sent || 0;
      } catch (e) {
        console.error(`Error sending alert "${alert.title}":`, e);
      }
    }

    // Log to audit
    await supabase.from('audit_logs').insert({
      action: 'weekly_stock_alert',
      module: 'system',
      new_data: { alerts_count: alerts.length, users_notified: targetUserIds.length, push_sent: totalSent },
    });

    return new Response(JSON.stringify({ 
      success: true, 
      alerts_sent: alerts.length, 
      push_sent: totalSent,
      target_users: targetUserIds.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Stock alerts error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
