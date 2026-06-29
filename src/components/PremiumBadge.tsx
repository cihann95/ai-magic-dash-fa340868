import { Diamond } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function PremiumBadge() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none"
            style={{
              background: "linear-gradient(135deg, #FFD700, #FFA500)",
              color: "#7c3a00",
              boxShadow: "0 0 6px rgba(255, 215, 0, 0.5)",
            }}
          >
            <Diamond className="size-2.5" />
            PREMIUM
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Premium Üye
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
