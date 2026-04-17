import { useEffect, useRef } from "react";

interface Props {
  symbol: string; // e.g. "BINANCE:BTCUSDT"
  theme?: "dark" | "light";
  height?: number | string;
}

export default function TradingViewChart({ symbol, theme = "dark", height = "100%" }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    const container = document.createElement("div");
    container.className = "tradingview-widget-container__widget";
    container.style.height = "100%";
    container.style.width = "100%";
    ref.current.appendChild(container);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "60",
      timezone: "Etc/UTC",
      theme,
      style: "1",
      locale: "en",
      backgroundColor: theme === "dark" ? "rgba(15,16,24,1)" : "rgba(255,255,255,1)",
      gridColor: "rgba(120,120,140,0.1)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      withdateranges: true,
      studies: ["STD;EMA", "STD;RSI"],
      support_host: "https://www.tradingview.com",
    });
    ref.current.appendChild(script);
  }, [symbol, theme]);

  return (
    <div className="tradingview-widget-container w-full h-full" style={{ height }} ref={ref} />
  );
}
