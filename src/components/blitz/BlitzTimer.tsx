// Blitz countdown timer with spring animation, price/pot display, and sound toggle
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/symbols";
import { cn } from "@/lib/utils";

interface BlitzTimerProps {
  secondsLeft: number | null;
  status: string;
  isActive: boolean;
  symbol: string;
  price: number | null;
  pot: number;
  sfxOn: boolean;
  onToggleSfx: () => void;
  onTick?: () => void;
}

export function BlitzTimer({
  secondsLeft,
  status,
  isActive,
  symbol,
  price,
  pot,
  sfxOn,
  onToggleSfx,
}: BlitzTimerProps) {
  const isWaiting = status === "waiting";
  const isFinished = status === "finished" || status === "settling";

  return (
    <Card
      className={cn(
        "p-4 glass flex items-center justify-between relative overflow-hidden transition-colors",
        secondsLeft !== null && secondsLeft <= 5 && secondsLeft > 0 && "ring-2 ring-destructive/60",
      )}
    >
      <div>
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          {symbol}
          <button
            onClick={onToggleSfx}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center opacity-60 hover:opacity-100 -my-2"
            title={sfxOn ? "Sesi kapat" : "Sesi aç"}
          >
            {sfxOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
        </div>
        <div className="text-xl font-bold">${formatPrice(price)}</div>
      </div>
      <motion.div
        key={secondsLeft ?? "x"}
        initial={secondsLeft !== null && secondsLeft <= 5 ? { scale: 1.25 } : false}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 18 }}
        className={cn(
          "text-6xl md:text-6xl font-bold tabular-nums tracking-tight",
          secondsLeft !== null && secondsLeft <= 10 ? "text-destructive" : "text-primary",
          secondsLeft !== null && secondsLeft <= 5 && "drop-shadow-[0_0_12px_hsl(var(--destructive)/0.7)]",
        )}
      >
        {isWaiting && "—:—"}
        {isActive && secondsLeft !== null && `0:${secondsLeft.toString().padStart(2, "0")}`}
        {isFinished && "0:00"}
      </motion.div>
      <div className="text-right">
        <div className="text-xs text-muted-foreground">Havuz</div>
        <div className="text-xl font-bold">${Number(pot).toFixed(2)}</div>
      </div>
    </Card>
  );
}
