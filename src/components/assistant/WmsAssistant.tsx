import { useState, useRef, useEffect, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Send, Loader2, Trash2, ExternalLink, Lightbulb, Stethoscope, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wms-assistant`;

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

export default function WmsAssistant() {
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || isLoading) return;
    const userMsg: Msg = { role: "user", content: text };
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
    const payload = [ctxNote, ...next];
    setMessages(next);
    setInput("");
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
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: payload }),
      });

      if (!resp.ok) {
        if (resp.status === 429) {
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
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
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
            <div className="flex items-center gap-1.5 mb-1.5 text-xs text-muted-foreground">
              <Lightbulb className="w-3.5 h-3.5" />
              {language === "en" ? "Quick help" : "Bantuan cepat"}
            </div>
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

          <div className="border-t p-3 flex gap-2 flex-shrink-0">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={placeholder}
              className="min-h-[44px] max-h-32 resize-none text-sm"
              disabled={isLoading}
            />
            <Button onClick={() => send()} disabled={isLoading || !input.trim()} size="icon" className="flex-shrink-0">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}