// Trade öncesi niyet kaydı + opsiyonel hedef/stop planı + (opsiyonel) duygu sorgusu
// Strateji 06 (zorunlu niyet) + Strateji 01 (yumuşak soğuma) + Sprint2 Pre-Commit Plan
import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";
import { Brain, Newspaper, Sparkle, Loader2, Target, ShieldAlert, ChevronDown, Clock, AlertTriangle } from "lucide-react";
import { EmotionalSignal, logEmotion, checkTradeCooldown, getWinningStreakCount } from "@/hooks/useEmotionalSignal";

export type IntentTag = "technical" | "news" | "intuition";

export interface IntentResult {
  tag: IntentTag;
  note: string;
  mood: string | null;
  signal: EmotionalSignal;
  planned_tp: number | null;
  planned_sl: number | null;
}

interface Props {
  open: boolean;
  side: "buy" | "sell" | "close";
  symbol: string;
  qty: number;
  price: number | null;
  signal: EmotionalSignal;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (intent: IntentResult) => void;
}

const SIGNAL_COPY: Record<NonNullable<EmotionalSignal>, { tr: string; en: string }> = {
  rapid_fire: { tr: "Son 5 dakikada birkaç işlem yaptın.", en: "You made several trades in the last 5 minutes." },
  reactive: { tr: "Az önce bir pozisyon kapattın.", en: "You just closed a position." },
  oversize: { tr: "Bu işlem normal pozisyonundan büyük.", en: "This trade is larger than your usual size." },
};

