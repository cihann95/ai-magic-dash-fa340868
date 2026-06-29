// Unified 3-step onboarding: Welcome → Risk → First Symbol
// Merges OnboardingTour + PersonaOnboarding, saves both onboarding_completed and trader_persona
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Rocket, ShieldCheck, MousePointerClick, Sparkles, ChevronRight } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

type RiskTolerance = "conservative" | "moderate" | "aggressive";

const RISK_OPTIONS = [
  { v: "conservative" as RiskTolerance, tr: "Düşük — sermaye koruma", en: "Low — capital preservation", icon: "🛡️" },
  { v: "moderate" as RiskTolerance, tr: "Orta — dengeli", en: "Medium — balanced", icon: "⚖️" },
  { v: "aggressive" as RiskTolerance, tr: "Yüksek — fırsatçı", en: "High — opportunistic", icon: "🚀" },
];

export default function UnifiedOnboarding() {
  const { user, lang } = useApp();
  const navigate = useNavigate();
  const tr = t(lang);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0); // 0=welcome, 1=risk, 2=first-symbol
  const [risk, setRisk] = useState<RiskTolerance | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchedForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!user || fetchedForUser.current === user.id) return;
    fetchedForUser.current = user.id;
    supabase.from("user_stats").select("onboarding_completed").eq("user_id", user.id).maybeSingle()
      .then(async ({ data, error }) => {
        if (error) { console.warn("[UnifiedOnboarding] user_stats query failed:", error.message); return; }
        if (!data || !data.onboarding_completed) {
          setOpen(true);
          if (!data) {
            await supabase.from("user_stats").upsert({ user_id: user.id, onboarding_completed: false });
          }
        }
      });
  }, [user]);

  const savePersona = async (riskVal: RiskTolerance) => {
    const persona = {
      risk_tolerance: riskVal,
      experience: "new",
      goal: "learn",
      risk: riskVal === "aggressive" ? "high" : riskVal === "moderate" ? "medium" : "low",
      focus: "mixed",
    };
    await supabase.from("profiles").update({ trader_persona: persona as unknown as Json }).eq("id", user!.id);
  };

  const finish = async (skipRisk?: boolean) => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const riskVal: RiskTolerance = skipRisk ? "moderate" : (risk || "moderate");
      await savePersona(riskVal);
      await supabase.rpc("mark_onboarding_complete");
      if ("Notification" in window && Notification.permission === "default") {
        try { await Notification.requestPermission(); } catch { /* ignore */ }
      }
      setOpen(false);
      navigate("/");
    } catch (e) {
      console.error("[UnifiedOnboarding] failed:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) finish(true); }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden border-border/40">
        <DialogTitle className="sr-only">
          {lang === "tr" ? "Lumen Trade'e Hoş Geldin" : "Welcome to Lumen Trade"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {step === 0 && (lang === "tr" ? "Platforma giriş" : "Platform intro")}
          {step === 1 && (lang === "tr" ? "Risk toleransı" : "Risk tolerance")}
          {step === 2 && (lang === "tr" ? "İlk sembol" : "First symbol")}
        </DialogDescription>

        {/* Progress bar */}
        <div className="flex gap-1 p-4 pb-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>

        {/* Step 0: Welcome + demo balance */}
        {step === 0 && (
          <>
            <div className="p-6 text-center">
              <div className="mx-auto size-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-4 shadow-glow">
                <Rocket className="size-8 text-white" />
              </div>
              <div className="text-xs font-medium text-muted-foreground mb-1">{lang === "tr" ? "Adım" : "Step"} 1/3</div>
              <h2 className="text-2xl font-bold mb-2">{lang === "tr" ? "Lumen Trade'e Hoş Geldin" : "Welcome to Lumen Trade"}</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                {lang === "tr"
                  ? "Demo bakiyen $100,000 ile sıfır riskli işlem deneyimine başla. Profesyonel grafikler, AI destekli analizler ve gerçek zamanlı veriler seni bekliyor."
                  : "Start with a $100,000 demo balance — zero risk. Professional charts, AI-powered analysis, and real-time data await."}
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary font-semibold text-lg">
                $100,000 <span className="text-xs font-normal text-muted-foreground">{lang === "tr" ? "demo bakiye" : "demo balance"}</span>
              </div>
            </div>
            <div className="flex justify-between gap-2 p-4 pt-0">
              <Button variant="ghost" onClick={() => finish(true)}>{tr.skip}</Button>
              <Button onClick={() => setStep(1)} className="gradient-primary text-primary-foreground">
                {tr.next} <ChevronRight className="size-4 ml-1" />
              </Button>
            </div>
          </>
        )}

        {/* Step 1: Risk tolerance */}
        {step === 1 && (
          <>
            <div className="p-6 pb-2">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="size-4 opacity-80" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  2/3 · {lang === "tr" ? "Risk Toleransı" : "Risk Tolerance"}
                </span>
              </div>
              <div className="size-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-3">
                <ShieldCheck className="size-6 text-white" />
              </div>
              <h2 className="text-xl font-bold leading-snug mb-4">{lang === "tr" ? "Risk toleransın nedir?" : "What is your risk tolerance?"}</h2>
              <div className="space-y-2">
                {RISK_OPTIONS.map((opt) => {
                  const isSel = risk === opt.v;
                  return (
                    <button
                      key={opt.v}
                      disabled={saving}
                      onClick={() => { setRisk(opt.v); setTimeout(() => setStep(2), 180); }}
                      className={cn(
                        "w-full text-left flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all",
                        "hover:border-primary/60 hover:bg-accent/40",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        isSel ? "border-primary bg-primary/10" : "border-border/40"
                      )}
                    >
                      <span className="text-xl">{opt.icon}</span>
                      <span className={cn("text-sm font-medium", isSel && "text-primary")}>
                        {lang === "tr" ? opt.tr : opt.en}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-between gap-2 p-4">
              <Button variant="ghost" onClick={() => finish(true)}>{tr.skip}</Button>
              <Button onClick={() => setStep(2)} disabled={!risk} className="gradient-primary text-primary-foreground">
                {tr.next} <ChevronRight className="size-4 ml-1" />
              </Button>
            </div>
          </>
        )}

        {/* Step 2: First symbol CTA */}
        {step === 2 && (
          <>
            <div className="p-6 text-center">
              <div className="mx-auto size-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4 shadow-glow">
                <MousePointerClick className="size-8 text-white" />
              </div>
              <div className="text-xs font-medium text-muted-foreground mb-1">3/3</div>
              <h2 className="text-2xl font-bold mb-2">{lang === "tr" ? "İlk sembolünü seç" : "Pick your first symbol"}</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                {lang === "tr"
                  ? "Sol panelden bir varlık seçerek grafiği açabilir, analiz yapabilir ve ilk işlemini gerçekleştirebilirsin."
                  : "Choose an asset from the left panel to open its chart, analyze it, and place your first trade."}
              </p>
            </div>
            <div className="flex justify-between gap-2 p-4 pt-0">
              <Button variant="ghost" onClick={() => finish(true)}>{tr.skip}</Button>
              <Button onClick={() => finish()} disabled={saving} className="gradient-primary text-primary-foreground">
                {tr.finish} <ChevronRight className="size-4 ml-1" />
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
