// Tüm semboller için canlı fiyatları çeker ve price_cache tablosuna yazar.
// Kripto: Binance public API (auth gerekmez). Diğer varlık sınıfları: TradingView widget tarafında zaten canlı; burada deterministik bir simulator kullanırız (gerçek broker bağlanınca değiştirilir).
// Aynı zamanda açık limit/stop emirlerini ve fiyat alarmlarını tetikler, açık pozisyonların current_price'ını günceller.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Statik sembol haritası - lib/symbols.ts ile uyumlu olmalı
const SYMBOLS: { symbol: string; asset_class: string; binance?: string }[] = [
  { symbol: "BTCUSD", asset_class: "crypto", binance: "BTCUSDT" },
  { symbol: "ETHUSD", asset_class: "crypto", binance: "ETHUSDT" },
  { symbol: "SOLUSD", asset_class: "crypto", binance: "SOLUSDT" },
  { symbol: "BNBUSD", asset_class: "crypto", binance: "BNBUSDT" },
  { symbol: "XRPUSD", asset_class: "crypto", binance: "XRPUSDT" },
  { symbol: "DOGEUSD", asset_class: "crypto", binance: "DOGEUSDT" },
  { symbol: "ADAUSD", asset_class: "crypto", binance: "ADAUSDT" },
  { symbol: "AVAXUSD", asset_class: "crypto", binance: "AVAXUSDT" },
  // Diğer varlık sınıfları - simulator (TradingView widget istemcide canlı gösteriyor zaten)
  { symbol: "AAPL", asset_class: "stock" },
  { symbol: "MSFT", asset_class: "stock" },
  { symbol: "NVDA", asset_class: "stock" },
  { symbol: "TSLA", asset_class: "stock" },
  { symbol: "GOOGL", asset_class: "stock" },
  { symbol: "AMZN", asset_class: "stock" },
  { symbol: "META", asset_class: "stock" },
  { symbol: "EURUSD", asset_class: "forex" },
  { symbol: "GBPUSD", asset_class: "forex" },
  { symbol: "USDJPY", asset_class: "forex" },
  { symbol: "USDTRY", asset_class: "forex" },
  { symbol: "GOLD", asset_class: "commodity" },
  { symbol: "SILVER", asset_class: "commodity" },
  { symbol: "OIL", asset_class: "commodity" },
  { symbol: "NATGAS", asset_class: "commodity" },
  { symbol: "SPX", asset_class: "index" },
  { symbol: "NDX", asset_class: "index" },
  { symbol: "DJI", asset_class: "index" },
  { symbol: "VIX", asset_class: "index" },
  { symbol: "SPY", asset_class: "etf" },
  { symbol: "QQQ", asset_class: "etf" },
  { symbol: "VTI", asset_class: "etf" },
];

// Simulator için seed bazlı pseudo-random fiyat üretir (her sembol için tutarlı dalgalanma)
function simulatePrice(symbol: string, base: number): { price: number; change_pct: number } {
  const t = Math.floor(Date.now() / 60000); // dakikada bir değişir
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) | 0;
  const wave = Math.sin((h + t) * 0.13) * 0.015 + Math.sin((h * 3 + t) * 0.07) * 0.008;
  const price = +(base * (1 + wave)).toFixed(base < 10 ? 4 : 2);
  const change_pct = +(wave * 100).toFixed(2);
  return { price, change_pct };
}

