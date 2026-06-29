// Yeni kazanılan rozetleri toast olarak gösterir + ses/animasyon
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Lang } from "@/lib/i18n";

const ICON_MAP: Record<string, string> = {
  rocket: "🚀", "trending-up": "📈", flame: "🔥", medal: "🏅", layers: "🧩",
  crown: "👑", moon: "🌙", anchor: "⚓", undo: "↩️", sparkles: "✨", star: "⭐", trophy: "🏆",
};

async function fireConfetti() {
  try {
    const { default: confetti } = await import("canvas-confetti");
    const duration = 2000;
    const end = Date.now() + duration;
    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 60,
        origin: { x: 0, y: 0.7 },
        colors: ["#fbbf24", "#22c55e", "#3b82f6", "#a855f7"],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 60,
        origin: { x: 1, y: 0.7 },
        colors: ["#fbbf24", "#22c55e", "#3b82f6", "#a855f7"],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  } catch { /* confetti unavailable */ }
}

export async function celebrateAchievements(codes: string[], lang: Lang) {
  if (!codes || codes.length === 0) return;
  const { data } = await supabase.from("achievements").select("*").in("code", codes);
  if (!data) return;
  fireConfetti();
  for (const a of data) {
    const icon = ICON_MAP[a.icon] || "🏆";
    const name = lang === "tr" ? a.name_tr : a.name_en;
    const desc = lang === "tr" ? a.description_tr : a.description_en;
    toast({
      title: `${icon} ${lang === "tr" ? "Rozet kazandın!" : "Achievement unlocked!"} — ${name}`,
      description: `${desc} • +${a.xp_reward} XP`,
      duration: 6000,
    });
  }
}
