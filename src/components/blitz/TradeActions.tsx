// LONG/SHORT trading buttons with quick amount selector and open position display
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/symbols";

interface BlitzOrder {
  id: string;
  side: "long" | "short";
  amount: number;
  entry_price: number;
  closed_at: string | null;
}

const QUICK_AMOUNTS = [5, 10, 25, 50];

interface TradeActionsProps {
  isActive: boolean;
  myOpenOrder: BlitzOrder | undefined;
  amount: number;
  submitting: boolean;
  onAmountChange: (n: number) => void;
  onOpenPosition: (side: "long" | "short") => void;
  onClosePosition: () => void;
}

export function TradeActions({
  isActive,
  myOpenOrder,
  amount,
  submitting,
  onAmountChange,
  onOpenPosition,
  onClosePosition,
}: TradeActionsProps) {
  if (!isActive) return null;

  return (
    <Card className="p-4 glass space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Miktar</div>
        <div className="flex gap-1">
          {QUICK_AMOUNTS.map((a) => (
            <Button
              key={a}
              size="sm"
              variant={amount === a ? "default" : "outline"}
              onClick={() => onAmountChange(a)}
              className="min-h-[44px] min-w-[44px]"
            >
              ${a}
            </Button>
          ))}
        </div>
      </div>

      {!myOpenOrder ? (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="h-16 w-full bg-green-600 hover:bg-green-700 text-white text-lg font-bold min-h-[44px]"
            onClick={() => onOpenPosition("long")}
            disabled={submitting}
          >
            <ArrowUp className="size-5 mr-1" /> LONG
          </Button>
          <Button
            size="lg"
            className="h-16 w-full bg-red-600 hover:bg-red-700 text-white text-lg font-bold min-h-[44px]"
            onClick={() => onOpenPosition("short")}
            disabled={submitting}
          >
            <ArrowDown className="size-5 mr-1" /> SHORT
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {myOpenOrder.side.toUpperCase()} ${Number(myOpenOrder.amount)}
            </span>
            <span className="text-muted-foreground">
              @ {formatPrice(Number(myOpenOrder.entry_price))}
            </span>
          </div>
          <Button
            size="lg"
            className="w-full h-14 min-h-[44px]"
            variant="outline"
            onClick={onClosePosition}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : "Pozisyonu Kapat"}
          </Button>
        </div>
      )}
    </Card>
  );
}
