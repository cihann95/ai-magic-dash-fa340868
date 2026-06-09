// Live PnL ranking with Framer Motion AnimatePresence and color-coded percentages
import { AnimatePresence, motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface BlitzLeaderboardProps {
  ranking: [string, number][];
  usernames: Record<string, string>;
  userId: string;
  entryFee: number;
  isActive: boolean;
}

export function BlitzLeaderboard({
  ranking,
  usernames,
  userId,
  entryFee,
  isActive,
}: BlitzLeaderboardProps) {
  return (
    <aside className="rounded-2xl glass border border-border/40 p-4 overflow-auto">
      <div className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Trophy className="size-4 text-primary" /> Canlı Sıralama
      </div>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {ranking.map(([uid, pnl], idx) => {
            const isMe = uid === userId;
            const pnlPct = entryFee > 0 ? (pnl / Number(entryFee)) * 100 : 0;
            return (
              <motion.div
                layout
                key={uid}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 26 }}
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg border border-border/40",
                  isMe && "bg-primary/10 border-primary/40",
                  idx === 0 && isActive && "ring-1 ring-amber-400/40",
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "size-6 rounded-full text-xs flex items-center justify-center font-bold",
                      idx === 0 ? "bg-amber-400/20 text-amber-400" : "bg-muted",
                    )}
                  >
                    {idx + 1}
                  </div>
                  <div className="text-sm font-medium truncate max-w-[110px]">
                    {usernames[uid] ?? (isMe ? "Sen" : "Oyuncu")}
                    {isMe && <span className="text-[10px] text-primary ml-1">(siz)</span>}
                  </div>
                </div>
                <motion.div
                  key={Math.sign(pnl)}
                  initial={{ scale: 1.15 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.25 }}
                  className={cn(
                    "text-sm font-bold tabular-nums",
                    pnl > 0 ? "text-green-500" : pnl < 0 ? "text-red-500" : "text-muted-foreground",
                  )}
                >
                  {pnl >= 0 ? "+" : ""}
                  {pnlPct.toFixed(2)}%
                </motion.div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </aside>
  );
}