const SIM_BASE: Record<string, number> = {
  AAPL: 195, MSFT: 432, NVDA: 880, TSLA: 178, GOOGL: 165, AMZN: 185, META: 510,
  EURUSD: 1.085, GBPUSD: 1.265, USDJPY: 152.4, USDTRY: 32.5,
  GOLD: 2380, SILVER: 28.5, OIL: 82.4, NATGAS: 2.1,
  SPX: 5230, NDX: 18250, DJI: 39200, VIX: 14.5,
  SPY: 521, QQQ: 445, VTI: 258,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1) Kripto fiyatlarını Binance'tan çek
    const cryptoSyms = SYMBOLS.filter((s) => s.binance);
    const binanceSymbols = cryptoSyms.map((s) => `"${s.binance}"`).join(",");
    const binanceUrl = `https://api.binance.com/api/v3/ticker/24hr?symbols=[${binanceSymbols}]`;

    let binanceData: any[] = [];
    try {
      const r = await fetch(binanceUrl);
      if (r.ok) binanceData = await r.json();
    } catch (e) {
      console.error("Binance fetch failed", e);
    }

    const updates: any[] = [];
    for (const s of cryptoSyms) {
      const tick = binanceData.find((d) => d.symbol === s.binance);
      if (tick) {
        updates.push({
          symbol: s.symbol,
          asset_class: s.asset_class,
          price: parseFloat(tick.lastPrice),
          change_24h: parseFloat(tick.priceChange),
          change_pct_24h: parseFloat(tick.priceChangePercent),
          volume_24h: parseFloat(tick.quoteVolume),
          updated_at: new Date().toISOString(),
        });
      }
    }

    // 2) Diğer varlık sınıfları için simulator
    for (const s of SYMBOLS.filter((x) => !x.binance)) {
      const base = SIM_BASE[s.symbol] ?? 100;
      const { price, change_pct } = simulatePrice(s.symbol, base);
      updates.push({
        symbol: s.symbol,
        asset_class: s.asset_class,
        price,
        change_24h: +(price * change_pct / 100).toFixed(2),
        change_pct_24h: change_pct,
        volume_24h: null,
        updated_at: new Date().toISOString(),
      });
    }

    // 3) price_cache'e upsert
    if (updates.length > 0) {
      await admin.from("price_cache").upsert(updates, { onConflict: "symbol" });
    }

    // 4) Açık pozisyonların current_price'ını güncelle
    for (const u of updates) {
      await admin.from("positions").update({ current_price: u.price, updated_at: new Date().toISOString() })
        .eq("symbol", u.symbol);
    }

    // 5) Açık limit/stop emirleri tetikle
    const { data: openOrders } = await admin
      .from("orders").select("*").eq("status", "open");

    for (const o of openOrders ?? []) {
      const tick = updates.find((u) => u.symbol === o.symbol);
      if (!tick) continue;
      const p = tick.price;
      let shouldFill = false;

      if (o.order_type === "limit") {
        // limit buy: piyasa fiyatı limit fiyatına düşerse / limit sell: yükselirse
        if (o.side === "buy" && p <= Number(o.trigger_price)) shouldFill = true;
        if (o.side === "sell" && p >= Number(o.trigger_price)) shouldFill = true;
      } else if (o.order_type === "stop" || o.order_type === "stop_loss") {
        if (o.side === "buy" && p >= Number(o.trigger_price)) shouldFill = true;
        if (o.side === "sell" && p <= Number(o.trigger_price)) shouldFill = true;
      } else if (o.order_type === "take_profit") {
        if (o.side === "sell" && p >= Number(o.trigger_price)) shouldFill = true;
        if (o.side === "buy" && p <= Number(o.trigger_price)) shouldFill = true;
      }

      if (shouldFill) {
        // execute-trade mantığını burada inline çalıştır
        await fillOrder(admin, o, p);
      }
    }

    // 6) Fiyat alarmlarını tetikle
    const { data: activeAlerts } = await admin
      .from("price_alerts").select("*").eq("triggered", false);

    for (const a of activeAlerts ?? []) {
      const tick = updates.find((u) => u.symbol === a.symbol);
      if (!tick) continue;
      const cross =
        (a.direction === "above" && tick.price >= Number(a.target_price)) ||
        (a.direction === "below" && tick.price <= Number(a.target_price));
      if (cross) {
        await admin.from("price_alerts").update({
          triggered: true,
          triggered_at: new Date().toISOString(),
        }).eq("id", a.id);
      }
    }

    return new Response(JSON.stringify({
      success: true, updated: updates.length,
      orders_checked: openOrders?.length ?? 0,
      alerts_checked: activeAlerts?.length ?? 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("price-feed error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fillOrder(admin: any, order: any, fillPrice: number) {
  const qty = Number(order.quantity);
  const total = +(qty * fillPrice).toFixed(2);

  // Profile bakiyesi
  const { data: profile } = await admin.from("profiles").select("demo_balance").eq("id", order.user_id).single();
  if (!profile) return;
  let balance = Number(profile.demo_balance);

  // Pozisyon kapatma mı, açma mı?
  if (order.position_id) {
    const { data: pos } = await admin.from("positions").select("*").eq("id", order.position_id).single();
    if (!pos) return;
    const entry = Number(pos.entry_price);
    const pq = Number(pos.quantity);
    const pnl = pos.side === "long" ? (fillPrice - entry) * pq : (entry - fillPrice) * pq;
    balance = +(balance + entry * pq + pnl).toFixed(2);
    await admin.from("positions").delete().eq("id", order.position_id);
    await admin.from("trades").insert({
      user_id: order.user_id, symbol: order.symbol, asset_class: order.asset_class,
      side: order.side, action: "close", quantity: pq, price: fillPrice, total: +(pq * fillPrice).toFixed(2),
      pnl: +pnl.toFixed(2), executor: "demo",
    });
  } else {
    if (balance < total) {
      await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
      return;
    }
    balance = +(balance - total).toFixed(2);
    await admin.from("positions").insert({
      user_id: order.user_id, symbol: order.symbol, asset_class: order.asset_class,
      side: order.side === "buy" ? "long" : "short",
      quantity: qty, entry_price: fillPrice, current_price: fillPrice,
    });
    await admin.from("trades").insert({
      user_id: order.user_id, symbol: order.symbol, asset_class: order.asset_class,
      side: order.side, action: "open", quantity: qty, price: fillPrice, total, executor: "demo",
    });
  }

  await admin.from("profiles").update({ demo_balance: balance }).eq("id", order.user_id);
  await admin.from("orders").update({
    status: "filled", filled_at: new Date().toISOString(), fill_price: fillPrice,
  }).eq("id", order.id);
}
