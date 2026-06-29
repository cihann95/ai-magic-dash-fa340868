// ShareTradeCard — Canvas API ile trade sonucu görsel kart, download PNG, Twitter share
import { useCallback, useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp } from "@/contexts/AppContext";
import { Download, Share2, Twitter, X } from "lucide-react";

interface TradeResult {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  closedAt: string;
}

interface Props {
  trade: TradeResult | null;
  open: boolean;
  onClose: () => void;
}

export default function ShareTradeCard({ trade, open, onClose }: Props) {
  const { lang, user } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const isEn = lang === "en";

  const renderCard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !trade) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 600, H = 340;
    canvas.width = W; canvas.height = H;

    // Background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#1a1a2e");
    grad.addColorStop(0.5, "#16213e");
    grad.addColorStop(1, "#0f3460");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Border accent
    ctx.fillStyle = trade.pnl >= 0 ? "#22c55e" : "#ef4444";
    ctx.fillRect(0, 0, W, 4);

    // Profit/Loss badge
    const isWin = trade.pnl >= 0;
    ctx.fillStyle = isWin ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)";
    ctx.beginPath();
    ctx.roundRect(W - 130, 16, 114, 28, 6);
    ctx.fill();
    ctx.fillStyle = isWin ? "#22c55e" : "#ef4444";
    ctx.font = "bold 14px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(isWin ? `+$${trade.pnl.toFixed(2)}` : `-$${Math.abs(trade.pnl).toFixed(2)}`, W - 28, 36);

    // Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(trade.symbol, 24, 48);

    // Side badge
    ctx.fillStyle = trade.side === "buy" ? "#22c55e" : "#ef4444";
    ctx.font = "bold 12px Inter, system-ui, sans-serif";
    ctx.beginPath();
    ctx.roundRect(160, 28, 52, 24, 4);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(trade.side.toUpperCase(), 186, 45);

    // Separator
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 68);
    ctx.lineTo(W - 24, 68);
    ctx.stroke();

    // Stats
    const stats = [
      { label: isEn ? "Qty" : "Miktar", value: trade.qty.toString() },
      { label: isEn ? "Entry" : "Giriş", value: `$${trade.entryPrice.toFixed(2)}` },
      { label: isEn ? "Exit" : "Çıkış", value: `$${trade.exitPrice.toFixed(2)}` },
      { label: isEn ? "P&L %" : "K/Z %", value: `${trade.pnlPercent >= 0 ? "+" : ""}${trade.pnlPercent.toFixed(2)}%` },
    ];

    ctx.textAlign = "left";
    stats.forEach((s, i) => {
      const x = 24 + i * 140;
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "11px Inter, system-ui, sans-serif";
      ctx.fillText(s.label, x, 98);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px Inter, system-ui, sans-serif";
      ctx.fillText(s.value, x, 122);
    });

    // Bottom bar
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(0, H - 48, W, 48);

    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Lumen Trade", 24, H - 22);

    ctx.textAlign = "right";
    const date = new Date(trade.closedAt).toLocaleDateString(isEn ? "en-US" : "tr-TR");
    ctx.fillText(date, W - 24, H - 22);

    setRendered(true);
  }, [trade, isEn]);

  useEffect(() => {
    if (open && trade) {
      setRendered(false);
      setTimeout(renderCard, 100);
    }
  }, [open, trade, renderCard]);

  const downloadPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `trade-${trade?.symbol}-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [trade]);

  const shareTwitter = useCallback(() => {
    if (!trade) return;
    const text = isEn
      ? `I just ${trade.side === "buy" ? "bought" : "sold"} ${trade.qty} ${trade.symbol} on Lumen Trade! P&L: ${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toFixed(2)}`
      : `${trade.side === "buy" ? "Aldım" : "Sattım"} ${trade.qty} ${trade.symbol} — Lumen Trade'de! K/Z: ${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toFixed(2)}`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent("https://lumen.trade")}`;
    window.open(url, "_blank", "width=600,height=400");
    onClose();
  }, [trade, isEn, onClose]);

  const shareNative = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b)));
    if (!blob || !navigator.share) { downloadPng(); return; }
    try {
      await navigator.share({
        title: `Trade ${trade?.symbol}`,
        files: [new File([blob], `trade-${trade?.symbol}.png`, { type: "image/png" })],
      });
      onClose();
    } catch { /* user cancelled */ }
  }, [trade, downloadPng, onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-4" />
            {isEn ? "Share Trade Result" : "İşlem Sonucunu Paylaş"}
          </DialogTitle>
        </DialogHeader>

        <canvas
          ref={canvasRef}
          className="w-full rounded-lg border border-border/40"
          style={{ aspectRatio: "600/340" }}
        />

        {rendered && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadPng} className="flex-1">
              <Download className="size-4 mr-1" />
              PNG
            </Button>
            <Button variant="outline" onClick={shareNative} className="flex-1">
              <Share2 className="size-4 mr-1" />
              {isEn ? "Share" : "Paylaş"}
            </Button>
            <Button onClick={shareTwitter} className="flex-1" style={{ background: "#1DA1F2" }}>
              <Twitter className="size-4 mr-1" />
              Tweet
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
