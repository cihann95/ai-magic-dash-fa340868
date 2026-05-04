import { LucideIcon, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  children?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, children, className, compact }: Props) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center gap-3",
      compact ? "py-8 px-4" : "py-16 px-6",
      className,
    )}>
      <div className={cn(
        "rounded-full bg-muted/40 flex items-center justify-center",
        compact ? "size-10" : "size-14",
      )}>
        <Icon className={cn(compact ? "size-4" : "size-6", "text-muted-foreground")} />
      </div>
      <div className="space-y-1 max-w-xs">
        <div className={cn("font-medium", compact ? "text-sm" : "text-base")}>{title}</div>
        {description && (
          <div className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>{description}</div>
        )}
      </div>
      {action && (
        <Button size="sm" variant="outline" onClick={action.onClick} className="mt-1">
          {action.label}
        </Button>
      )}
      {children}
    </div>
  );
}
