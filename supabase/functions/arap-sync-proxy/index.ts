import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ARAP_ENDPOINT =
  "https://qekexdtidnbspqzwerrd.supabase.co/functions/v1/wms-sync";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ---- Auth: validate user JWT ----
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const userId = userData.user.id;

    // ---- Role check (admin / super_admin / sales / warehouse / purchasing / finance) ----
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roles, error: rolesErr } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesErr) {
      return new Response(
        JSON.stringify({ success: false, error: "Role check failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const allowed = new Set([
      "super_admin",
      "admin",
      "sales",
      "purchasing",
      "warehouse",
      "finance",
    ]);
    const ok = (roles || []).some((r: any) => allowed.has(r.role));
    if (!ok) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Validate body ----
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { entity, action, data } = body as {
      entity?: string;
      action?: string;
      data?: unknown;
    };
    const allowedEntities = new Set([
      "customer",
      "vendor",
      "sales_order",
      "plan_order",
    ]);
    const allowedActions = new Set(["upsert", "sync_batch"]);
    if (!entity || !allowedEntities.has(entity)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid entity" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!action || !allowedActions.has(action)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Read server-side secret ----
    const apiKey = Deno.env.get("ARAP_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "ARAP_API_KEY not configured on server",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Forward to AR/AP ----
    const upstream = await fetch(ARAP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ entity, action, data }),
    });
    const result = await upstream.json().catch(() => ({}));
    return new Response(JSON.stringify(result), {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[arap-sync-proxy] error:", message);
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});