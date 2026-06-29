import { useDailyStreak } from "@/hooks/useDailyStreak";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export default function StreakBadge() {
  const { streak, isNewDay } = useDailyStreak();

  if (streak === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono transition-all",
        isNewDay
          ? "bg-orange-500/15 text-orange-500 animate-pulse"
          : "text-muted-foreground",
      )}
      title={`Daily streak: ${streak} day${streak > 1 ? "s" : ""}`}
    >
      <Flame
        className={cn(
          "size-3.5",
          streak > 0 ? "text-orange-500" : "text-muted-foreground",
        )}
      />
      <span>{streak}</span>
    </div>
  );
}
