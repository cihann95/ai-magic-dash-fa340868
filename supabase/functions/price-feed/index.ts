// Tüm semboller için canlı fiyatları çeker ve price_cache tablosuna yazar.
// Kripto: Binance public API. Diğer varlık sınıfları: Yahoo Finance public quote API.
// Hiçbir sentetik/mock veri YOK - sadece gerçek piyasa verileri.
// Aynı zamanda açık limit/stop emirlerini ve fiyat alarmlarını tetikler, açık pozisyonların current_price'ını günceller.
// Tetiklenen alarmlar ve dolan emirler için bildirim oluşturur.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { redis, redisEnabled } from "../_shared/redis.ts";
import type { Admin } from "../_shared/blitz-types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Statik sembol haritası - lib/symbols.ts ile uyumlu olmalı
interface SymRef { symbol: string; asset_class: string; binance?: string; yahoo?: string; }
const SYMBOLS: SymRef[] = [
  // crypto
  { symbol: "BTCUSD", asset_class: "crypto", binance: "BTCUSDT" },
  { symbol: "ETHUSD", asset_class: "crypto", binance: "ETHUSDT" },
  { symbol: "SOLUSD", asset_class: "crypto", binance: "SOLUSDT" },
  { symbol: "BNBUSD", asset_class: "crypto", binance: "BNBUSDT" },
  { symbol: "XRPUSD", asset_class: "crypto", binance: "XRPUSDT" },
  { symbol: "DOGEUSD", asset_class: "crypto", binance: "DOGEUSDT" },
  { symbol: "ADAUSD", asset_class: "crypto", binance: "ADAUSDT" },
  { symbol: "AVAXUSD", asset_class: "crypto", binance: "AVAXUSDT" },
  // stocks
  { symbol: "AAPL", asset_class: "stocks", yahoo: "AAPL" },
  { symbol: "MSFT", asset_class: "stocks", yahoo: "MSFT" },
  { symbol: "NVDA", asset_class: "stocks", yahoo: "NVDA" },
  { symbol: "TSLA", asset_class: "stocks", yahoo: "TSLA" },
  { symbol: "GOOGL", asset_class: "stocks", yahoo: "GOOGL" },
  { symbol: "AMZN", asset_class: "stocks", yahoo: "AMZN" },
  { symbol: "META", asset_class: "stocks", yahoo: "META" },
  // forex
  { symbol: "EURUSD", asset_class: "forex", yahoo: "EURUSD=X" },
  { symbol: "GBPUSD", asset_class: "forex", yahoo: "GBPUSD=X" },
  { symbol: "USDJPY", asset_class: "forex", yahoo: "JPY=X" },
  { symbol: "USDTRY", asset_class: "forex", yahoo: "TRY=X" },
  // commodities
  { symbol: "GOLD", asset_class: "commodities", yahoo: "GC=F" },
  { symbol: "SILVER", asset_class: "commodities", yahoo: "SI=F" },
  { symbol: "OIL", asset_class: "commodities", yahoo: "CL=F" },
  { symbol: "NATGAS", asset_class: "commodities", yahoo: "NG=F" },
  // indices
  { symbol: "SPX", asset_class: "indices", yahoo: "^GSPC" },
  { symbol: "NDX", asset_class: "indices", yahoo: "^NDX" },
  { symbol: "DJI", asset_class: "indices", yahoo: "^DJI" },
  { symbol: "VIX", asset_class: "indices", yahoo: "^VIX" },
  // etf
  { symbol: "SPY", asset_class: "etf", yahoo: "SPY" },
  { symbol: "QQQ", asset_class: "etf", yahoo: "QQQ" },
  { symbol: "VTI", asset_class: "etf", yahoo: "VTI" },
];

interface PriceUpdate {
  symbol: string;
  asset_class: string;
  price: number;
  change_24h: number | null;
  change_pct_24h: number | null;
  volume_24h: number | null;
  updated_at: string;
}

