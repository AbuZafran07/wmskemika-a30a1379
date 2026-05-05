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

Jika pertanyaan di luar scope WMS Kemika, arahkan user kembali ke topik aplikasi dengan sopan. Jangan mengarang fitur yang tidak ada.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
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