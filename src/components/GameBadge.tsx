// Kullanıcı XP/seviye/streak göstergesi - üst bara entegre edilebilir küçük rozet
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { Flame, Zap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { t } from "@/lib/i18n";

export default function GameBadge() {
  const { user, lang } = useApp();
  const tr = t(lang);
  const [stats, setStats] = useState<any>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("user_stats").select("*").eq("user_id", user.id).maybeSingle();
    if (data) setStats(data);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase.channel("stats_user")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_stats", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  if (!user || !stats) return null;

  const lvl = stats.level || 1;
  const xpForLevel = (l: number) => (l - 1) ** 2 * 100;
  const xpCurrent = xpForLevel(lvl);
  const xpNext = xpForLevel(lvl + 1);
  const progress = ((stats.xp - xpCurrent) / Math.max(1, xpNext - xpCurrent)) * 100;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-accent/40 hover:bg-accent/60 transition-colors text-xs">
          <span className="flex items-center gap-1 font-bold text-primary">
            <Zap className="size-3.5" />Lv {lvl}
          </span>
          <span className="text-muted-foreground">|</span>
          <span className="flex items-center gap-1 font-mono">
            <Flame className={`size-3.5 ${stats.current_streak > 0 ? "text-orange-500" : "text-muted-foreground"}`} />
            {stats.current_streak}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-semibold">{tr.level} {lvl}</span>
              <span className="font-mono text-muted-foreground">{stats.xp} / {xpNext} XP</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-accent/40">
              <div className="text-muted-foreground">{tr.streak}</div>
              <div className="font-bold text-base">🔥 {stats.current_streak} {tr.days}</div>
            </div>
            <div className="p-2 rounded-lg bg-accent/40">
              <div className="text-muted-foreground">{tr.win_rate}</div>
              <div className="font-bold text-base">
                {stats.total_trades > 0 ? Math.round((stats.profitable_trades / stats.total_trades) * 100) : 0}%
              </div>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground text-center">
            Total: {stats.total_trades} • {tr.pnl}: ${Number(stats.total_pnl).toFixed(2)}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
