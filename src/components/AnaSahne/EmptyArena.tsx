import React from "react";
import { cn } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";

interface EmptyArenaProps {
  /** i18n-ready message override; defaults to tr.no_live_match */
  message?: string;
}

const EmptyArena: React.FC<EmptyArenaProps> = ({ message }) => {
  const { lang } = useApp();
  const tr = t(lang);
  const displayMessage = message ?? tr.no_live_match;

  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div
        className={cn(
          "glass border-border/40 shadow-card rounded-lg px-8 py-10 text-center",
          "animate-pulse-glow",
        )}
      >
        <p className="text-lg text-muted-foreground">{displayMessage}</p>
      </div>
    </div>
  );
};

export default EmptyArena;
