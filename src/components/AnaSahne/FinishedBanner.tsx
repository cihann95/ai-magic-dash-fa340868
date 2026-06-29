import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";

const FADE_DURATION_MS = 3000;

interface FinishedBannerProps {
  winner: string | null;
  pot: number;
  /** Called after the fade-out completes */
  onComplete: () => void;
}

const FinishedBanner: React.FC<FinishedBannerProps> = ({
  winner,
  pot,
  onComplete,
}) => {
  const { lang } = useApp();
  const tr = t(lang);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(false);

    const timer = setTimeout(() => {
      onComplete();
    }, FADE_DURATION_MS);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className={cn(
        "glass border-border/40 shadow-card rounded-lg p-8 text-center",
        "transition-opacity duration-1000 ease-in-out",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="text-6xl mb-4" role="img" aria-label="winner trophy">
        🏆
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">
        {winner ?? tr.player_unknown}
      </h2>
      <p className="text-lg text-muted-foreground">
        {tr.prize_pool}:{" "}
        <span className="font-bold text-foreground tabular-nums">
          ${pot.toFixed(2)}
        </span>
      </p>
    </div>
  );
};

export default FinishedBanner;
