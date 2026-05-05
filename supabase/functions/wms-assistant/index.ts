import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const SYSTEM_PROMPT = `Anda adalah "WMS Assistant" untuk aplikasi internal Warehouse Management System PT. Kemika Karya Pratama.

Tugas Anda:
- Membantu user memahami cara penggunaan aplikasi (Plan Order, Sales Order, Stock In/Out, Stock Adjustment, Delivery Kanban, Reports, K'talk chat).
- Menjawab troubleshooting umum stok (mis. kenapa Available = 0 padahal On Hand ada → karena ada qty Booked oleh Sales Order yang sudah approve delivery).
- Menjelaskan alur approval, role (super_admin, admin, finance, purchasing, warehouse, sales, viewer), dan status transaksi.
- Memberi jawaban ringkas, jelas, dalam Bahasa Indonesia (kecuali user bertanya dalam English).
- Gunakan bullet/markdown bila perlu.

Konteks penting aplikasi:
- Stock = On Hand - Booked = Available. Booking terjadi saat Sales Order masuk kolom "Approval Delivery Order" di Kanban (RPC stock_out_create dengan booking_status='booked'). Stok fisik baru berkurang saat card masuk "Pengiriman Hari Ini" (stock_out_confirm_delivery → status 'delivered'). Jika dibatalkan, booking di-release (stock_out_release_booking).
- Outbound Report menampilkan booked/delivered/released dengan badge.
- Status Sales Order: draft, pending_approval, approved, in_delivery, partially_delivered, delivered, cancelled, revision_requested. JANGAN gunakan 'partial' (deprecated).
- Format nomor transaksi: [PREFIX]/YYYYMMDD.XX
- Soft delete (is_deleted) hanya untuk status 'draft'.
- Validasi alasan: Urgent/Cito min 60 char, Reject/Revision min 20 char.
- Foto delivery otomatis di-watermark (alamat + timestamp).
- Time Guard Kanban jam 10:00 WIB.
- Backup otomatis mingguan via pg_cron.

Jika pertanyaan di luar scope WMS Kemika, arahkan user kembali ke topik aplikasi dengan sopan. Jangan mengarang fitur yang tidak ada.

DAFTAR ROUTE VALID (gunakan persis seperti ini saat menyisipkan link tindakan dalam format markdown [Label](/path)):
- /dashboard, /plan-order, /sales-order, /stock-in, /stock-out, /stock-adjustment, /data-stock, /request-delivery, /delivery-order, /proforma-invoice
- /reports/outbound, /reports/inbound, /reports/stock, /reports/stock-movement, /reports/expiry, /reports/audit, /reports/adjustment
- /data-product/products, /data-product/customers, /data-product/suppliers, /data-product/categories, /data-product/units
- /user-management, /settings, /profile, /notifications

Selalu sisipkan minimal 1 link tindakan [Buka X](/path) bila jawaban menyarankan user pergi ke modul tertentu. Jangan pakai URL eksternal. Konteks halaman aktif user akan diberikan dalam pesan diawali "[Konteks]" atau "[Context]" — manfaatkan untuk jawaban yang relevan.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages, mode } = body || {};
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize messages: allow content to be string OR array of parts
    // [{type:"text", text:"..."}, {type:"image_url", image_url:{url:"data:image/webp;base64,..."}}]
    const normalized = messages.map((m: any) => {
      if (typeof m?.content === "string") return { role: m.role, content: m.content };
      if (Array.isArray(m?.content)) {
        const parts = m.content
          .map((p: any) => {
            if (p?.type === "text" && typeof p.text === "string") {
              return { type: "text", text: p.text };
            }
            if (p?.type === "image_url" && p?.image_url?.url) {
              return { type: "image_url", image_url: { url: String(p.image_url.url) } };
            }
            return null;
          })
          .filter(Boolean);
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: String(m?.content ?? "") };
    });

    // ===== CLASSIFY MODE =====
    // Used to auto-detect WMS error type from a screenshot and suggest follow-up questions.
    if (mode === "classify") {
      const classifyResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "Anda klasifikator screenshot WMS Kemika. Lihat gambar dan deteksi jenis masalah. Jenis valid: AVAILABLE_ZERO, ON_HAND_VS_BOOKED, FEFO_BATCH, APPROVAL_STUCK, DELIVERY_KANBAN, STOCK_ADJUSTMENT, ERROR_TOAST, PERMISSION, OTHER. Selalu kembalikan via tool call. Pertanyaan saran harus singkat, spesifik, Bahasa Indonesia, maksimal 3 buah.",
            },
            ...normalized,
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "classify_screenshot",
                description: "Mengklasifikasi screenshot WMS dan menyarankan pertanyaan paling sesuai.",
                parameters: {
                  type: "object",
                  properties: {
                    issue_type: {
                      type: "string",
                      enum: [
                        "AVAILABLE_ZERO",
                        "ON_HAND_VS_BOOKED",
                        "FEFO_BATCH",
                        "APPROVAL_STUCK",
                        "DELIVERY_KANBAN",
                        "STOCK_ADJUSTMENT",
                        "ERROR_TOAST",
                        "PERMISSION",
                        "OTHER",
                      ],
                    },
                    summary: { type: "string", description: "Ringkasan 1 kalimat yang terlihat di screenshot." },
                    confidence: { type: "number", description: "0..1" },
                    suggested_questions: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 1,
                      maxItems: 3,
                    },
                  },
                  required: ["issue_type", "summary", "suggested_questions"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "classify_screenshot" } },
        }),
      });

      if (!classifyResp.ok) {
        if (classifyResp.status === 429 || classifyResp.status === 402) {
          return new Response(JSON.stringify({ error: classifyResp.status === 429 ? "Rate limit" : "Kredit AI habis" }), {
            status: classifyResp.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await classifyResp.text();
        console.error("classify error:", classifyResp.status, t);
        return new Response(JSON.stringify({ error: "Classify failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await classifyResp.json();
      const call = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      let parsed: any = null;
      try {
        parsed = call ? JSON.parse(call) : null;
      } catch {
        parsed = null;
      }
      return new Response(
        JSON.stringify(
          parsed || {
            issue_type: "OTHER",
            summary: "",
            suggested_questions: ["Tolong jelaskan apa yang terlihat di screenshot ini."],
          }
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...normalized],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit tercapai, coba lagi nanti." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Kredit AI habis, silakan top-up workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("wms-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});