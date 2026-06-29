/**
 * Shared AI context builder.
 * Fetches user's portfolio state (price, positions, balance, recent trades)
 * with independent try/catch per source — partial context on failure.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface AIContext {
  symbol?: string;
  currentPrice?: number;
  change24h?: number;
  changePct24h?: number;
  openPositions: Array<{
    symbol: string;
    side: string;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnl: number;
  }>;
  accountBalance: number;
  totalPnl: number;
  recentTrades: Array<{
    symbol: string;
    side: string;
    pnl: number;
    executedAt: string;
  }>;
  riskTolerance?: string;
}

export async function buildAIContext(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  symbol?: string
): Promise<AIContext> {
  const sb = createClient(supabaseUrl, serviceRoleKey);
  const context: AIContext = {
    openPositions: [],
    accountBalance: 0,
    totalPnl: 0,
    recentTrades: [],
  };

  // Price cache — independent try/catch
  if (symbol) {
    try {
      const { data } = await sb
        .from("price_cache")
        .select("price, change_24h, change_pct_24h")
        .eq("symbol", symbol)
        .single();
      if (data) {
        context.symbol = symbol;
        context.currentPrice = data.price;
        context.change24h = data.change_24h;
        context.changePct24h = data.change_pct_24h;
      }
    } catch { /* partial context */ }
  }

  // Open positions — independent try/catch
  try {
    const { data } = await sb
      .from("positions")
      .select("symbol, side, quantity, entry_price, current_price")
      .eq("user_id", userId);
    context.openPositions = (data ?? []).map((p) => ({
      symbol: p.symbol,
      side: p.side,
      quantity: p.quantity,
      entryPrice: p.entry_price,
      currentPrice: p.current_price,
      unrealizedPnl:
        p.side === "long"
          ? (p.current_price - p.entry_price) * p.quantity
          : (p.entry_price - p.current_price) * p.quantity,
    }));
  } catch { /* partial context */ }

  // Account balance — independent try/catch
  try {
    const { data } = await sb
      .from("profiles")
      .select("demo_balance")
      .eq("id", userId)
      .single();
    context.accountBalance = data?.demo_balance ?? 0;
  } catch { /* partial context */ }

  // Total PnL — independent try/catch
  try {
    const { data } = await sb
      .from("user_stats")
      .select("total_pnl")
      .eq("user_id", userId)
      .single();
    context.totalPnl = data?.total_pnl ?? 0;
  } catch { /* partial context */ }

  // Recent trades — independent try/catch
  try {
    const { data } = await sb
      .from("trades")
      .select("symbol, side, pnl, executed_at")
      .eq("user_id", userId)
      .order("executed_at", { ascending: false })
      .limit(5);
    context.recentTrades = (data ?? []).map((t: any) => ({
      symbol: t.symbol,
      side: t.side,
      pnl: t.pnl,
      executedAt: t.executed_at,
    }));
  } catch { /* partial context */ }

  // Trader persona — independent try/catch
  try {
    const { data } = await sb
      .from("profiles")
      .select("trader_persona")
      .eq("id", userId)
      .single();
    if (data?.trader_persona && typeof data.trader_persona === "object") {
      const p = data.trader_persona as Record<string, unknown>;
      if (p.risk_tolerance) context.riskTolerance = String(p.risk_tolerance);
    }
  } catch { /* partial context */ }

  return context;
}

/**
 * Format AIContext into a human-readable string for system prompts.
 */
export function formatContextForPrompt(ctx: AIContext): string {
  const lines: string[] = ["## Kullanıcı Portföy Durumu (Anlık)"];

  if (ctx.symbol && ctx.currentPrice) {
    lines.push(
      `\n### Seçili Sembol: ${ctx.symbol}`,
      `Fiyat: $${ctx.currentPrice.toFixed(2)}`,
      `24s Değişim: ${ctx.changePct24h?.toFixed(2)}%`
    );
  }

  lines.push(
    `\n### Hesap`,
    `Bakiye: $${ctx.accountBalance.toFixed(2)}`,
    `Toplam PnL: $${ctx.totalPnl.toFixed(2)}`
  );

  if (ctx.riskTolerance) {
    const riskLabel =
      ctx.riskTolerance === "conservative" ? "Dikkatli (Conservative)"
      : ctx.riskTolerance === "aggressive" ? "Agresif (Aggressive)"
      : "Dengeli (Moderate)";
    lines.push(`\nRisk Toleransı: ${riskLabel}`);
    const tone =
      ctx.riskTolerance === "conservative"
        ? "Kullanıcı düşük risk toleransına sahip — önerilerin temkinli ve sermaye koruma odaklı olmalı."
        : ctx.riskTolerance === "aggressive"
        ? "Kullanıcı yüksek risk toleransına sahip — öneriler agresif fırsatçı olabilir ama yine de risk yönetimini hatırlat."
        : "Kullanıcı orta risk toleransına sahip — dengeli öneriler ver.";
    lines.push(`\nAI Tonu: ${tone}`);
  }

  if (ctx.openPositions.length > 0) {
    lines.push("\n### Açık Pozisyonlar");
    ctx.openPositions.forEach((p) => {
      lines.push(
        `${p.symbol} ${p.side.toUpperCase()} | ${p.quantity} adet | ` +
          `Giriş: $${p.entryPrice} | Güncel: $${p.currentPrice} | ` +
          `PnL: $${p.unrealizedPnl.toFixed(2)}`
      );
    });
  } else {
    lines.push("\nAçık pozisyon yok.");
  }

  if (ctx.recentTrades.length > 0) {
    lines.push("\n### Son İşlemler");
    ctx.recentTrades.forEach((t) => {
      lines.push(`${t.symbol} ${t.side} → PnL: $${t.pnl?.toFixed(2) ?? "—"}`);
    });
  }

  return lines.join("\n");
}
