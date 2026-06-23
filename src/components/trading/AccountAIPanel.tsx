import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge-error";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Loader2, RefreshCw, Send, Sparkles, Brain } from "lucide-react";
import { SymbolDef } from "@/lib/symbols";
import AIDisclaimer from "@/components/AIDisclaimer";
import { useLivePrices } from "@/hooks/useLivePrices";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { AiAnalyzeResponse, AiStrategyResponse, DailyBriefResponse, NewsFeedResponse } from "../../lib/edge-function-types";
interface Props { symbol: SymbolDef; refreshKey: number; onTradeDone: () => void; }

interface Position {
  id: string; symbol: string; asset_class: string; side: string;
  quantity: number; entry_price: number; current_price?: number | null;
  pending?: boolean;
}

interface NewsItem { title: string; summary: string; sentiment: "bullish" | "bearish" | "neutral"; source?: string; url?: string; published_at?: string; }
interface ChatMsg { role: "user" | "assistant"; content: string; }

const isEdgeError = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-4">
      <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse-dots" style={{ animationDelay: "0s" }} />
      <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse-dots" style={{ animationDelay: "0.2s" }} />
      <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse-dots" style={{ animationDelay: "0.4s" }} />
    </div>
  );
}

function SignalCard({ title, content, symbol, loading }: { title: string; content: string; symbol?: string; loading?: boolean }) {
  if (loading && !content) return <TypingDots />;
  if (!content) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-lg border border-border-subtle bg-surface-1 p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-sm truncate">{title}</h4>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="text-[10px]">AI</Badge>
          {symbol && <Badge variant="secondary" className="text-[10px]">{symbol}</Badge>}
        </div>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </motion.div>
  );
}

