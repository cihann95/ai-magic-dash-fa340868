import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";

interface ReasoningFactors {
  technical: number;
  news: number;
  volume: number;
}

interface SignalCardProps {
  title: string;
  content: string;
  symbol?: string;
  loading?: boolean;
  confidence?: number | null;
  reasoning?: ReasoningFactors | null;
}

interface SignalAccuracy {
  accuracy_pct: number;
  total_signals: number;
  correct_signals: number;
  recent_signals: Array<{
    signal_type: string;
    was_correct: boolean | null;
    price_at_signal: number;
    price_after_24h: number | null;
    created_at: string;
    confidence: number;
  }>;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-4">
      <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse-dots" style={{ animationDelay: "0s" }} />
      <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse-dots" style={{ animationDelay: "0.2s" }} />
      <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse-dots" style={{ animationDelay: "0.4s" }} />
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 80, h = 24;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  const color = data[data.length - 1] >= data[0] ? "#22c55e" : "#ef4444";
  return (
    <svg width={w} height={h} className="shrink-0" viewBox={`0 0 ${w} ${h}`}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

function SignalAccuracyBadge({ symbol }: { symbol?: string }) {
  const [acc, setAcc] = useState<SignalAccuracy | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    // Use RPC or direct query: compute accuracy from ai_signal_history for this symbol's signal types
    const fetchAccuracy = async () => {
      try {
        const { data: signals } = await supabase
          .from("ai_signal_history")
          .select("signal_type, was_correct, price_at_signal, price_after_24h, created_at, confidence")
          .eq("symbol", symbol)
          .eq("verified", true)
          .order("created_at", { ascending: false })
          .limit(30);
        if (!mounted.current) return;
        if (!signals || signals.length === 0) {
          setAcc(null);
          setLoading(false);
          return;
        }
        const correct = signals.filter((s: any) => s.was_correct === true).length;
        const total = signals.filter((s: any) => s.was_correct !== null).length;
        const accPct = total > 0 ? Math.round((correct / total) * 100) : 0;
        setAcc({
          accuracy_pct: accPct,
          total_signals: total,
          correct_signals: correct,
          recent_signals: signals.slice(0, 10).map((s: any) => ({
            signal_type: s.signal_type,
            was_correct: s.was_correct,
            price_at_signal: Number(s.price_at_signal),
            price_after_24h: s.price_after_24h ? Number(s.price_after_24h) : null,
            created_at: s.created_at,
            confidence: s.confidence,
          })),
        });
      } catch { /* ignore */ }
      if (mounted.current) setLoading(false);
    };
    fetchAccuracy();
  }, [symbol]);

  if (!acc || loading) return null;
  const barColor = acc.accuracy_pct >= 70 ? "bg-green-500" : acc.accuracy_pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  const textColor = acc.accuracy_pct >= 70 ? "text-green-400" : acc.accuracy_pct >= 50 ? "text-yellow-400" : "text-red-400";

  const sparkValues = acc.recent_signals
    .map((s) => s.was_correct === true ? 1 : s.was_correct === false ? 0 : null)
    .filter((v): v is number => v !== null)
    .reverse();

  return (
    <div className="mt-2 pt-2 border-t border-border/40">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Bu sinyal tipinin doğruluk oranı:</span>
        <span className={cn("font-bold font-mono", textColor)}>{acc.accuracy_pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-1">
        <motion.div
          className={cn("h-full rounded-full", barColor)}
          initial={{ width: 0 }}
          animate={{ width: `${acc.accuracy_pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-muted-foreground">
          {acc.correct_signals}/{acc.total_signals} doğru (son 30 gün)
        </span>
        {sparkValues.length >= 2 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Son 10</span>
            <Sparkline data={sparkValues.map((v) => v * 100)} />
          </div>
        )}
      </div>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 80 ? "bg-green-500" :
    value >= 60 ? "bg-yellow-500" :
    value >= 40 ? "bg-orange-500" :
                 "bg-red-500";
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>Güven / Confidence</span>
        <span className="font-mono font-bold">{value}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", color)}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function ReasoningToggle({ factors }: { factors: ReasoningFactors }) {
  const [open, setOpen] = useState(false);
  const total = factors.technical + factors.news + factors.volume;
  const norm = {
    technical: total > 0 ? (factors.technical / total) * 100 : 70,
    news: total > 0 ? (factors.news / total) * 100 : 20,
    volume: total > 0 ? (factors.volume / total) * 100 : 10,
  };
  return (
    <div className="mt-2 pt-2 border-t border-border/40">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Neden? / Why?
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1.5 text-xs">
              <FactorRow label={total > 0 ? "Teknik / Technical" : "Teknik / Technical"} pct={Math.round(norm.technical)} />
              <FactorRow label="Haber / News" pct={Math.round(norm.news)} />
              <FactorRow label="Hacim / Volume" pct={Math.round(norm.volume)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FactorRow({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span className="w-8 text-right font-mono text-muted-foreground">{pct}%</span>
    </div>
  );
}

export default function SignalCard({ title, content, symbol, loading, confidence, reasoning }: SignalCardProps) {
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
        {symbol && (
          <Badge variant="secondary" className="text-[10px]">{symbol}</Badge>
        )}
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
      {confidence != null && <ConfidenceBar value={confidence} />}
      {reasoning && <ReasoningToggle factors={reasoning} />}
      {symbol && <SignalAccuracyBadge symbol={symbol} />}
    </motion.div>
  );
}
