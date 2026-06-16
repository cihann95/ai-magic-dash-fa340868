// 4 adımlı interaktif onboarding modal'ı
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BarChart3, Brain, MousePointerClick, Rocket, ChevronRight } from "lucide-react";

export default function OnboardingTour() {
  const { user, lang } = useApp();
  const tr = t(lang);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const fetchedForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!user || fetchedForUser.current === user.id) return;
    fetchedForUser.current = user.id;
    supabase.from("user_stats").select("onboarding_completed").eq("user_id", user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) return;
        if (data && !data.onboarding_completed) setOpen(true);
      });
  }, [user]);

  const steps = [
    { icon: MousePointerClick, title: tr.onb_step1_title, desc: tr.onb_step1_desc, color: "from-blue-500 to-cyan-500" },
    { icon: BarChart3, title: tr.onb_step2_title, desc: tr.onb_step2_desc, color: "from-purple-500 to-pink-500" },
    { icon: Rocket, title: tr.onb_step3_title, desc: tr.onb_step3_desc, color: "from-green-500 to-emerald-500" },
    { icon: Brain, title: tr.onb_step4_title, desc: tr.onb_step4_desc, color: "from-orange-500 to-rose-500" },
  ];

  const finish = async () => {
    if (user) {
      await supabase.rpc("mark_onboarding_complete");
    }
    // Bildirim izni iste
    if ("Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch { return; }
    }
    setOpen(false);
  };

  const current = steps[step];
  const Icon = current.icon;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && finish()}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden border-border/40">
        <DialogTitle className="sr-only">
          {lang === "tr" ? "Lumen Trade'e Hoş Geldin" : "Welcome to Lumen Trade"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {current.title} — {current.desc}
        </DialogDescription>
        <div className={`bg-gradient-to-br ${current.color} p-8 text-white`}>
          <div className="size-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mb-4">
            <Icon className="size-8" />
          </div>
          <div className="text-xs font-medium opacity-80 mb-1">{step + 1} / {steps.length}</div>
          <h2 className="text-2xl font-bold">{current.title}</h2>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-muted-foreground leading-relaxed">{current.desc}</p>
          <div className="flex gap-1.5 pt-2">
            {steps.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
          <div className="flex justify-between gap-2 pt-4">
            <Button variant="ghost" onClick={finish}>{tr.skip}</Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} className="gradient-primary text-primary-foreground">
                {tr.next} <ChevronRight className="size-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={finish} className="gradient-primary text-primary-foreground">{tr.finish}</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