export default function AccountAIPanel({ symbol, refreshKey, onTradeDone: _onTradeDone }: Props) {
  const { lang, user } = useApp();
  const tr = t(lang);
  const [balance, setBalance] = useState(0);
  const [locked, setLocked] = useState(0);
  const [initial, setInitial] = useState(100000);
  const [positions, setPositions] = useState<Position[]>([]);

  const [analysis, setAnalysis] = useState("");
  const [loadingA, setLoadingA] = useState(false);
  const [strategy, setStrategy] = useState("");
  const [loadingS, setLoadingS] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loadingN, setLoadingN] = useState(false);
  const [brief, setBrief] = useState<string>("");
  const [loadingB, setLoadingB] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("analysis");

  const livePrices = useLivePrices(positions.map((p) => p.symbol));

  const loadAcct = async () => {
    if (!user) return;
    const [{ data: prof }, { data: pos }] = await Promise.all([
      supabase.from("profiles").select("demo_balance, demo_balance_locked, initial_balance").eq("id", user.id).maybeSingle(),
      supabase.from("positions").select("*").eq("user_id", user.id).order("opened_at", { ascending: false }),
    ]);
    if (prof) { setBalance(Number(prof.demo_balance)); setLocked(Number(prof.demo_balance_locked ?? 0)); setInitial(Number(prof.initial_balance)); }
    if (pos) setPositions(pos as Position[]);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAcct(); }, [user, refreshKey]);

  useEffect(() => {
    const add = (event: Event) => {
      const next = (event as CustomEvent<Position>).detail;
      if (next) setPositions((current) => [next, ...current.filter((p) => p.id !== next.id)]);
    };
    const rollback = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      if (id) setPositions((current) => current.filter((p) => p.id !== id));
    };
    window.addEventListener("optimistic-position", add);
    window.addEventListener("optimistic-position-rollback", rollback);
    return () => {
      window.removeEventListener("optimistic-position", add);
      window.removeEventListener("optimistic-position-rollback", rollback);
    };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { balance } = (e as CustomEvent<{ balance: number }>).detail;
      if (typeof balance === 'number') setBalance(balance);
    };
    window.addEventListener('balance-update', handler);
    return () => window.removeEventListener('balance-update', handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`profile-balance-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, (payload) => {
        const row = payload.new as { demo_balance?: number; demo_balance_locked?: number; initial_balance?: number };
        if (row.demo_balance != null) setBalance(Number(row.demo_balance));
        if (row.demo_balance_locked != null) setLocked(Number(row.demo_balance_locked));
        if (row.initial_balance != null) setInitial(Number(row.initial_balance));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const livePnl = positions.reduce((acc, p) => {
    const cur = livePrices[p.symbol]?.price ?? Number(p.current_price ?? p.entry_price);
    const v = p.side === "long" ? (cur - Number(p.entry_price)) * Number(p.quantity)
                                : (Number(p.entry_price) - cur) * Number(p.quantity);
    return acc + (Number.isFinite(v) ? v : 0);
  }, 0);

  const availableBalance = balance - locked;
  const totalEquity = balance + livePnl;
  const totalChange = initial > 0 ? ((totalEquity - initial) / initial) * 100 : 0;

  const runAnalysis = async () => {
    setLoadingA(true); setAnalysis("");
    try {
      const result = await callEdgeFunction<AiAnalyzeResponse>("ai-analyze", { symbol: symbol.symbol, asset_class: symbol.asset_class, language: lang });
      if (result?.error) throw new Error(result.error);
      setAnalysis(result.analysis);
    } catch (e) {
      if (!isEdgeError(e)) {
        toast({ title: tr.error, description: e instanceof Error ? e.message : "Unknown", variant: "destructive" });
      }
    } finally { setLoadingA(false); }
  };

  const runStrategy = async () => {
    setLoadingS(true); setStrategy("");
    try {
      const result = await callEdgeFunction<AiStrategyResponse>("ai-strategy", { language: lang, symbol: symbol.symbol });
      if (result?.error) throw new Error(result.error);
      setStrategy(result.suggestion);
    } catch (e) {
      if (!isEdgeError(e)) {
        toast({ title: tr.error, description: e instanceof Error ? e.message : "Unknown", variant: "destructive" });
      }
    } finally { setLoadingS(false); }
  };

  const runBrief = async () => {
    setLoadingB(true);
    try {
      const result = await callEdgeFunction<DailyBriefResponse>("daily-brief", { language: lang });
      if (result?.error) throw new Error(result.error);
      setBrief(result.content);
    } catch (e) {
      if (!isEdgeError(e)) {
        toast({ title: tr.error, description: e instanceof Error ? e.message : "Unknown", variant: "destructive" });
      }
    } finally { setLoadingB(false); }
  };

  const runNews = async () => {
    setLoadingN(true);
    try {
      const result = await callEdgeFunction<NewsFeedResponse>("news-feed", { symbol: symbol.symbol, language: lang });
      if (result?.error) throw new Error(result.error);
      setNews((result.items ?? []).map((item) => ({ ...item, summary: item.summary ?? "", sentiment: item.sentiment ?? "neutral" as const })));
    } catch (e) {
      if (!isEdgeError(e)) {
        toast({ title: tr.error, description: e instanceof Error ? e.message : "Unknown", variant: "destructive" });
      }
    } finally { setLoadingN(false); }
  };

  const send = async () => {
    if (!input.trim() || streaming) return;
    setChatError(null);
    const userMsg: ChatMsg = { role: "user", content: input };
    const next = [...messages, userMsg];
    setMessages(next); setInput(""); setStreaming(true);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: next, language: lang, context_symbol: symbol.symbol }),
      });
      if (resp.status === 429) throw new Error(lang === "tr" ? "Çok fazla istek. Bekleyin." : "Too many requests.");
      if (resp.status === 402) throw new Error(lang === "tr" ? "AI kredisi yetersiz." : "Insufficient credits.");
      if (!resp.ok || !resp.body) throw new Error("AI error");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = ""; let assistant = "";
      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx); buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { buf = ""; break; }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistant += delta;
              setMessages((m) => m.map((mm, i) => i === m.length - 1 ? { ...mm, content: assistant } : mm));
            }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown";
      setChatError(msg);
      toast({ title: tr.error, description: msg, variant: "destructive" });
    } finally { setStreaming(false); }
  };

  return (
    <div className="flex flex-col h-full gap-3">
      <Card className="p-4 glass border-border/40 shadow-card shrink-0">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{tr.balance}</div>
        <div className="font-price text-2xl font-bold mt-1">${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div className={cn("text-xs font-price mt-0.5", totalChange >= 0 ? "text-bull" : "text-bear")}>
          {totalChange >= 0 ? "+" : ""}{totalChange.toFixed(2)}% • ${(totalEquity - initial).toFixed(2)}
        </div>
        <div className="flex justify-between mt-3 pt-3 border-t border-border/40 text-xs">
          <div>
            <div className="text-muted-foreground">{tr.available}</div>
            <div className="font-price font-semibold">${availableBalance.toFixed(2)}</div>
          </div>
          <div className="text-right">
            <div className="text-muted-foreground">{tr.pnl}</div>
            <div className={cn("font-price font-semibold", livePnl >= 0 ? "text-bull" : "text-bear")}>
              {livePnl >= 0 ? "+" : ""}${livePnl.toFixed(2)}
            </div>
          </div>
        </div>
      </Card>

      <Card className="flex-1 min-h-0 flex flex-col glass border-border/40 shadow-card overflow-hidden">
        <Tabs defaultValue="analysis" value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
          <TabsList className="grid grid-cols-5 m-3 mb-0 shrink-0 relative">
            <TabsTrigger value="analysis" className="text-xs transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"><Sparkles className="size-3 mr-0.5" />{tr.analysis}</TabsTrigger>
            <TabsTrigger value="brief" className="text-xs transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">📊</TabsTrigger>
            <TabsTrigger value="strategy" className="text-xs transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"><Brain className="size-3" /></TabsTrigger>
            <TabsTrigger value="news" className="text-xs transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">{tr.news}</TabsTrigger>
            <TabsTrigger value="chat" className="text-xs transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">{tr.chat}</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="flex-1 min-h-0 m-0 mt-3 p-3 pt-0 overflow-y-auto scrollbar-thin space-y-3 data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden">
            <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loadingA} className="w-full">
              {loadingA ? <Loader2 className="size-4 animate-spin mr-1" /> : <Sparkles className="size-4 mr-1" />}
              {loadingA ? tr.ai_loading : (lang === "tr" ? `${symbol.symbol} için analiz` : `Analyze ${symbol.symbol}`)}
            </Button>
            <SignalCard title={`AI Analysis — ${symbol.symbol}`} content={analysis ?? ""} symbol={symbol.symbol} loading={loadingA} />
            {analysis && <AIDisclaimer />}
          </TabsContent>

          <TabsContent value="brief" className="flex-1 min-h-0 m-0 mt-3 p-3 pt-0 overflow-y-auto scrollbar-thin space-y-3 data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden">
            <Button variant="outline" size="sm" onClick={runBrief} disabled={loadingB} className="w-full">
              {loadingB ? <Loader2 className="size-4 animate-spin mr-1" /> : "📊"} {tr.daily_brief}
            </Button>
            <SignalCard title={lang === "tr" ? "Günlük Özet" : "Daily Brief"} content={brief ?? ""} loading={loadingB} />
            {brief && <AIDisclaimer />}
          </TabsContent>

          <TabsContent value="strategy" className="flex-1 min-h-0 m-0 mt-3 p-3 pt-0 overflow-y-auto scrollbar-thin space-y-3 data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden">
            <Button variant="outline" size="sm" onClick={runStrategy} disabled={loadingS} className="w-full">
              {loadingS ? <Loader2 className="size-4 animate-spin mr-1" /> : <Brain className="size-4 mr-1" />} {tr.get_strategy}
            </Button>
            <SignalCard title={lang === "tr" ? `Strateji — ${symbol.symbol}` : `Strategy — ${symbol.symbol}`} content={strategy ?? ""} symbol={symbol.symbol} loading={loadingS} />
            {strategy && <AIDisclaimer />}
          </TabsContent>

          <TabsContent value="news" className="flex-1 min-h-0 m-0 mt-3 p-3 pt-0 overflow-y-auto scrollbar-thin space-y-3 data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden">
            <Button variant="outline" size="sm" onClick={runNews} disabled={loadingN} className="w-full">
              {loadingN ? <Loader2 className="size-4 animate-spin mr-1" /> : <RefreshCw className="size-4 mr-1" />}
              {loadingN ? tr.ai_loading : tr.refresh}
            </Button>
            {loadingN && news.length === 0 && <TypingDots />}
            <div className="space-y-2">
              {news.map((n, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.05 }}
                  className="p-3 rounded-lg border border-border-subtle bg-surface-1"
                >
                  <div className="flex items-start gap-2">
                    <span className={cn("text-[10px] uppercase font-bold px-1.5 py-0.5 rounded shrink-0",
                      n.sentiment === "bullish" && "bg-bull/15 text-bull",
                      n.sentiment === "bearish" && "bg-bear/15 text-bear",
                      n.sentiment === "neutral" && "bg-muted text-muted-foreground")}>
                      {n.sentiment === "bullish" ? "↑" : n.sentiment === "bearish" ? "↓" : "•"}
                    </span>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{n.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">{n.summary}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
              {news.length === 0 && !loadingN && (
                <div className="text-xs text-muted-foreground text-center py-8">{lang === "tr" ? "Yenile butonuna tıklayın" : "Click refresh to load"}</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="chat" className="flex-1 min-h-0 m-0 mt-3 flex flex-col data-[state=active]:flex data-[state=active]:flex-col data-[state=inactive]:hidden">
            <div className="flex-1 overflow-y-auto scrollbar-thin px-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-8">{tr.ask_anything}</div>
              )}
              {messages.map((m, i) => (
                m.role === "user" ? (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn("rounded-lg p-3 text-sm bg-primary/15 ml-6")}
                  >
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </motion.div>
                ) : (
                  <SignalCard key={i} title="AI Assistant" content={m.content || "…"} loading={false} />
                )
              ))}
              {streaming && <TypingDots />}
            </div>
            {chatError && (
              <div className="px-3 py-2 bg-destructive/10 border-t border-destructive/20 flex items-center justify-between">
                <span className="text-xs text-destructive">{chatError}</span>
                <Button size="sm" variant="outline" onClick={() => { setChatError(null); send(); }}>
                  {tr.retry ?? "Retry"}
                </Button>
              </div>
            )}
            <div className="p-3 border-t border-border/40 flex gap-2">
              <Input value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
                placeholder={tr.ask_anything} disabled={streaming} className="bg-background/60" />
              <Button size="icon" onClick={send} disabled={streaming || !input.trim()} className="gradient-primary text-primary-foreground">
                {streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

    </div>
  );
}
