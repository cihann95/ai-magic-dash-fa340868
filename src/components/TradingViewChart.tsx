import { useEffect, useRef, useState } from "react";

interface Props {
  symbol: string; // e.g. "BINANCE:BTCUSDT"
  theme?: "dark" | "light";
  height?: number | string;
}

export default function TradingViewChart({ symbol, theme = "dark", height = "100%" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    setError(false);
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

    const timeoutId = setTimeout(() => {
      if (!error) {
        setError(true);
      }
    }, 10000);

    script.onerror = () => {
      clearTimeout(timeoutId);
      setError(true);
    };

    script.onload = () => {
      clearTimeout(timeoutId);
    };

    ref.current.appendChild(script);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [symbol, theme, retryKey]);

  if (error) {
    return (
      <div
        className="tradingview-widget-container w-full h-full flex items-center justify-center bg-gray-900 text-gray-300"
        style={{ height }}
        ref={ref}
      >
        <div className="text-center p-4">
          <p className="mb-2">Grafik yüklenemedi</p>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tradingview-widget-container w-full h-full" style={{ height }} ref={ref} />
  );
}
