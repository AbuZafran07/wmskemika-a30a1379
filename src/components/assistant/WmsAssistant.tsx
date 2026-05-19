import { useState, useRef, useEffect, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Send, Loader2, Trash2, ExternalLink, Lightbulb, Stethoscope, X, Paperclip, ImageIcon, ScanSearch } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";

type Attachment = { dataUrl: string; size: number };
type Suggestion = {
  issue_type: string;
  summary: string;
  suggested_questions: string[];
};
type Msg = {
  role: "user" | "assistant";
  content: string;
  images?: string[]; // data URLs (webp) for display + sending
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wms-assistant`;

const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_IMAGE_DIMENSION = 1920;

// Compress an image File/Blob to WebP, max 1920px on the longest side.
async function compressToWebp(file: File | Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas ctx");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  // Try webp; fall back to jpeg if browser cannot encode webp
  let dataUrl = canvas.toDataURL("image/webp", 0.85);
  if (!dataUrl.startsWith("data:image/webp")) {
    dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  }
  return dataUrl;
}

const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/plan-order": "Plan Order",
  "/sales-order": "Sales Order",
  "/stock-in": "Stock In",
  "/stock-out": "Stock Out",
  "/stock-adjustment": "Stock Adjustment",
  "/data-stock": "Data Stock",
  "/request-delivery": "Delivery Kanban",
  "/delivery-order": "Delivery Order",
  "/proforma-invoice": "Proforma Invoice",
  "/reports/outbound": "Outbound Report",
  "/reports/inbound": "Inbound Report",
  "/reports/stock": "Stock Report",
  "/reports/stock-movement": "Stock Movement",
  "/reports/expiry": "Expiry Alert",
  "/reports/audit": "Audit Log",
  "/reports/adjustment": "Adjustment Log",
  "/data-product/products": "Products",
  "/data-product/customers": "Customers",
  "/data-product/suppliers": "Suppliers",
  "/data-product/categories": "Categories",
  "/data-product/units": "Units",
  "/user-management": "User Management",
  "/settings": "Settings",
};

const QUICK_PROMPTS_ID = [
  { label: "Cara buat Plan Order?", prompt: "Bagaimana langkah-langkah membuat Plan Order baru dari awal sampai approve?" },
  { label: "Kenapa Available = 0?", prompt: "Stok Available produk saya 0 padahal On Hand ada. Kenapa dan bagaimana solusinya?" },
  { label: "Card stuck di Approval Delivery", prompt: "Kenapa card delivery saya stuck di kolom Approval Delivery Order? Bagaimana cara melanjutkannya?" },
  { label: "Beda Booked vs Delivered", prompt: "Apa beda status Booked dan Delivered di Outbound Report?" },
  { label: "Cara Stock Adjustment", prompt: "Bagaimana cara melakukan Stock Adjustment (koreksi qty atau merge batch)?" },
];
const QUICK_PROMPTS_EN = [
  { label: "How to create a Plan Order?", prompt: "How do I create a new Plan Order from scratch through approval?" },
  { label: "Why is Available = 0?", prompt: "My product Available stock is 0 even though On Hand has qty. Why and how to fix?" },
  { label: "Card stuck at Approval Delivery", prompt: "Why is my delivery card stuck at the Approval Delivery Order column? How to proceed?" },
  { label: "Booked vs Delivered", prompt: "What is the difference between Booked and Delivered status in Outbound Report?" },
  { label: "How to do Stock Adjustment", prompt: "How do I perform a Stock Adjustment (qty correction or batch merge)?" },
];

// Render assistant text with [label](/path) -> action button
function renderAssistantContent(text: string, onNavigate: (path: string) => void) {
  const parts: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]\((\/[^\s)]+)\)/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(<Fragment key={key++}>{text.slice(lastIdx, m.index)}</Fragment>);
    const label = m[1];
    const path = m[2];
    parts.push(
      <Button
        key={key++}
        size="sm"
        variant="outline"
        className="h-6 px-2 mx-0.5 my-0.5 text-xs gap-1 align-middle"
        onClick={() => onNavigate(path)}
      >
        <ExternalLink className="w-3 h-3" />
        {label}
      </Button>
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(<Fragment key={key++}>{text.slice(lastIdx)}</Fragment>);
  return parts;
}

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function WmsAssistant() {
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  // Diagnostic mode state
  const [diagOpen, setDiagOpen] = useState(false);
  const [productOpts, setProductOpts] = useState<SearchableSelectOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [diagRunning, setDiagRunning] = useState(false);

  useEffect(() => {
    if (!diagOpen || productOpts.length > 0) return;
    setProductsLoading(true);
    supabase
      .from("products")
      .select("id, name, sku")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name")
      .limit(1000)
      .then(({ data }) => {
        setProductOpts(
          (data || []).map((p: any) => ({
            value: p.id,
            label: p.name,
            description: p.sku || undefined,
          }))
        );
        setProductsLoading(false);
      });
  }, [diagOpen, productOpts.length]);

  const runDiagnostic = async () => {
    if (!selectedProductId || diagRunning) return;
    setDiagRunning(true);
    try {
      const product = productOpts.find((p) => p.value === selectedProductId);
      // 1. Batches
      const { data: batches } = await supabase
        .from("inventory_batches")
        .select("id, batch_no, qty_on_hand, expired_date")
        .eq("product_id", selectedProductId)
        .order("expired_date", { ascending: true, nullsFirst: false });

      // 2. Active bookings (stock_out_items joined to headers booking_status='booked')
      const { data: bookedItems } = await supabase
        .from("stock_out_items")
        .select(
          "qty_out, batch_id, stock_out_id, stock_out_headers!inner(stock_out_number, booking_status, sales_order_id, sales_order_headers(sales_order_number, customer_id, customers(name)))"
        )
        .eq("product_id", selectedProductId)
        .eq("stock_out_headers.booking_status", "booked");

      const totalOnHand = (batches || []).reduce((s, b: any) => s + (b.qty_on_hand || 0), 0);
      const totalBooked = (bookedItems || []).reduce((s, it: any) => s + (it.qty_out || 0), 0);
      const available = totalOnHand - totalBooked;

      // Build context payload for AI
      const summary = {
        product: product?.label,
        sku: product?.description,
        on_hand: totalOnHand,
        booked: totalBooked,
        available,
        batches: (batches || []).map((b: any) => ({
          batch_no: b.batch_no,
          qty: b.qty_on_hand,
          expired_date: b.expired_date,
        })),
        active_bookings: (bookedItems || []).map((it: any) => ({
          stock_out_no: it.stock_out_headers?.stock_out_number,
          sales_order_no: it.stock_out_headers?.sales_order_headers?.sales_order_number,
          customer: it.stock_out_headers?.sales_order_headers?.customers?.name,
          qty: it.qty_out,
        })),
      };

      const promptText =
        (language === "en"
          ? `Run DIAGNOSTIC for product "${product?.label}". Explain step by step why Available is ${available} (On Hand=${totalOnHand}, Booked=${totalBooked}). Reference each batch and active booking. Suggest concrete actions with module links if needed. Use bullet points and a clear numbered explanation.`
          : `Jalankan DIAGNOSTIK untuk produk "${product?.label}". Jelaskan langkah demi langkah kenapa Available = ${available} (On Hand=${totalOnHand}, Booked=${totalBooked}). Sebutkan tiap batch dan booking aktif yang relevan. Beri saran tindakan konkret beserta link modul bila perlu. Gunakan bullet dan penjelasan bernomor yang jelas.`) +
        `\n\n[DATA]\n` +
        "```json\n" +
        JSON.stringify(summary, null, 2) +
        "\n```";

      setDiagOpen(false);
      await send(promptText);
    } catch (e) {
      console.error(e);
      toast.error(language === "en" ? "Diagnostic failed" : "Diagnostik gagal");
    } finally {
      setDiagRunning(false);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const currentPageLabel = ROUTE_LABELS[location.pathname] || location.pathname;
  const quickPrompts = language === "en" ? QUICK_PROMPTS_EN : QUICK_PROMPTS_ID;

  const placeholder = language === "en" ? "Ask anything about WMS..." : "Tanya apa saja tentang WMS...";
  const greeting =
    language === "en"
      ? "Hi! I'm WMS Assistant. Ask me how to use the app, troubleshoot stock issues, or explain workflows."
      : "Halo! Saya WMS Assistant. Tanya saya cara penggunaan aplikasi, troubleshoot masalah stok, atau penjelasan alur kerja.";

  const handleNavigate = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const addImageFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    const room = MAX_IMAGES_PER_MESSAGE - attachments.length;
    if (room <= 0) {
      toast.error(language === "en" ? `Max ${MAX_IMAGES_PER_MESSAGE} images per message` : `Maks ${MAX_IMAGES_PER_MESSAGE} gambar per pesan`);
      return;
    }
    setCompressing(true);
    try {
      const picked = imgs.slice(0, room);
      const results: Attachment[] = [];
      for (const f of picked) {
        try {
          const dataUrl = await compressToWebp(f);
          // Approximate decoded byte size from base64
          const b64 = dataUrl.split(",")[1] || "";
          results.push({ dataUrl, size: Math.floor((b64.length * 3) / 4) });
        } catch (e) {
          console.error("compress fail", e);
        }
      }
      if (results.length) setAttachments((prev) => [...prev, ...results]);
    } finally {
      setCompressing(false);
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
    setSuggestion(null);
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || []);
    const files: File[] = [];
    for (const it of items) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f && f.type.startsWith("image/")) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      await addImageFiles(files);
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) await addImageFiles(files);
  };

  // Auto-classify whenever attachments change (on add). Cleared on send/remove.
  useEffect(() => {
    if (attachments.length === 0) {
      setSuggestion(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setClassifying(true);
      try {
        const parts: any[] = [
          {
            type: "text",
            text:
              language === "en"
                ? "Classify this WMS screenshot and suggest the best follow-up question."
                : "Klasifikasikan screenshot WMS ini dan sarankan pertanyaan paling sesuai.",
          },
          ...attachments.map((a) => ({ type: "image_url", image_url: { url: a.dataUrl } })),
        ];
        const classifyToken = await getAuthToken();
        if (!classifyToken) return;
        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${classifyToken}`,
          },
          body: JSON.stringify({ mode: "classify", messages: [{ role: "user", content: parts }] }),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        if (!cancelled && data?.suggested_questions?.length) {
          setSuggestion(data);
        }
      } catch (e) {
        console.error("classify error", e);
      } finally {
        if (!cancelled) setClassifying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments]);

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    const imgs = attachments.map((a) => a.dataUrl);
    if ((!text && imgs.length === 0) || isLoading) return;
    const userMsg: Msg = { role: "user", content: text, images: imgs.length ? imgs : undefined };
    // Inject page context as a system-style note (only on first turn or every turn — keep simple every turn)
    const ctxNote: Msg = {
      role: "user",
      content:
        (language === "en"
          ? `[Context] User is currently on page: ${currentPageLabel} (${location.pathname}).`
          : `[Konteks] User sedang membuka halaman: ${currentPageLabel} (${location.pathname}).`) +
        (language === "en"
          ? " When suggesting actions, embed module links as markdown: [Open Stock In](/stock-in), [Open Sales Order](/sales-order), etc, using only valid app routes."
          : " Saat menyarankan tindakan, sisipkan link modul dalam format markdown: [Buka Stock In](/stock-in), [Buka Sales Order](/sales-order), dll, hanya gunakan route aplikasi yang valid."),
    };
    const next = [...messages, userMsg];
    // Build payload: convert messages with images to multimodal content arrays
    const payload = [ctxNote, ...next].map((m) => {
      if (m.role === "user" && m.images && m.images.length > 0) {
        const parts: any[] = [];
        if (m.content) parts.push({ type: "text", text: m.content });
        else parts.push({ type: "text", text: language === "en" ? "(see attached screenshot)" : "(lihat screenshot terlampir)" });
        for (const url of m.images) parts.push({ type: "image_url", image_url: { url } });
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    });
    setMessages(next);
    setInput("");
    setAttachments([]);
    setSuggestion(null);
    setIsLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const token = await getAuthToken();
      if (!token) {
        toast.error(language === "en" ? "Session expired. Please sign in again." : "Sesi habis. Silakan login ulang.");
        setIsLoading(false);
        return;
      }

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: payload }),
      });

      if (!resp.ok) {
        if (resp.status === 401) {
          toast.error(language === "en" ? "Session expired. Please sign in again." : "Sesi habis. Silakan login ulang.");
        } else if (resp.status === 429) {
          toast.error(language === "en" ? "Rate limit reached. Try again shortly." : "Rate limit tercapai. Coba lagi sebentar.");
        } else if (resp.status === 402) {
          toast.error(language === "en" ? "AI credits exhausted." : "Kredit AI habis.");
        } else {
          toast.error(language === "en" ? "Failed to get response" : "Gagal mendapatkan respons");
        }
        setMessages((prev) => prev.filter((m, i) => !(i === prev.length - 1 && m.role === "user")));
        setIsLoading(false);
        return;
      }
      if (!resp.body) throw new Error("No body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":") || !line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsert(content);
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(language === "en" ? "Connection error" : "Koneksi error");
    } finally {
      setIsLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden sm:inline-flex items-center gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
        title="WMS Assistant"
      >
        <Sparkles className="w-4 h-4" />
        <span className="text-xs font-medium">WMS Assistant</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="sm:hidden text-primary"
        title="WMS Assistant"
      >
        <Sparkles className="w-5 h-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md p-0 flex flex-col"
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-md pointer-events-none flex items-center justify-center">
              <div className="bg-background rounded-md px-4 py-2 text-sm font-medium flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-primary" />
                {language === "en" ? "Drop image to attach" : "Lepas gambar untuk dilampirkan"}
              </div>
            </div>
          )}
          <SheetHeader className="px-4 py-3 border-b flex-shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              WMS Assistant
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="ml-auto"
                  onClick={() => setMessages([])}
                  title={language === "en" ? "Clear chat" : "Bersihkan chat"}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 px-4" ref={scrollRef as any}>
            <div className="py-4 space-y-3">
              {messages.length === 0 && (
                <>
                  <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                    {greeting}
                    <div className="mt-2 text-xs">
                      {language === "en" ? "Current page: " : "Halaman saat ini: "}
                      <span className="font-medium text-foreground">{currentPageLabel}</span>
                    </div>
                  </div>
                </>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words max-w-[90%]",
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "mr-auto bg-muted text-foreground"
                  )}
                >
                  {m.images && m.images.length > 0 && (
                    <div className={cn("flex flex-wrap gap-1.5 mb-1.5", m.content ? "" : "mb-0")}>
                      {m.images.map((src, k) => (
                        <a key={k} href={src} target="_blank" rel="noreferrer" className="block">
                          <img
                            src={src}
                            alt={`attachment-${k}`}
                            className="h-24 w-24 object-cover rounded border border-border/40"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  {m.role === "assistant"
                    ? renderAssistantContent(m.content || (isLoading && i === messages.length - 1 ? "…" : ""), handleNavigate)
                    : m.content}
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="mr-auto bg-muted rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {language === "en" ? "Thinking..." : "Berpikir..."}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Quick prompts */}
          <div className="border-t px-3 py-2 flex-shrink-0 bg-muted/20">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lightbulb className="w-3.5 h-3.5" />
                {language === "en" ? "Quick help" : "Bantuan cepat"}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setDiagOpen((v) => !v)}
                disabled={isLoading}
              >
                <Stethoscope className="w-3.5 h-3.5" />
                {language === "en" ? "Diagnose stock" : "Diagnostik stok"}
              </Button>
            </div>
            {diagOpen && (
              <div className="mb-2 rounded-md border bg-background p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">
                    {language === "en"
                      ? "Diagnose: On Hand vs Booked vs Available"
                      : "Diagnostik: On Hand vs Booked vs Available"}
                  </span>
                  <Button variant="ghost" size="iconSm" onClick={() => setDiagOpen(false)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <SearchableSelect
                  options={productOpts}
                  value={selectedProductId}
                  onValueChange={setSelectedProductId}
                  placeholder={
                    productsLoading
                      ? language === "en" ? "Loading products..." : "Memuat produk..."
                      : language === "en" ? "Select product" : "Pilih produk"
                  }
                  searchPlaceholder={language === "en" ? "Search product..." : "Cari produk..."}
                  emptyMessage={language === "en" ? "No products" : "Tidak ada produk"}
                  disabled={productsLoading}
                />
                <Button
                  size="sm"
                  className="w-full h-8 text-xs gap-1"
                  disabled={!selectedProductId || diagRunning}
                  onClick={runDiagnostic}
                >
                  {diagRunning ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Stethoscope className="w-3.5 h-3.5" />
                  )}
                  {language === "en" ? "Run diagnostic" : "Jalankan diagnostik"}
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {quickPrompts.map((q, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={isLoading}
                  onClick={() => send(q.prompt)}
                >
                  {q.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="border-t p-3 flex flex-col gap-2 flex-shrink-0">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((a, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={a.dataUrl}
                      alt={`pending-${i}`}
                      className="h-14 w-14 object-cover rounded border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center opacity-90 hover:opacity-100"
                      title={language === "en" ? "Remove" : "Hapus"}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {compressing && (
                  <div className="h-14 w-14 rounded border border-dashed flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            )}
            {(classifying || suggestion) && attachments.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-2 text-xs space-y-1.5">
                {classifying && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {language === "en" ? "Detecting issue type..." : "Mendeteksi jenis masalah..."}
                  </div>
                )}
                {!classifying && suggestion && (
                  <>
                    <div className="flex items-start gap-1.5">
                      <ScanSearch className="w-3.5 h-3.5 mt-0.5 text-primary flex-shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium text-foreground">
                          {language === "en" ? "Detected: " : "Terdeteksi: "}
                          <span className="text-primary">{suggestion.issue_type.replace(/_/g, " ")}</span>
                        </div>
                        {suggestion.summary && (
                          <div className="text-muted-foreground">{suggestion.summary}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-muted-foreground">
                      {language === "en" ? "Pick the closest question:" : "Pilih pertanyaan yang paling sesuai:"}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestion.suggested_questions.map((q, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={isLoading}
                          onClick={() => send(q)}
                        >
                          {q}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  await addImageFiles(files);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="flex-shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || compressing || attachments.length >= MAX_IMAGES_PER_MESSAGE}
                title={language === "en" ? "Attach screenshot" : "Lampirkan screenshot"}
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                onPaste={onPaste}
                placeholder={placeholder}
                className="min-h-[44px] max-h-32 resize-none text-sm"
                disabled={isLoading}
              />
              <Button
                onClick={() => send()}
                disabled={isLoading || compressing || (!input.trim() && attachments.length === 0)}
                size="icon"
                className="flex-shrink-0"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}