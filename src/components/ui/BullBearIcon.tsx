import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type BullBearIconProps = {
  type: "bull" | "bear" | "neutral";
  size?: "xs" | "sm" | "md" | "lg";
  showArrow?: boolean;
  className?: string;
};

const sizeMap = {
  xs: { icon: "size-3", text: "text-[10px]" },
  sm: { icon: "size-4", text: "text-xs" },
  md: { icon: "size-5", text: "text-sm" },
  lg: { icon: "size-6", text: "text-base" },
};

export function BullBearIcon({ type, size = "sm", showArrow = true, className }: BullBearIconProps) {
  const { icon: iconSize, text: textSize } = sizeMap[size];
  
  if (type === "bull") {
    const Icon: LucideIcon = TrendingUp;
    return (
      <span className={cn("inline-flex items-center gap-1 text-bull", className)} role="img" aria-label={`${showArrow ? "bullish " : ""}trending up`}>
        {showArrow && <Icon className={iconSize} />}
        <span className={cn("font-bold", textSize)}>↑</span>
      </span>
    );
  }
  
  if (type === "bear") {
    const Icon: LucideIcon = TrendingDown;
    return (
      <span className={cn("inline-flex items-center gap-1 text-bear", className)} role="img" aria-label={`${showArrow ? "bearish " : ""}trending down`}>
        {showArrow && <Icon className={iconSize} />}
        <span className={cn("font-bold", textSize)}>↓</span>
      </span>
    );
  }
  
  return (
    <span className={cn("inline-flex items-center gap-1 text-muted-foreground", className)} role="img" aria-label="flat">
      {showArrow && <Minus className={iconSize} />}
      <span className={cn("font-bold", textSize)}>—</span>
    </span>
  );
}

export default BullBearIcon;
