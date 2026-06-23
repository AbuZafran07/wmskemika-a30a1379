import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const incoming = req.headers.get("x-cron-secret");
    if (!cronSecret || incoming !== cronSecret) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Read configurable hours from settings (fallback: 15:00 / 10:00 WIB)
    let onHoldHour = 15;
    let approvalHour = 10;
    try {
      const { data: cfg } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "delivery_time_guard_config")
        .maybeSingle();
      const v = (cfg?.value ?? {}) as { on_hold_hour?: number; approval_hour?: number };
      if (typeof v.on_hold_hour === "number" && v.on_hold_hour >= 0 && v.on_hold_hour <= 23) {
        onHoldHour = v.on_hold_hour;
      }
      if (typeof v.approval_hour === "number" && v.approval_hour >= 0 && v.approval_hour <= 23) {
        approvalHour = v.approval_hour;
      }
    } catch (_) {
      // ignore, use defaults
    }

    // Get current time in WIB (UTC+7)
    const now = new Date();
    const wibHour = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
    ).getHours();

    const body = await req.json().catch(() => ({}));
    const action =
      body.action ||
      (wibHour >= onHoldHour || wibHour < approvalHour
        ? "to_on_hold"
        : wibHour >= approvalHour
        ? "to_approval"
        : "none");

    let moved = 0;

    if (action === "to_on_hold") {
      // After 15:00 WIB: Move all cards from approval_delivery → on_hold_delivery
      const { data, error } = await supabase
        .from("delivery_requests")
        .update({
          board_status: "on_hold_delivery",
          moved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("board_status", "approval_delivery")
        .select("id");

      if (error) throw error;
      moved = data?.length || 0;

      // Log activity for each moved card
      if (data && data.length > 0) {
        const comments = data.map((card) => ({
          delivery_request_id: card.id,
          user_id: "00000000-0000-0000-0000-000000000000",
          message:
            `⏰ Card otomatis dipindahkan ke On Hold Delivery Order (setelah jam ${String(onHoldHour).padStart(2, "0")}:00 WIB)`,
          type: "activity",
        }));
        // Insert comments - ignore errors for system user
        await supabase.from("delivery_comments").insert(comments).select();
      }

      console.log(`[${onHoldHour}:00 WIB] Moved ${moved} cards to on_hold_delivery`);
    } else if (action === "to_approval") {
      // After 10:00 WIB: Move all cards from on_hold_delivery → approval_delivery
      const { data, error } = await supabase
        .from("delivery_requests")
        .update({
          board_status: "approval_delivery",
          moved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("board_status", "on_hold_delivery")
        .select("id");

      if (error) throw error;
      moved = data?.length || 0;

      if (data && data.length > 0) {
        const comments = data.map((card) => ({
          delivery_request_id: card.id,
          user_id: "00000000-0000-0000-0000-000000000000",
          message:
            `⏰ Card otomatis dipindahkan kembali ke Approval Delivery Order (setelah jam ${String(approvalHour).padStart(2, "0")}:00 WIB)`,
          type: "activity",
        }));
        await supabase.from("delivery_comments").insert(comments).select();
      }

      console.log(`[${approvalHour}:00 WIB] Moved ${moved} cards to approval_delivery`);
    }

    return new Response(
      JSON.stringify({ success: true, action, moved, on_hold_hour: onHoldHour, approval_hour: approvalHour }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
