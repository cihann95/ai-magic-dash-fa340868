// Trader Persona Onboarding — 4 soru: deneyim, hedef, risk, ana kategori.
// Sonuç profiles.trader_persona JSONB olarak kaydedilir.
// OnboardingTour bittikten sonra (onboarding_completed=true ama persona null ise) açılır.
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Json } from "../integrations/supabase/types";
import { Compass, Target, ShieldCheck, Layers, ChevronRight, Sparkles } from "lucide-react";

type Persona = {
  experience: "new" | "some" | "pro";
  goal: "learn" | "income" | "wealth" | "fun";
  risk: "low" | "medium" | "high";
  focus: "crypto" | "stocks" | "forex" | "mixed";
};

const QUESTIONS = [
  {
    key: "experience" as const,
    icon: Compass,
    color: "from-blue-500 to-cyan-500",
    tr: "İşlem deneyimin ne kadar?", en: "How much trading experience do you have?",
    options: [
      { v: "new", tr: "Yeniyim", en: "I'm new" },
      { v: "some", tr: "Biraz deneyimliyim", en: "Some experience" },
      { v: "pro", tr: "Tecrübeliyim", en: "Experienced" },
    ],
  },
  {
    key: "goal" as const,
    icon: Target,
    color: "from-purple-500 to-pink-500",
    tr: "Buradaki ana hedefin ne?", en: "What is your main goal here?",
    options: [
      { v: "learn", tr: "Öğrenmek", en: "Learn" },
      { v: "income", tr: "Düzenli gelir", en: "Steady income" },
      { v: "wealth", tr: "Uzun vadeli birikim", en: "Long-term wealth" },
      { v: "fun", tr: "Eğlence / merak", en: "Fun / curiosity" },
    ],
  },
  {
    key: "risk" as const,
    icon: ShieldCheck,
    color: "from-emerald-500 to-teal-500",
    tr: "Risk konforun?", en: "Your risk comfort?",
    options: [
      { v: "low", tr: "Düşük — sermaye koruma", en: "Low — capital preservation" },
      { v: "medium", tr: "Orta — dengeli", en: "Medium — balanced" },
      { v: "high", tr: "Yüksek — fırsatçı", en: "High — opportunistic" },
    ],
  },
  {
    key: "focus" as const,
    icon: Layers,
    color: "from-orange-500 to-rose-500",
    tr: "En çok hangi pazara odaklanacaksın?", en: "Which market will you focus on?",
    options: [
      { v: "crypto", tr: "Kripto", en: "Crypto" },
      { v: "stocks", tr: "Hisse", en: "Stocks" },
      { v: "forex", tr: "Forex / emtia", en: "Forex / commodities" },
      { v: "mixed", tr: "Karma", en: "Mixed" },
    ],
  },
];

export default function PersonaOnboarding() {
  const { user, lang } = useApp();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<Persona>>({});
  const [saving, setSaving] = useState(false);

  // Per-user fetch guard: her sayfa navigation'ında yeniden fetch etme,
  // ve query hata verirse sonsuz popup loop'undan kaçın.
  // user?.id değişmediği sürece effect'i bir kez çalıştır.
  const fetchedForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!user || fetchedForUser.current === user.id) return;
    fetchedForUser.current = user.id;
    let cancelled = false;
    (async () => {
      try {
        const { data: stats } = await supabase.from("user_stats")
          .select("onboarding_completed").eq("user_id", user.id).maybeSingle();
        const { data: profile } = await supabase.from("profiles")
          .select("trader_persona").eq("id", user.id).maybeSingle();
        if (cancelled) return;
        const personaMissing = profile !== null && !profile.trader_persona;
        if (stats?.onboarding_completed && personaMissing) setOpen(true);
      } catch {
        // Sessizce yut — bir sonraki mount'ta tekrar denenecek
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const current = QUESTIONS[step];
  const Icon = current.icon;
  const isLast = step === QUESTIONS.length - 1;
  const selected = answers[current.key];

  const finish = async (full: Persona) => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ trader_persona: full as unknown as Json }).eq("id", user.id);
      if (error) throw error;
      setOpen(false);
    } catch (e) {
      console.error("Failed to save persona", e);
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (v: string) => {
    const next = { ...answers, [current.key]: v } as Partial<Persona>;
    setAnswers(next);
    if (isLast && Object.keys(next).length === QUESTIONS.length) {
      finish(next as Persona);
    } else {
      setTimeout(() => setStep((s) => Math.min(s + 1, QUESTIONS.length - 1)), 180);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* zorunlu — dışarı tıklamayla kapanmasın */ }}>
      <DialogContent
        className="max-w-md p-0 gap-0 overflow-hidden border-border/40 [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">
          {lang === "tr" ? "Seni tanıyalım" : "Get to know you"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {lang === "tr"
            ? "Yatırım deneyimini ve hedeflerini öğrenmemize yardım eden kısa bir anket."
            : "A short survey to help us understand your trading experience and goals."}
        </DialogDescription>
        <div className={cn("bg-gradient-to-br p-7 text-white", current.color)}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="size-4 opacity-80" />
            <span className="text-[11px] font-medium opacity-80 uppercase tracking-wider">
              {lang === "tr" ? "Seni tanıyalım" : "Get to know you"} · {step + 1}/{QUESTIONS.length}
            </span>
          </div>
          <div className="size-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mb-3">
            <Icon className="size-6" />
          </div>
          <h2 className="text-xl font-bold leading-snug">
            {lang === "tr" ? current.tr : current.en}
          </h2>
        </div>

        <div className="p-5 space-y-2">
          {current.options.map((opt) => {
            const isSel = selected === opt.v;
            return (
              <button
                key={opt.v}
                disabled={saving}
                onClick={() => handleSelect(opt.v)}
                className={cn(
                  "w-full text-left flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all",
                  "hover:border-primary/60 hover:bg-accent/40",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isSel ? "border-primary bg-primary/10" : "border-border/40"
                )}
              >
                <span className={cn(
                  "size-5 rounded-full border-2 shrink-0 transition-all",
                  isSel ? "border-primary bg-primary" : "border-border"
                )} />
                <span className={cn("text-sm font-medium", isSel && "text-primary")}>
                  {lang === "tr" ? opt.tr : opt.en}
                </span>
              </button>
            );
          })}

          <div className="flex items-center justify-between pt-3">
            <div className="flex gap-1">
              {QUESTIONS.map((_, i) => (
                <div key={i} className={cn(
                  "h-1 rounded-full transition-all",
                  i < step ? "w-4 bg-primary" : i === step ? "w-8 bg-primary" : "w-4 bg-muted"
                )} />
              ))}
            </div>
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={saving}>
                <ChevronRight className="size-3 rotate-180 mr-1" />
                {lang === "tr" ? "Geri" : "Back"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