export default function IntentDialog({ open, side, symbol, qty, price, signal, submitting, onCancel, onConfirm }: Props) {
  const { user, lang } = useApp();
  const [tag, setTag] = useState<IntentTag | null>(null);
  const [note, setNote] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [planOpen, setPlanOpen] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setTag(null); setNote(""); setMood(null);
      setTp(""); setSl(""); setPlanOpen(false);
    }
  }, [open]);

  const total = qty * (price ?? 0);
  const { demoBalance, realBalance, balanceLoaded } = useApp();
  const portfolioVal = balanceLoaded ? (demoBalance || realBalance || 100000) : 100000;
  const pctOfPortfolio = portfolioVal > 0 ? (total / portfolioVal) * 100 : 0;

  // Risk score 1-10
  const riskScore = useMemo(() => {
    let score = 1;
    // position size vs portfolio
    if (pctOfPortfolio > 30) score += 4;
    else if (pctOfPortfolio > 15) score += 3;
    else if (pctOfPortfolio > 5) score += 2;
    else if (pctOfPortfolio > 1) score += 1;
    // signal amplifies
    if (signal === "oversize") score += 2;
    if (signal === "rapid_fire") score += 1;
    return Math.min(10, Math.max(1, score));
  }, [pctOfPortfolio, signal]);

  const riskColor = riskScore <= 4 ? "text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/30"
    : riskScore <= 7 ? "text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
    : "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30";

  // Cooldown check
  const cooldownUntil = checkTradeCooldown();
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  useEffect(() => {
    if (!cooldownUntil) { setCooldownRemaining(0); return; }
    const tick = () => {
      const rem = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownRemaining(rem);
      if (rem <= 0) setCooldownRemaining(0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil, open]);

  // Overconfidence check
  const winStreak = useMemo(() => getWinningStreakCount(), [open]);
  const showOverconfidence = winStreak >= 5;

  const sideLabel = side === "buy" ? (lang === "tr" ? "AL" : "BUY")
                   : side === "sell" ? (lang === "tr" ? "SAT" : "SELL")
                   : (lang === "tr" ? "KAPAT" : "CLOSE");

  const handleMood = (m: string) => {
    setMood(m);
    if (user && signal) logEmotion({ userId: user.id, signalType: signal, mood: m, symbol });
  };

  const handleSkipMood = () => {
    setMood("skip");
    if (user && signal) logEmotion({ userId: user.id, signalType: signal, mood: null, symbol });
  };

  // Plan değerlerinin yönle uyumlu olduğunu doğrula
  const tpNum = tp ? Number(tp) : null;
  const slNum = sl ? Number(sl) : null;
  const planValid = (() => {
    if (price == null || side === "close") return true;
    if (tpNum != null) {
      if (!isFinite(tpNum) || tpNum <= 0) return false;
      if (side === "buy" && tpNum <= price) return false;
      if (side === "sell" && tpNum >= price) return false;
    }
    if (slNum != null) {
      if (!isFinite(slNum) || slNum <= 0) return false;
      if (side === "buy" && slNum >= price) return false;
      if (side === "sell" && slNum <= price) return false;
    }
    return true;
  })();

  const canConfirm = !!tag && !submitting && planValid && cooldownRemaining <= 0;

  const fmt = (n: number) => n.toFixed(n < 5 ? 4 : 2);
  const tpHint = price != null && side === "buy" ? `> $${fmt(price)}` : price != null && side === "sell" ? `< $${fmt(price)}` : "";
  const slHint = price != null && side === "buy" ? `< $${fmt(price)}` : price != null && side === "sell" ? `> $${fmt(price)}` : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>{lang === "tr" ? "İşlemi Onayla" : "Confirm Trade"}</span>
            <span className={cn(
              "text-xs font-mono uppercase px-2 py-0.5 rounded",
              side === "buy" ? "bg-bull/15 text-bull" :
              side === "sell" ? "bg-bear/15 text-bear" :
              "bg-muted text-muted-foreground"
            )}>{sideLabel}</span>
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {symbol} • {qty} @ {price !== null ? `$${fmt(price)}` : "—"}
            {price !== null && <span className="text-muted-foreground"> • ≈ ${total.toFixed(2)}</span>}
          </DialogDescription>
        </DialogHeader>

        {/* Soft cooling layer */}
        {signal && mood === null && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
            <div className="text-[11px] text-yellow-700 dark:text-yellow-400">
              {SIGNAL_COPY[signal][lang]} {lang === "tr" ? "Şu an nasıl hissediyorsun?" : "How do you feel right now?"}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { v: "calm", e: "😌", tr: "Sakin", en: "Calm" },
                { v: "focused", e: "🎯", tr: "Odaklı", en: "Focused" },
                { v: "excited", e: "⚡", tr: "Heyecanlı", en: "Excited" },
                { v: "angry", e: "😤", tr: "Kızgın", en: "Angry" },
              ].map((m) => (
                <button key={m.v} type="button" onClick={() => handleMood(m.v)}
                  className="flex flex-col items-center gap-0.5 py-2 rounded-md border border-border/40 hover:bg-accent text-[10px]">
                  <span className="text-base">{m.e}</span>
                  <span>{lang === "tr" ? m.tr : m.en}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={handleSkipMood} className="w-full text-[10px] text-muted-foreground hover:underline">
              {lang === "tr" ? "Atla (3sn)" : "Skip (3s)"}
            </button>
          </div>
        )}

        {/* Risk Overlay — position size + risk score */}
        <div className={cn("rounded-lg border p-3 space-y-1.5", riskColor)}>
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              {lang === "tr" ? "Risk Skoru" : "Risk Score"}
            </span>
            <span className="font-mono font-bold text-sm">
              {riskScore}/10
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <div className={cn("flex-1 h-1.5 rounded-full overflow-hidden", riskColor.replace(/text-\w+-\d+/g, ""))}>
              <div
                className={cn("h-full rounded-full transition-all", riskScore <= 4 ? "bg-green-500" : riskScore <= 7 ? "bg-yellow-500" : "bg-red-500")}
                style={{ width: `${(riskScore / 10) * 100}%` }}
              />
            </div>
            <span className="font-mono font-medium">{pctOfPortfolio.toFixed(1)}%</span>
          </div>
          <div className="text-[10px] opacity-80">
            {riskScore <= 4
              ? (lang === "tr" ? "Düşük risk — portföyün küçük bir kısmı" : "Low risk — small portion of portfolio")
              : riskScore <= 7
              ? (lang === "tr" ? "Orta risk — dikkatli pozisyon yönetimi" : "Moderate risk — manage position carefully")
              : (lang === "tr" ? "⚠️ Yüksek risk — bu işlem portföyün önemli bir kısmı" : "⚠️ High risk — substantial portion of portfolio")}
          </div>
        </div>

        {/* Overconfidence Warning */}
        {showOverconfidence && (
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-orange-600 dark:text-orange-400">
              <AlertTriangle className="size-3.5" />
              {lang === "tr" ? "Overconfidence Uyarısı" : "Overconfidence Warning"}
            </div>
            <div className="text-[11px] text-orange-700 dark:text-orange-300">
              {lang === "tr"
                ? `Son ${winStreak} işlemin kârlı. Overconfidence'a dikkat!`
                : `Last ${winStreak} trades profitable. Watch for overconfidence!`}
            </div>
          </div>
        )}

        {/* Cooldown Banner */}
        {cooldownRemaining > 0 && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400">
              <Clock className="size-3.5" />
              {lang === "tr" ? "Soğuma Süresi" : "Cooldown Active"}
            </div>
            <div className="text-[11px] text-red-700 dark:text-red-300">
              {lang === "tr"
                ? `Arka arkaya 3 zarar. ${cooldownRemaining}sn bekle.`
                : `3 consecutive losses. Wait ${cooldownRemaining}s.`}
            </div>
          </div>
        )}
        {(!signal || mood !== null) && (
          <>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {lang === "tr" ? "Bu pozisyonu neden açıyorsun?" : "Why are you opening this position?"}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: "technical" as const, icon: Brain, tr: "Teknik sinyal", en: "Technical" },
                  { v: "news" as const, icon: Newspaper, tr: "Haber", en: "News" },
                  { v: "intuition" as const, icon: Sparkle, tr: "Sezgi", en: "Intuition" },
                ].map(({ v, icon: Icon, tr, en }) => (
                  <button
                    key={v} type="button" onClick={() => setTag(v)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 py-3 rounded-lg border-2 transition-all text-xs",
                      tag === v
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border/40 hover:border-border text-muted-foreground"
                    )}
                  >
                    <Icon className="size-5" />
                    <span>{lang === "tr" ? tr : en}</span>
                  </button>
                ))}
              </div>
            </div>

            <Input
              placeholder={lang === "tr" ? "Kısa not (opsiyonel)" : "Short note (optional)"}
              value={note} onChange={(e) => setNote(e.target.value.slice(0, 140))}
              maxLength={140} className="h-9 text-sm"
            />

            {/* Pre-commit Plan — opsiyonel TP/SL */}
            {side !== "close" && price != null && (
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPlanOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-accent/40 transition-colors"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Target className="size-3.5" />
                    {lang === "tr" ? "Plan ekle (opsiyonel)" : "Add plan (optional)"}
                    {(tpNum || slNum) && (
                      <span className="text-[10px] text-primary font-semibold">
                        {tpNum ? `TP $${fmt(tpNum)}` : ""}{tpNum && slNum ? " · " : ""}{slNum ? `SL $${fmt(slNum)}` : ""}
                      </span>
                    )}
                  </span>
                  <ChevronDown className={cn("size-3.5 transition-transform", planOpen && "rotate-180")} />
                </button>
                {planOpen && (
                  <div className="p-3 pt-1 space-y-2 bg-card/50">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1">
                          <Target className="size-2.5 text-bull" /> {lang === "tr" ? "Hedef" : "Target"}
                          <span className="text-[9px] opacity-60 ml-auto">{tpHint}</span>
                        </label>
                        <Input
                          type="number" step="any" inputMode="decimal"
                          value={tp} onChange={(e) => setTp(e.target.value)}
                          placeholder="—" className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1">
                          <ShieldAlert className="size-2.5 text-bear" /> {lang === "tr" ? "Stop" : "Stop"}
                          <span className="text-[9px] opacity-60 ml-auto">{slHint}</span>
                        </label>
                        <Input
                          type="number" step="any" inputMode="decimal"
                          value={sl} onChange={(e) => setSl(e.target.value)}
                          placeholder="—" className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>
                    {!planValid && (
                      <div className="text-[10px] text-bear">
                        {lang === "tr"
                          ? "Hedef/Stop seviyeleri yönle uyumsuz."
                          : "Target/Stop levels don't match the side."}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      {lang === "tr"
                        ? "Pozisyonu kapatınca planına ne kadar uyduğun ölçülecek."
                        : "We'll measure how closely you stuck to your plan when you close."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={onCancel} disabled={submitting} className="flex-1">
            {lang === "tr" ? "Vazgeç" : "Cancel"}
          </Button>
          <Button
            onClick={() => tag && onConfirm({
              tag, note, mood, signal,
              planned_tp: tpNum && planValid ? tpNum : null,
              planned_sl: slNum && planValid ? slNum : null,
            })}
            disabled={!canConfirm}
            className={cn(
              "flex-1 font-semibold",
              side === "buy" ? "gradient-bull text-bull-foreground" :
              side === "sell" ? "bg-bear text-bear-foreground hover:bg-bear/90" :
              "gradient-primary text-primary-foreground"
            )}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : (lang === "tr" ? "Onayla" : "Confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
