import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

interface PlayerCardProps {
  username: string;
  side: "long" | "short" | null;
  pnl: number;
  pnlPct: number;
  isWinner: boolean;
  index: number;
}

export function PlayerCard({ username, side, pnl, pnlPct, isWinner, index }: PlayerCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, type: "spring", stiffness: 320, damping: 26 }}
      className={cn(
        "flex items-center justify-between p-3 rounded-2xl glass border border-border/40",
        isWinner && "ring-1 ring-amber-400/40 shadow-glow",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Rank badge */}
        <div
          className={cn(
            "size-7 rounded-full text-xs flex items-center justify-center font-bold shrink-0",
            index === 0 ? "bg-amber-400/20 text-amber-400" : "bg-gray-300/20 text-gray-300",
          )}
        >
          {index + 1}
        </div>

        {/* Username */}
        <span className="text-sm font-medium truncate max-w-[12ch]">{username}</span>

        {/* Side indicator */}
        {side === "long" && <span className="text-green-500 text-xs font-bold shrink-0">↑</span>}
        {side === "short" && <span className="text-red-500 text-xs font-bold shrink-0">↓</span>}
        {!side && <span className="text-muted-foreground text-xs shrink-0">—</span>}
      </div>

      <div className="flex flex-col items-end shrink-0 ml-3">
        {/* PnL */}
        <motion.span
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
          {pnl.toFixed(2)}
        </motion.span>

        {/* PnL% */}
        <span
          className={cn(
            "text-[10px] tabular-nums leading-none",
            pnlPct > 0
              ? "text-green-500/70"
              : pnlPct < 0
                ? "text-red-500/70"
                : "text-muted-foreground/70",
          )}
        >
          {pnlPct >= 0 ? "+" : ""}
          {pnlPct.toFixed(2)}%
        </span>
      </div>
    </motion.div>
  );
}
