import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SALES_PULSE_BASE_URL = "https://ggzttrxpkbpjbymrzpsg.supabase.co/functions/v1";

type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

function jsonResponse(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeText(value: unknown, maxLength = 255) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function sanitizeNullableText(value: unknown, maxLength = 255) {
  const sanitized = sanitizeText(value, maxLength);
  return sanitized || null;
}

function sanitizeNullableNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizePositiveInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized >= 1 ? normalized : null;
}

// WMS Integration Guide v4: customer_po hanya boleh karakter aman.
// Whitelist: A-Z a-z 0-9 spasi dan - _ . / \ # ( )
// Tanpa batas maksimum panjang (sesuai permintaan internal).
function sanitizeCustomerPo(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/[^A-Za-z0-9 \-_.\/\\#()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function normalizeReferenceList(payload: unknown, includeSelectedReference: string | null) {
  const entries = Array.isArray((payload as Record<string, unknown>)?.data)
    ? ((payload as Record<string, unknown>).data as Array<Record<string, unknown>>)
    : [];

  const filtered = entries.filter((item) => {
    const referenceNumber = sanitizeText(item?.reference_number, 100);
    const stage = sanitizeText(item?.stage, 50).toLowerCase();
    const expectedCloseDate = sanitizeText(item?.expected_close_date, 20);
    const isProtectedSelected = includeSelectedReference && referenceNumber === includeSelectedReference;

    if (isProtectedSelected) return true;
    if (!referenceNumber) return false;
    if (stage !== "po_secured") return true;
    if (!expectedCloseDate) return true;

    return expectedCloseDate < "2026-04-20";
  });

  const seen = new Set<string>();
  return filtered.filter((item) => {
    const referenceNumber = sanitizeText(item?.reference_number, 100);
    if (!referenceNumber || seen.has(referenceNumber)) return false;
    seen.add(referenceNumber);
    return true;
  });
}

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const salesPulseApiKey = Deno.env.get("SALES_PULSE_API_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse({ error: "Backend environment is not configured" }, 500);
    }

    if (!salesPulseApiKey) {
      return jsonResponse({ error: "SALES_PULSE_API_KEY is not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      console.error("[sales-pulse-sync] auth failed:", userError?.message);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userId = userData.user.id;
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = req.method === "GET" ? {} : await parseBody(req);
    const action = req.method === "GET"
      ? sanitizeText(new URL(req.url).searchParams.get("action") || "")
      : sanitizeText(body.action || "");

    if (!action) {
      return jsonResponse({ error: "Missing action" }, 400);
    }

    // Authorization: enforce role-based access for Sales Pulse sync actions
    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (roleError) {
      return jsonResponse({ error: "Failed to verify permissions" }, 500);
    }

    const userRoles = new Set((roleRows || []).map((r: { role: string }) => r.role));
    const READ_ROLES = new Set(["super_admin", "admin", "sales", "finance", "purchasing"]);
    const WRITE_SO_ROLES = new Set(["super_admin", "admin", "sales", "finance"]);
    const MASTER_DATA_ROLES = new Set(["super_admin", "admin", "purchasing", "finance"]);

    const hasAny = (allowed: Set<string>) => {
      for (const r of userRoles) if (allowed.has(r)) return true;
      return false;
    };

    const actionRoleMap: Record<string, Set<string>> = {
      "list-open-references": READ_ROLES,
      "wms-so-approved": WRITE_SO_ROLES,
      "wms-so-updated": WRITE_SO_ROLES,
      "wms-so-cancelled": WRITE_SO_ROLES,
      "wms-customer-upsert": MASTER_DATA_ROLES,
      "wms-product-upsert": MASTER_DATA_ROLES,
    };

    const allowedForAction = actionRoleMap[action];
    if (!allowedForAction || !hasAny(allowedForAction)) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    if (action === "list-open-references") {
      const url = new URL(`${SALES_PULSE_BASE_URL}/list-open-references`);
      const incomingUrl = new URL(req.url);
      const search = sanitizeText((req.method === "GET" ? incomingUrl.searchParams.get("search") : body.search) || "", 100);
      const segment = sanitizeText((req.method === "GET" ? incomingUrl.searchParams.get("segment") : body.segment) || "", 20);
      const includeSelectedReference = sanitizeNullableText(
        req.method === "GET" ? incomingUrl.searchParams.get("include_selected_reference") : body.include_selected_reference,
        100,
      );
      const rawLimit = req.method === "GET" ? incomingUrl.searchParams.get("limit") : body.limit;
      const limit = rawLimit === null || rawLimit === undefined || rawLimit === ""
        ? null
        : Number(rawLimit);

      if (search) url.searchParams.set("search", search);
      if (segment) url.searchParams.set("segment", segment);
      if (Number.isFinite(limit)) {
        url.searchParams.set("limit", String(Math.min(Math.max(Number(limit), 1), 5000)));
      }

      const { data: logRow } = await adminClient
        .from("sales_pulse_sync_logs")
        .insert({
          endpoint: "/list-open-references",
          http_method: "GET",
          direction: "sales_pulse_to_wms",
          status: "pending",
          request_payload: {
            search: search || null,
            segment: segment || null,
            limit,
            include_selected_reference: includeSelectedReference,
          },
          triggered_by: userId,
        })
        .select("id")
        .single();

      const upstream = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "X-WMS-API-Key": salesPulseApiKey,
        },
      });

      const responsePayload = await upstream.json().catch(() => ({ error: "Invalid JSON response" }));
      const normalizedData = upstream.ok
        ? normalizeReferenceList(responsePayload, includeSelectedReference)
        : null;
      const filteredResponsePayload = upstream.ok
        ? {
            ...(responsePayload as Record<string, unknown>),
            count: normalizedData?.length ?? 0,
            data: normalizedData,
          }
        : responsePayload;

      if (logRow?.id) {
        await adminClient
          .from("sales_pulse_sync_logs")
          .update({
            status: upstream.ok ? "success" : "failed",
            status_code: upstream.status,
            response_payload: filteredResponsePayload,
            error_message: upstream.ok ? null : sanitizeText((responsePayload as Record<string, unknown>)?.error || `HTTP ${upstream.status}`, 500),
          })
          .eq("id", logRow.id);
      }

      return jsonResponse(filteredResponsePayload, upstream.status);
    }

    if (action === "wms-so-approved") {
      const referenceNumber = sanitizeText(body.reference_number, 100);
      const soNumber = sanitizeText(body.so_number, 100);
      const soDate = sanitizeText(body.so_date, 20);
      const customerName = sanitizeText(body.customer_name, 255) || null;
      const salesOrderId = sanitizeText(body.sales_order_id, 100) || null;
      const customerPo = sanitizeCustomerPo(body.customer_po);
      const totalValueRaw = Number(body.total_value);

      if (!referenceNumber || !soNumber || !soDate || !Number.isFinite(totalValueRaw)) {
        return jsonResponse({ error: "reference_number, so_number, so_date, and total_value are required" }, 400);
      }

      const requestPayload = {
        reference_number: referenceNumber,
        so_number: soNumber,
        so_date: soDate,
        total_value: Math.round(totalValueRaw),
        customer_name: customerName,
        ...(customerPo ? { customer_po: customerPo } : {}),
        items: Array.isArray(body.items)
          ? body.items
              .map((item) => ({
                sku: sanitizeNullableText(item?.sku, 100),
                product_name: sanitizeText(item?.product_name, 255),
                category: sanitizeNullableText(item?.category, 100),
                unit: sanitizeNullableText(item?.unit, 50),
                qty: sanitizePositiveInteger(item?.qty),
                price_per_unit: sanitizeNullableNumber(item?.price_per_unit),
                other_cost: sanitizeNullableNumber(item?.other_cost) ?? 0,
              }))
              .filter((item) => item.product_name && item.qty !== null && item.price_per_unit !== null)
          : undefined,
      };

      const { data: logRow, error: logError } = await adminClient
        .from("sales_pulse_sync_logs")
        .insert({
          sales_order_id: salesOrderId || null,
          reference_number: referenceNumber,
          endpoint: "/wms-so-approved",
          http_method: "POST",
          direction: "wms_to_sales_pulse",
          status: "pending",
          request_payload: requestPayload,
          triggered_by: userId,
        })
        .select("id")
        .single();

      if (logError) {
        console.error("Failed to create Sales Pulse sync log:", logError);
      }

      const upstream = await fetch(`${SALES_PULSE_BASE_URL}/wms-so-approved`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-WMS-API-Key": salesPulseApiKey,
        },
        body: JSON.stringify(requestPayload),
      });

      const responsePayload = await upstream.json().catch(() => ({ error: "Invalid JSON response" }));
      const syncStatus = upstream.ok ? "success" : "failed";
      const errorMessage = upstream.ok
        ? null
        : sanitizeText((responsePayload as Record<string, unknown>)?.error || (responsePayload as Record<string, unknown>)?.reason || `HTTP ${upstream.status}`, 500);

      if (logRow?.id) {
        const { error: updateError } = await adminClient
          .from("sales_pulse_sync_logs")
          .update({
            status: syncStatus,
            status_code: upstream.status,
            response_payload: responsePayload,
            error_message: errorMessage,
          })
          .eq("id", logRow.id);

        if (updateError) {
          console.error("Failed to update Sales Pulse sync log:", updateError);
        }
      }

      return jsonResponse(responsePayload, upstream.status);
    }

    if (action === "wms-so-updated" || action === "wms-so-cancelled") {
      const isCancelled = action === "wms-so-cancelled";
      const endpoint = isCancelled ? "/wms-so-cancelled" : "/wms-so-updated";

      const referenceNumber = sanitizeNullableText(body.reference_number, 100);
      const soNumber = sanitizeText(body.so_number, 100);
      const salesOrderId = sanitizeText(body.sales_order_id, 100) || null;

      if (!soNumber) {
        return jsonResponse({ error: "so_number is required" }, 400);
      }

      let requestPayload: Record<string, unknown>;

      if (isCancelled) {
        const cancelledAt = sanitizeNullableText(body.cancelled_at, 40) || new Date().toISOString();
        const reason = sanitizeNullableText(body.reason, 500);
        requestPayload = {
          so_number: soNumber,
          ...(referenceNumber ? { reference_number: referenceNumber } : {}),
          cancelled_at: cancelledAt,
          ...(reason ? { reason } : {}),
        };
      } else {
        const soDate = sanitizeNullableText(body.so_date, 20);
        const customerName = sanitizeNullableText(body.customer_name, 255);
        const customerPo = sanitizeCustomerPo(body.customer_po);
        const totalValueRaw = body.total_value === null || body.total_value === undefined || body.total_value === ""
          ? null
          : Number(body.total_value);
        const items = Array.isArray(body.items)
          ? body.items
              .map((item) => ({
                sku: sanitizeNullableText(item?.sku, 100),
                product_name: sanitizeText(item?.product_name, 255),
                category: sanitizeNullableText(item?.category, 100),
                unit: sanitizeNullableText(item?.unit, 50),
                qty: sanitizePositiveInteger(item?.qty),
                price_per_unit: sanitizeNullableNumber(item?.price_per_unit),
                other_cost: sanitizeNullableNumber(item?.other_cost) ?? 0,
              }))
              .filter((item) => item.product_name && item.qty !== null && item.price_per_unit !== null)
          : null;

        // Hanya kirim field yang ada nilainya — backend Sales Pulse tidak akan overwrite field kosong
        requestPayload = {
          so_number: soNumber,
          ...(referenceNumber ? { reference_number: referenceNumber } : {}),
          ...(soDate ? { so_date: soDate } : {}),
          ...(customerName ? { customer_name: customerName } : {}),
          ...(customerPo ? { customer_po: customerPo } : {}),
          ...(totalValueRaw !== null && Number.isFinite(totalValueRaw)
            ? { total_value: Math.round(totalValueRaw) }
            : {}),
          ...(items && items.length > 0 ? { items } : {}),
        };
      }

      const { data: logRow, error: logError } = await adminClient
        .from("sales_pulse_sync_logs")
        .insert({
          sales_order_id: salesOrderId || null,
          reference_number: referenceNumber || null,
          endpoint,
          http_method: "POST",
          direction: "wms_to_sales_pulse",
          status: "pending",
          request_payload: requestPayload,
          triggered_by: userId,
        })
        .select("id")
        .single();

      if (logError) {
        console.error("Failed to create Sales Pulse sync log:", logError);
      }

      const upstream = await fetch(`${SALES_PULSE_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-WMS-API-Key": salesPulseApiKey,
        },
        body: JSON.stringify(requestPayload),
      });

      const responsePayload = await upstream.json().catch(() => ({ error: "Invalid JSON response" }));
      const syncStatus = upstream.ok ? "success" : "failed";
      const errorMessage = upstream.ok
        ? null
        : sanitizeText((responsePayload as Record<string, unknown>)?.error || (responsePayload as Record<string, unknown>)?.reason || `HTTP ${upstream.status}`, 500);

      if (logRow?.id) {
        const { error: updateError } = await adminClient
          .from("sales_pulse_sync_logs")
          .update({
            status: syncStatus,
            status_code: upstream.status,
            response_payload: responsePayload,
            error_message: errorMessage,
          })
          .eq("id", logRow.id);

        if (updateError) {
          console.error("Failed to update Sales Pulse sync log:", updateError);
        }
      }

      return jsonResponse(responsePayload, upstream.status);
    }

    if (action === "wms-customer-upsert" || action === "wms-product-upsert") {
      const isCustomerSync = action === "wms-customer-upsert";
      const endpoint = isCustomerSync ? "/wms-customer-upsert" : "/wms-product-upsert";

      // Spec Sales Pulse v2.0 — hanya kirim field yang didukung.
      // Field lain (barcode, description, address, npwp, dll) di-drop di sisi WMS untuk hemat bandwidth.
      let requestPayload: Record<string, unknown>;

      if (isCustomerSync) {
        const code = sanitizeText(body.code, 50);
        const name = sanitizeText(body.name, 255);
        const pic = sanitizeNullableText(body.pic, 255);
        const phone = sanitizeNullableText(body.phone, 50);
        const email = sanitizeNullableText(body.email, 255);
        const city = sanitizeNullableText(body.city, 100);
        const isActive = typeof body.is_active === "boolean" ? body.is_active : true;
        // customer_type WMS dikirim apa adanya — Sales Pulse yang melakukan mapping ke segment
        const customerType = sanitizeNullableText(body.customer_type, 50);

        requestPayload = {
          code,
          name,
          is_active: isActive,
          ...(customerType ? { customer_type: customerType } : {}),
          ...(pic ? { pic } : {}),
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
          ...(city ? { city } : {}),
        };
      } else {
        const sku = sanitizeText(body.sku, 100);
        const name = sanitizeText(body.name, 255);
        const sellingPrice = sanitizeNullableNumber(body.selling_price);
        const purchasePrice = sanitizeNullableNumber(body.purchase_price);
        const unit = sanitizeNullableText(body.unit, 50);
        const category = sanitizeNullableText(body.category, 100);
        const isActive = typeof body.is_active === "boolean" ? body.is_active : true;

        requestPayload = {
          sku,
          name,
          is_active: isActive,
          ...(sellingPrice !== null ? { selling_price: sellingPrice } : {}),
          ...(purchasePrice !== null ? { purchase_price: purchasePrice } : {}),
          ...(unit ? { unit } : {}),
          ...(category ? { category } : {}),
        };
      }

      if ((!isCustomerSync && !(requestPayload as { sku: string }).sku) || !requestPayload.name || (isCustomerSync && !(requestPayload as { code: string }).code)) {
        return jsonResponse({
          error: isCustomerSync
            ? "code and name are required"
            : "sku and name are required",
        }, 400);
      }

      const referenceNumber = isCustomerSync
        ? (requestPayload as { code: string }).code
        : (requestPayload as { sku: string }).sku;

      const { data: logRow, error: logError } = await adminClient
        .from("sales_pulse_sync_logs")
        .insert({
          reference_number: referenceNumber,
          endpoint,
          http_method: "POST",
          direction: "wms_to_sales_pulse",
          status: "pending",
          request_payload: requestPayload,
          triggered_by: userId,
        })
        .select("id")
        .single();

      if (logError) {
        console.error("Failed to create Sales Pulse master sync log:", logError);
      }

      const upstream = await fetch(`${SALES_PULSE_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-WMS-API-Key": salesPulseApiKey,
        },
        body: JSON.stringify(requestPayload),
      });

      const responsePayload = await upstream.json().catch(() => ({ error: "Invalid JSON response" }));
      const syncStatus = upstream.ok ? "success" : "failed";
      const errorMessage = upstream.ok
        ? null
        : sanitizeText((responsePayload as Record<string, unknown>)?.error || (responsePayload as Record<string, unknown>)?.reason || `HTTP ${upstream.status}`, 500);

      if (logRow?.id) {
        const { error: updateError } = await adminClient
          .from("sales_pulse_sync_logs")
          .update({
            status: syncStatus,
            status_code: upstream.status,
            response_payload: responsePayload,
            error_message: errorMessage,
          })
          .eq("id", logRow.id);

        if (updateError) {
          console.error("Failed to update Sales Pulse master sync log:", updateError);
        }
      }

      return jsonResponse(responsePayload, upstream.status);
    }

    return jsonResponse({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("Sales Pulse sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
