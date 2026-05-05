import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Send, Loader2, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wms-assistant`;

export default function WmsAssistant() {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const placeholder = language === "en" ? "Ask anything about WMS..." : "Tanya apa saja tentang WMS...";
  const greeting =
    language === "en"
      ? "Hi! I'm WMS Assistant. Ask me how to use the app, troubleshoot stock issues, or explain workflows."
      : "Halo! Saya WMS Assistant. Tanya saya cara penggunaan aplikasi, troubleshoot masalah stok, atau penjelasan alur kerja.";

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    const userMsg: Msg = { role: "user", content: text };
    const next = [...messages, userMsg];
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
        body: JSON.stringify({ messages: next }),
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
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                  {greeting}
                  <ul className="mt-2 space-y-1 text-xs list-disc list-inside">
                    <li>{language === "en" ? "How to create a Plan Order?" : "Bagaimana cara buat Plan Order?"}</li>
                    <li>{language === "en" ? "Why is my Available stock 0?" : "Kenapa stok Available saya 0?"}</li>
                    <li>{language === "en" ? "Explain Delivery Kanban flow" : "Jelaskan alur Delivery Kanban"}</li>
                  </ul>
                </div>
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
                  {m.content || (isLoading && i === messages.length - 1 ? "…" : "")}
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

          <div className="border-t p-3 flex gap-2 flex-shrink-0">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={placeholder}
              className="min-h-[44px] max-h-32 resize-none text-sm"
              disabled={isLoading}
            />
            <Button onClick={send} disabled={isLoading || !input.trim()} size="icon" className="flex-shrink-0">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}