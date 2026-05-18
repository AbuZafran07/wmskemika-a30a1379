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

    // Get current time in WIB (UTC+7)
    const now = new Date();
    const wibHour = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
    ).getHours();

    const body = await req.json().catch(() => ({}));
    const action = body.action || (wibHour >= 15 || wibHour < 10 ? "to_on_hold" : wibHour >= 10 ? "to_approval" : "none");

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
            "⏰ Card otomatis dipindahkan ke On Hold Delivery Order (setelah jam 15:00 WIB)",
          type: "activity",
        }));
        // Insert comments - ignore errors for system user
        await supabase.from("delivery_comments").insert(comments).select();
      }

      console.log(`[15:00 WIB] Moved ${moved} cards to on_hold_delivery`);
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
            "⏰ Card otomatis dipindahkan kembali ke Approval Delivery Order (setelah jam 10:00 WIB)",
          type: "activity",
        }));
        await supabase.from("delivery_comments").insert(comments).select();
      }

      console.log(`[10:00 WIB] Moved ${moved} cards to approval_delivery`);
    }

    return new Response(
      JSON.stringify({ success: true, action, moved }),
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
