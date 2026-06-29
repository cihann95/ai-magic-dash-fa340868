// What-if Simulator: "Peki ya $X ile BTC long açsaydın?"
// Uses last 1h kline data to project what a long/short position would return.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const WhatIfSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9.-]{1,16}$/),
  amount: z.number().positive().max(1_000_000),
  side: z.enum(["long", "short"]).default("long"),
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({}));
    const parseResult = WhatIfSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: parseResult.error.errors[0].message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { symbol, amount, side } = parseResult.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get current price
    const { data: priceRow } = await admin
      .from("price_cache")
      .select("price, change_pct_24h")
      .eq("symbol", symbol)
      .single();
    if (!priceRow) {
      return new Response(JSON.stringify({ error: "Fiyat bulunamadı" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const entryPrice = Number(priceRow.price);
    const change24hPct = Number(priceRow.change_pct_24h ?? 0);

    // Simulate: if price moved 1h-worth of the 24h trend
    // 24h change → approximate 1h change
    const hourFraction = 1 / 24;
    // Use sign of 24h change, scaled to ~1h volatility estimate
    // If 24h change is +5%, 1h estimate is ~+0.2% (rough)
    // We use a conservative projection: 1/24th of 24h change
    const projectedChangePct = change24hPct * hourFraction;
    const projectedPrice = entryPrice * (1 + projectedChangePct / 100);
    const projectedPnl = side === "long"
      ? (projectedPrice - entryPrice) / entryPrice * amount
      : (entryPrice - projectedPrice) / entryPrice * amount;
    const projectedPnlPct = (projectedPnl / amount) * 100;

    // Also simulate if opposite direction (worst case)
    const projectedChangePctOpposite = -projectedChangePct;
    const projectedPriceOpposite = entryPrice * (1 + projectedChangePctOpposite / 100);
    const projectedPnlOpposite = side === "long"
      ? (projectedPriceOpposite - entryPrice) / entryPrice * amount
      : (entryPrice - projectedPriceOpposite) / entryPrice * amount;
    const projectedPnlPctOpposite = (projectedPnlOpposite / amount) * 100;

    return new Response(JSON.stringify({
      symbol,
      entry_price: entryPrice,
      side,
      amount,
      scenario: {
        direction: side === "long" ? "yükseliş" : "düşüş",
        projected_price_1h: Math.round(projectedPrice * 100) / 100,
        projected_change_pct: Math.round(projectedChangePct * 100) / 100,
        pnl: Math.round(projectedPnl * 100) / 100,
        pnl_pct: Math.round(projectedPnlPct * 100) / 100,
      },
      opposite_scenario: {
        projected_price_1h: Math.round(projectedPriceOpposite * 100) / 100,
        pnl: Math.round(projectedPnlOpposite * 100) / 100,
        pnl_pct: Math.round(projectedPnlPctOpposite * 100) / 100,
      },
      note: "1 saatlik projeksiyon. Gerçek sonuçlar farklı olabilir.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("what-if error", e);
    return new Response(JSON.stringify({ error: "Sunucu hatası" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
