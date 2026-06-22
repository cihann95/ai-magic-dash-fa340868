import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function HistoryInner() {
  const { user, lang } = useApp();
  const tr = t(lang);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    supabase.from("trades").select("*").eq("user_id", user.id).order("executed_at", { ascending: false })
      .then(({ data }) => { setTrades(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  const exportCsv = () => {
    const header = ["Date", "Symbol", "Side", "Action", "Quantity", "Price", "Total", "P&L"];
    const rows = trades.map((t) => [
      new Date(t.executed_at).toISOString(), t.symbol, t.side, t.action,
      t.quantity, t.price, t.total, t.pnl ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `trades-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{tr.history}</h1>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={trades.length === 0}>
            <Download className="size-4" /> CSV
          </Button>
        </div>
        <Card className="glass border-border/40 overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No trades found. Start trading to see your history here.</TableCell></TableRow>
                  ) : trades.map((tr) => (
                    <TableRow key={tr.id}>
                      <TableCell className="text-xs text-muted-foreground">{new Date(tr.executed_at).toLocaleString()}</TableCell>
                      <TableCell className="font-semibold">{tr.symbol}</TableCell>
                      <TableCell><span className={cn("text-xs uppercase font-bold px-1.5 py-0.5 rounded", tr.side === "buy" ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear")}>{tr.side}</span></TableCell>
                      <TableCell className="text-xs uppercase">{tr.action}</TableCell>
                      <TableCell className="text-right font-mono">{Number(tr.quantity)}</TableCell>
                      <TableCell className="text-right font-mono">{Number(tr.price).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">${Number(tr.total).toFixed(2)}</TableCell>
                      <TableCell className={cn("text-right font-mono font-semibold", tr.pnl == null ? "" : Number(tr.pnl) >= 0 ? "text-bull" : "text-bear")}>
                        {tr.pnl == null ? "—" : `${Number(tr.pnl) >= 0 ? "+" : ""}$${Number(tr.pnl).toFixed(2)}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export default function History() { return <ProtectedRoute><HistoryInner /></ProtectedRoute>; }
