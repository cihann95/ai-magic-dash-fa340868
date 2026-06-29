import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

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

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-4">
      <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse-dots" style={{ animationDelay: "0s" }} />
      <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse-dots" style={{ animationDelay: "0.2s" }} />
      <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse-dots" style={{ animationDelay: "0.4s" }} />
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
    </motion.div>
  );
}