async function fetchBinance(syms: SymRef[]): Promise<PriceUpdate[]> {
  const out: PriceUpdate[] = [];
  if (syms.length === 0) return out;
  try {
    const list = syms.map((s) => `"${s.binance}"`).join(",");
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=[${list}]`;
    const r = await fetch(url);
    if (!r.ok) {
      console.error("Binance HTTP", r.status);
      return out;
    }
    const data = await r.json();
    const now = new Date().toISOString();
    for (const s of syms) {
      const tick = data.find((d: any) => d.symbol === s.binance);
      if (!tick) continue;
      const price = parseFloat(tick.lastPrice);
      if (!isFinite(price) || price <= 0) continue;
      out.push({
        symbol: s.symbol,
        asset_class: s.asset_class,
        price,
        change_24h: parseFloat(tick.priceChange),
        change_pct_24h: parseFloat(tick.priceChangePercent),
        volume_24h: parseFloat(tick.quoteVolume),
        updated_at: now,
      });
    }
  } catch (e) {
    console.error("Binance fetch error", e);
  }
  return out;
}

async function fetchYahoo(syms: SymRef[]): Promise<PriceUpdate[]> {
  if (syms.length === 0) return [];
  // Yahoo v7 quote endpoint sürekli 401 dönüyor; doğrudan chart endpoint'i paralel kullan.
  const results = await Promise.all(syms.map((s) => fetchYahooChart(s)));
  return results.filter((x): x is PriceUpdate => x !== null);
}

async function fetchYahooChart(s: SymRef): Promise<PriceUpdate | null> {
  try {
    // 1d / 1m intraday — en taze tick
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.yahoo!)}?range=1d&interval=1m&includePrePost=true`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
    });
    if (!r.ok) return null;
    const json = await r.json();
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;
    // En son non-null close intraday'den; yoksa meta.regularMarketPrice
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    let intraday: number | null = null;
    for (let i = closes.length - 1; i >= 0; i--) {
      if (typeof closes[i] === "number" && isFinite(closes[i] as number)) { intraday = closes[i]; break; }
    }
    const price = Number(intraday ?? meta?.regularMarketPrice ?? meta?.chartPreviousClose);
    if (!isFinite(price) || price <= 0) return null;
    const previous = Number(meta?.chartPreviousClose || meta?.previousClose || 0);
    const change = previous > 0 ? price - previous : null;
    return {
      symbol: s.symbol,
      asset_class: s.asset_class,
      price,
      change_24h: change,
      change_pct_24h: change !== null && previous > 0 ? (change / previous) * 100 : null,
      volume_24h: typeof meta?.regularMarketVolume === "number" ? meta.regularMarketVolume : null,
      updated_at: new Date().toISOString(),
    };
  } catch (e) {
    console.error("Yahoo chart fetch error", s.symbol, e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth: accept service_role bearer OR a valid x-cron-secret (issued from pg_cron via Vault)
  const authHdr = req.headers.get("Authorization") ?? "";
  const cronToken = req.headers.get("x-cron-secret") ?? "";
  const isServiceRole = authHdr === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  let isCron = false;
  if (!isServiceRole && cronToken) {
    const { data: ok } = await admin.rpc("verify_cron_secret", { _token: cronToken });
    isCron = ok === true;
  }
  if (!isServiceRole && !isCron) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {

    // 1) Fetch real prices in parallel
    const cryptoSyms = SYMBOLS.filter((s) => s.binance);
    const yahooSyms = SYMBOLS.filter((s) => s.yahoo);
    const [cryptoUpdates, yahooUpdates] = await Promise.all([
      fetchBinance(cryptoSyms),
      fetchYahoo(yahooSyms),
    ]);
    const updates = [...cryptoUpdates, ...yahooUpdates];

    console.log(`price-feed: fetched ${cryptoUpdates.length} crypto + ${yahooUpdates.length} yahoo = ${updates.length} updates`);

    // 2) Upsert price_cache
    if (updates.length > 0) {
      const { error: upErr } = await admin.from("price_cache").upsert(updates, { onConflict: "symbol" });
      if (upErr) console.error("price_cache upsert error", upErr);
    }

    // 2b) Blitz için Redis fiyat cache (60s TTL)
    if (redisEnabled && updates.length > 0) {
      await Promise.all(updates.map((u) => redis.set(`blitz:price:${u.symbol}`, u.price, 60)));
    }

    // 3) Update open positions current_price
    for (const u of updates) {
      await admin.from("positions").update({ current_price: u.price, updated_at: new Date().toISOString() })
        .eq("symbol", u.symbol);
    }

    // 4) Trigger limit/stop orders
    const { data: openOrders } = await admin
      .from("orders").select("*").eq("status", "open");

    for (const o of openOrders ?? []) {
      const tick = updates.find((u) => u.symbol === o.symbol);
      if (!tick) continue;
      const p = tick.price;
      let shouldFill = false;

      if (o.order_type === "limit") {
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
        await fillOrder(admin, o, p);
      }
    }

    // 5) Trigger price alerts
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

        // Notification
        await admin.from("notifications").insert({
          user_id: a.user_id,
          type: "price_alert",
          title: `🔔 ${a.symbol} ${a.direction === "above" ? "≥" : "≤"} ${a.target_price}`,
          body: `Fiyat ${tick.price} seviyesinde tetiklendi.${a.note ? ` Not: ${a.note}` : ""}`,
          link: `/?symbol=${a.symbol}`,
          metadata: { symbol: a.symbol, price: tick.price, target: a.target_price },
        });
      }
    }

    return new Response(JSON.stringify({
      success: true, updated: updates.length,
      crypto: cryptoUpdates.length, yahoo: yahooUpdates.length,
      orders_checked: openOrders?.length ?? 0,
      alerts_checked: activeAlerts?.length ?? 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("price-feed error", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fillOrder(admin: Admin, order: any, fillPrice: number) {
  const qty = Number(order.quantity);
  const total = +(qty * fillPrice).toFixed(2);

  const { data: profile } = await admin.from("profiles").select("demo_balance").eq("id", order.user_id).single();
  if (!profile) return;
  let balance = Number(profile.demo_balance);

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

  // Notification
  await admin.from("notifications").insert({
    user_id: order.user_id,
    type: "order_filled",
    title: `✅ Emir Doldu: ${order.symbol}`,
    body: `${order.order_type.toUpperCase()} ${order.side.toUpperCase()} ${qty} @ ${fillPrice}`,
    link: `/portfolio`,
    metadata: { symbol: order.symbol, side: order.side, qty, price: fillPrice },
  });
}
