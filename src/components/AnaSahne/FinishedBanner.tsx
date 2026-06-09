import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface FinishedBannerProps {
  winner: string | null;
  pot: number;
  /** Called after the 3s fade-out completes */
  onComplete: () => void;
}

const FinishedBanner: React.FC<FinishedBannerProps> = ({
  winner,
  pot,
  onComplete,
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Trigger CSS opacity fade (1 → 0 over 3s)
    setVisible(false);

    const timer = setTimeout(() => {
      onComplete();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className={cn(
        "glass border-border/40 shadow-card rounded-lg p-8 text-center",
        "transition-opacity duration-[3000ms] ease-in-out",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="text-6xl mb-4" role="img" aria-label="winner trophy">
        🏆
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">
        {winner ?? "Unknown"}
      </h2>
      <p className="text-lg text-muted-foreground">
        Prize:{" "}
        <span className="font-bold text-foreground tabular-nums">
          ${pot.toFixed(2)}
        </span>
      </p>
    </div>
  );
};

export default FinishedBanner;
