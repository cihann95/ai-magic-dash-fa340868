import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, string> = {
  rocket: "🚀", "trending-up": "📈", flame: "🔥", medal: "🏅", layers: "🧩",
  crown: "👑", moon: "🌙", anchor: "⚓", undo: "↩️", sparkles: "✨", star: "⭐", trophy: "🏆",
};

const RARITY_COLOR: Record<string, string> = {
  common: "from-slate-500 to-slate-600",
  rare: "from-blue-500 to-cyan-500",
  epic: "from-purple-500 to-pink-500",
  legendary: "from-yellow-400 via-orange-500 to-red-500",
};

function AchievementsInner() {
  const { user, lang } = useApp();
  const tr = t(lang);
  const [all, setAll] = useState<Database["public"]["Tables"]["achievements"]["Row"][]>([]);
  const [earned, setEarned] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("achievements").select("*").order("xp_reward"),
      supabase.from("user_achievements").select("achievement_code").eq("user_id", user.id),
    ]).then(([a, e]) => {
      setAll(a.data ?? []);
      setEarned(new Set((e.data ?? []).map((x) => x.achievement_code)));
    });
  }, [user]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold">{tr.achievements} ({earned.size} / {all.length})</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {all.map((a) => {
            const got = earned.has(a.code);
            return (
              <Card key={a.code} className={cn("p-4 glass border-border/40 transition-all", !got && "opacity-50 grayscale")}>
                <div className={cn("size-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-2xl mb-3", RARITY_COLOR[a.rarity])}>
                  {ICON_MAP[a.icon] || "🏆"}
                </div>
                <div className="font-bold text-sm">{lang === "tr" ? a.name_tr : a.name_en}</div>
                <div className="text-xs text-muted-foreground mt-1 leading-tight">{lang === "tr" ? a.description_tr : a.description_en}</div>
                <div className="flex items-center justify-between mt-3 text-xs">
                  <span className="font-mono text-primary">+{a.xp_reward} XP</span>
                  <span className={cn("text-[10px] uppercase font-bold", got ? "text-bull" : "text-muted-foreground")}>
                    {got ? tr.earned : tr.locked}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

export default function Achievements() { return <ProtectedRoute><AchievementsInner /></ProtectedRoute>; }
