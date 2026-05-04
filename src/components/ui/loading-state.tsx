import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  className?: string;
  variant?: "spinner" | "skeleton-rows" | "skeleton-card";
  rows?: number;
}

export function LoadingState({ label, className, variant = "spinner", rows = 3 }: Props) {
  if (variant === "skeleton-rows") {
    return (
      <div className={cn("space-y-2 p-3", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-2.5 w-2/3" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === "skeleton-card") {
    return (
      <div className={cn("space-y-3 p-4", className)}>
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }
  return (
    <div className={cn("flex items-center justify-center py-8 text-xs text-muted-foreground gap-2", className)}>
      <Loader2 className="size-4 animate-spin" />
      {label && <span>{label}</span>}
    </div>
  );
}
