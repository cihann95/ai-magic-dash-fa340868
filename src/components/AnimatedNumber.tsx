// Yumuşak değişen sayı - fiyat değişiminde tabular-nums roll-up + flash arka plan
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: number | null | undefined;
  format: (n: number | null | undefined) => string;
  className?: string;
  flashMs?: number;
}

export default function AnimatedNumber({ value, format, className, flashMs = 600 }: Props) {
  const [display, setDisplay] = useState<number | null | undefined>(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevRef = useRef<number | null | undefined>(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (value == null || isNaN(value)) {
      setDisplay(value);
      return;
    }
    const from = (typeof prevRef.current === "number" && !isNaN(prevRef.current)) ? prevRef.current : value;
    const to = value;
    if (from === to) { setDisplay(to); prevRef.current = to; return; }

    setFlash(to > from ? "up" : "down");
    const start = performance.now();
    const dur = 380;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else { setDisplay(to); prevRef.current = to; }
    };
    rafRef.current = requestAnimationFrame(step);

    const flashTimer = setTimeout(() => setFlash(null), flashMs);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(flashTimer);
    };
  }, [value, flashMs]);

  return (
    <span
      className={cn(
        "tabular-nums transition-colors duration-300 rounded px-1 -mx-1",
        flash === "up" && "bg-bull/15 text-bull",
        flash === "down" && "bg-bear/15 text-bear",
        className
      )}
    >
      {format(display)}
    </span>
  );
}
