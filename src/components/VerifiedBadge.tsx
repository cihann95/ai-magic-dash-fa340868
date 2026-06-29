import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BadgeCheck } from "lucide-react";

interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = { sm: 16, md: 20, lg: 24 };

export default function VerifiedBadge({ size = "md", className = "" }: Props) {
  const px = sizeMap[size];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center ${className}`}>
          <BadgeCheck
            size={px}
            className="text-blue-500 fill-blue-500/10"
            aria-label="Doğrulanmış Trader"
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">Doğrulanmış Trader — 100+ işlem, %55+ kazanç oranı</p>
      </TooltipContent>
    </Tooltip>
  );
}
