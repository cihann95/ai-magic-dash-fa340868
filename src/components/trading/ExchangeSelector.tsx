// Exchange selector — small switcher for chart panel
import { useState, useEffect } from "react";
import { getActiveExchangeId, setActiveExchangeId, getAllProviders, getBrokerConfig, onActiveExchangeChange, type ExchangeProvider } from "@/lib/exchange-provider";
import { ChevronDown, CheckCircle2 } from "lucide-react";

export default function ExchangeSelector() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(getActiveExchangeId());
  const brokers = getAllProviders();

  useEffect(() => onActiveExchangeChange(setActive), []);

  const current = brokers.find((b) => b.id === active);
  if (!current) return null;

  const hasKey = (p: ExchangeProvider) => getBrokerConfig(p.id) !== undefined;

  return (
    <div className="relative inline-block text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 rounded-md border border-border/40 bg-surface-1/50 hover:bg-accent/30 transition-colors"
      >
        <span className="font-medium">{current.name}</span>
        {getBrokerConfig(active) && <CheckCircle2 className="size-3 text-bull" />}
        <ChevronDown className="size-3 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 min-w-[140px] rounded-lg border border-border/40 bg-popover shadow-lg p-1">
            {brokers.map((b) => {
              const configd = hasKey(b);
              return (
                <button
                  key={b.id}
                  onClick={() => { setActiveExchangeId(b.id); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs flex items-center gap-2 transition-colors ${b.id === active ? "bg-accent/50 font-semibold" : "hover:bg-accent/20"}`}
                >
                  <span>{b.name}</span>
                  {configd && <CheckCircle2 className="size-3 text-bull ml-auto" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
