import React from "react";
import { cn } from "@/lib/utils";

interface EmptyArenaProps {
  /** i18n-ready message override; defaults to "No live matches right now" */
  message?: string;
}

const EmptyArena: React.FC<EmptyArenaProps> = ({
  message = "No live matches right now",
}) => {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div
        className={cn(
          "glass border-border/40 shadow-card rounded-lg px-8 py-10 text-center",
          "animate-pulse-glow",
        )}
      >
        <p className="text-lg text-muted-foreground">{message}</p>
      </div>
    </div>
  );
};

export default EmptyArena;
