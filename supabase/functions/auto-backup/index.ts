import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if auto backup is enabled
    const { data: config } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "auto_backup_config")
      .maybeSingle();

    const configValue = config?.value as Record<string, unknown> | null;
    if (!configValue?.enabled) {
      return new Response(JSON.stringify({ message: "Auto backup is disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tables to backup - SEMUA data transaksi & master
    const tables = [
      // Master Data
      "products", "categories", "units", "suppliers", "customers",
      // Plan & Sales Order
      "plan_order_headers", "plan_order_items",
      "sales_order_headers", "sales_order_items",
      // Proforma Invoice
      "proforma_invoices", "proforma_invoice_items",
      // Stock In / Out / Adjustment
      "stock_in_headers", "stock_in_items",
      "stock_out_headers", "stock_out_items",
      "stock_adjustments", "stock_adjustment_items",
      "inventory_batches", "stock_transactions",
      // Delivery / Kanban
      "delivery_requests", "delivery_orders", "delivery_comments",
      "delivery_checklists", "delivery_labels", "delivery_card_labels",
      // Chat K'talk
      "chat_messages", "chat_reactions",
      // Lainnya
      "attachments", "national_holidays",
      "profiles", "user_roles", "user_signatures",
      "audit_logs", "settings",
    ];

    const backupData: Record<string, unknown[]> = {};
    let totalRecords = 0;

    for (const table of tables) {
      const { data, error } = await supabase.from(table).select("*");
      if (!error && data) {
        backupData[table] = data;
        totalRecords += data.length;
      }
    }

    const exportPayload = {
      _meta: {
        app: "WMS Kemika",
        version: "1.0.0",
        type: "auto_backup",
        exported_at: new Date().toISOString(),
        tables,
        total_records: totalRecords,
      },
      data: backupData,
    };

    const fileName = `auto/backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const blob = new Blob([JSON.stringify(exportPayload)], { type: "application/json" });

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("backups")
      .upload(fileName, blob, { contentType: "application/json", upsert: false });

    if (uploadError) throw uploadError;

    // Clean up old backups (keep only 4 latest)
    const { data: files } = await supabase.storage
      .from("backups")
      .list("auto", { sortBy: { column: "created_at", order: "asc" } });

    if (files && files.length > 4) {
      const toDelete = files.slice(0, files.length - 4).map(f => `auto/${f.name}`);
      await supabase.storage.from("backups").remove(toDelete);
    }

    // Update last backup timestamp
    await supabase.from("settings").upsert({
      key: "auto_backup_config",
      value: { enabled: true, last_backup_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

    // Audit log
    await supabase.from("audit_logs").insert({
      action: "AUTO_BACKUP",
      module: "backup",
      ref_table: "settings",
      new_data: { file: fileName, total_records: totalRecords },
    });

    return new Response(JSON.stringify({ success: true, file: fileName, total_records: totalRecords }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Auto backup error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
