// AI Trade Coach: Kullanıcının son 30 günlük işlem davranışını analiz eder.
// Pattern'leri tespit eder, kişiselleşmiş içgörüler üretir, coach_insights tablosuna yazar.
// Lovable AI Gateway (gemini-2.5-flash) kullanır - API key gerekmez.
// Tetikleme: Manuel (UI'dan) veya cron (haftalık).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { Admin } from "../_shared/blitz-types.ts";
import { rateLimit } from "../_shared/rate-limit.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { buildAIContext, formatContextForPrompt } from "../_shared/build-ai-context.ts";

/** Module-level holder for the last AI error code, read by the handler for HTTP mapping. */
let _lastAiError: string | null = null;

const TradeCoachRequestSchema = z.object({
  user_id: z.string().uuid().optional(),
});

interface TradeRow {
  symbol: string; asset_class: string; side: string; action: string;
  quantity: number; price: number; total: number; pnl: number | null;
  executed_at: string;
}

interface BehaviorStats {
  totalTrades: number;
  totalPnl: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  winLossRatio: number;
  topSymbol: string | null;
  symbolConcentration: number;
  assetClassCount: number;
  nightTradeRatio: number;
  revengeCount: number;
  quickCloseCount: number;
  lossStreak: number;
  tradeCooldownUntil: string | null;
}

function analyzeBehavior(trades: TradeRow[]) {
  if (trades.length === 0) return null;

  const totalPnl = trades.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
  const closes = trades.filter((t) => t.action === "close");
  const wins = closes.filter((t) => Number(t.pnl ?? 0) > 0);
  const losses = closes.filter((t) => Number(t.pnl ?? 0) < 0);
  const winRate = closes.length > 0 ? (wins.length / closes.length) * 100 : 0;

  const avgWin = wins.length > 0 ? wins.reduce((a, t) => a + Number(t.pnl), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, t) => a + Number(t.pnl), 0) / losses.length) : 0;
  const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

  // Sembol konsantrasyonu
  const bySymbol: Record<string, number> = {};
  trades.forEach((t) => { bySymbol[t.symbol] = (bySymbol[t.symbol] ?? 0) + 1; });
  const topSymbol = Object.entries(bySymbol).sort((a, b) => b[1] - a[1])[0];
  const symbolConcentration = topSymbol ? topSymbol[1] / trades.length : 0;

  // Asset class çeşitlilik
  const acs = new Set(trades.map((t) => t.asset_class));

  // Zaman pattern: gece trade'leri (UTC 22-05)
  const nightTrades = trades.filter((t) => {
    const h = new Date(t.executed_at).getUTCHours();
    return h >= 22 || h < 5;
  });
  const nightRatio = nightTrades.length / trades.length;

  // Revenge trading: kayıptan sonra 1 saat içinde aynı sembolde yeni pozisyon
  let revengeCount = 0;
  for (let i = 1; i < trades.length; i++) {
    const prev = trades[i - 1];
    const cur = trades[i];
    if (Number(prev.pnl ?? 0) < 0 && prev.symbol === cur.symbol && cur.action === "open") {
      const dt = new Date(cur.executed_at).getTime() - new Date(prev.executed_at).getTime();
      if (dt < 3600 * 1000) revengeCount++;
    }
  }

  // Hızlı kapatma: pozisyon < 10 dk açık kaldıysa
  const quickCloses = closes.filter((c) => {
    const open = trades.find((t) => t.symbol === c.symbol && t.action === "open" &&
      new Date(t.executed_at).getTime() < new Date(c.executed_at).getTime());
    if (!open) return false;
    return new Date(c.executed_at).getTime() - new Date(open.executed_at).getTime() < 10 * 60 * 1000;
  });

  // Loss streak detection: arka arkaya 3 zarar
  let lossStreak = 0;
  for (let i = closes.length - 1; i >= 0; i--) {
    const pnl = Number(closes[i].pnl ?? 0);
    if (pnl < 0) lossStreak++;
    else break;
  }
  const tradeCooldownUntil = lossStreak >= 3
    ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
    : null;

  return {
    totalTrades: trades.length,
    totalPnl: +totalPnl.toFixed(2),
    winRate: +winRate.toFixed(1),
    avgWin: +avgWin.toFixed(2),
    avgLoss: +avgLoss.toFixed(2),
    winLossRatio: +winLossRatio.toFixed(2),
    topSymbol: topSymbol?.[0] ?? null,
    symbolConcentration: +(symbolConcentration * 100).toFixed(1),
    assetClassCount: acs.size,
    nightTradeRatio: +(nightRatio * 100).toFixed(1),
    revengeCount,
    quickCloseCount: quickCloses.length,
    lossStreak,
    tradeCooldownUntil,
  };
}

async function generateInsight(stats: BehaviorStats, contextStr: string): Promise<{ category: string; severity: string; title: string; body: string } | null> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return null;

  const prompt = `${contextStr}\n\n---\n\nSen bir profesyonel trading koçusun. Kullanıcının son 30 gündeki işlem istatistikleri:
- Toplam işlem: ${stats.totalTrades}
- Toplam P&L: $${stats.totalPnl}
- Kazanma oranı: %${stats.winRate}
- Ortalama kazanç: $${stats.avgWin}
- Ortalama kayıp: $${stats.avgLoss}
- Win/Loss oranı: ${stats.winLossRatio}
- En çok işlem yapılan sembol: ${stats.topSymbol} (toplam işlemlerin %${stats.symbolConcentration}'i)
- Çeşitlendirme: ${stats.assetClassCount} farklı varlık sınıfı
- Gece (22:00-05:00 UTC) işlem oranı: %${stats.nightTradeRatio}
- "Revenge trading" sayısı (kayıp sonrası 1 saat içinde aynı sembol): ${stats.revengeCount}
- Hızlı kapatma (10 dk içinde): ${stats.quickCloseCount}

En önemli 1 davranışsal içgörüyü çıkar. JSON formatında yanıt ver:
{
  "category": "discipline|risk|consistency|emotion|diversification",
  "severity": "info|warning|critical",
  "title": "Kısa, dikkat çekici Türkçe başlık (max 60 karakter)",
  "body": "2-3 cümlelik somut, eyleme geçirilebilir Türkçe öneri"
}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lumen.trade",
        "X-Title": "Lumen Trade",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!r.ok) {
      const errText = await r.text();
      _lastAiError = r.status === 429 ? "RATE_LIMITED"
        : r.status === 402 ? "QUOTA_EXCEEDED"
        : r.status >= 500 ? "AI_UNAVAILABLE"
        : "AI_ERROR";
      console.error("AI gateway", r.status, _lastAiError, errText);
      return null;
    }
    const json = await r.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      _lastAiError = "AI_TIMEOUT";
      console.error("AI timeout mapped to 504 AI_TIMEOUT");
      return null;
    }
    _lastAiError = "AI_PARSE_ERROR";
    console.error("AI parse error", e);
    return null;
  }
}

async function processUser(admin: Admin, userId: string) {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: trades } = await admin.from("trades")
    .select("symbol, asset_class, side, action, quantity, price, total, pnl, executed_at")
    .eq("user_id", userId)
    .gte("executed_at", since)
    .order("executed_at", { ascending: true });

  if (!trades || trades.length < 3) return { skipped: true, reason: "not_enough_trades" };

  const stats = analyzeBehavior(trades as TradeRow[]);
  if (!stats) return { skipped: true };

  const ctx = await buildAIContext(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    userId
  );
  const contextStr = formatContextForPrompt(ctx);

  const insight = await generateInsight(stats, contextStr);
  if (!insight) return { skipped: true, reason: "ai_failed" };

  await admin.from("coach_insights").insert({
    user_id: userId,
    category: insight.category,
    severity: insight.severity,
    title: insight.title,
    body: insight.body,
    metadata: { stats },
  });

  await admin.from("notifications").insert({
    user_id: userId,
    type: "coach_insight",
    title: `🧠 Trade Coach: ${insight.title}`,
    body: insight.body,
    link: "/coach",
    metadata: { category: insight.category, severity: insight.severity },
  });

  return { ok: true, insight };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const start = Date.now();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const parseResult = TradeCoachRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: parseResult.error.errors[0].message, event: "request", duration_ms: Date.now() - start }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const targetUserId = parseResult.data.user_id;

    // Tek kullanıcı modu (UI'dan tetik) — auth kontrolü
    if (targetUserId) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return new Response(JSON.stringify({ error: "Yetkisiz erişim", event: "request", duration_ms: Date.now() - start }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } });
      const { data: userData } = await auth.auth.getUser(authHeader.replace("Bearer ", ""));
      if (userData.user?.id !== targetUserId) {
        return new Response(JSON.stringify({ error: "Yasak", event: "request", duration_ms: Date.now() - start }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rlResponse = await rateLimit(targetUserId, "ai-trade-coach");
      if (rlResponse) return rlResponse;

      const result = await processUser(admin, targetUserId);
      const elapsed = Date.now() - start;
      if (result.skipped && result.reason === "ai_failed" && _lastAiError) {
        const code = _lastAiError;
        _lastAiError = null;
        const status = code === "RATE_LIMITED" ? 429
          : code === "QUOTA_EXCEEDED" ? 503
          : code === "AI_TIMEOUT" ? 504
          : code === "AI_UNAVAILABLE" ? 503
          : 502;
        const message = code === "RATE_LIMITED" ? "Çok fazla istek, lütfen bekleyin"
          : code === "QUOTA_EXCEEDED" ? "AI servis kotası aşıldı"
          : code === "AI_TIMEOUT" ? "AI servisi zaman aşımı"
          : code === "AI_UNAVAILABLE" ? "AI servisi geçici olarak kullanılamıyor"
          : "AI servisi hatası";
        const retryable = code === "RATE_LIMITED" || code === "AI_TIMEOUT" || code === "AI_UNAVAILABLE";
        return new Response(JSON.stringify({ skipped: true, reason: "ai_error", error: message, code, retryable, event: "request", duration_ms: elapsed }), {
          status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, ...result, event: "request", duration_ms: elapsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Toplu mod (cron) — service-role bearer zorunlu
    const cronAuth = req.headers.get("Authorization") ?? "";
    if (cronAuth !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
      return new Response(JSON.stringify({ error: "Yetkisiz erişim", event: "request", duration_ms: Date.now() - start }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // son 30 günde işlem yapan tüm kullanıcılar
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: activeUsers } = await admin.from("trades")
      .select("user_id").gte("executed_at", since);
    const ids = Array.from(new Set((activeUsers ?? []).map((r: any) => r.user_id)));

    let processed = 0;
    for (const id of ids) {
      const r = await processUser(admin, id);
      if (r.ok) processed++;
    }
    return new Response(JSON.stringify({ success: true, users: ids.length, processed, event: "request", duration_ms: Date.now() - start }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-trade-coach error", e);
    return new Response(JSON.stringify({ error: "Sunucu hatası oluştu", code: "INTERNAL_ERROR", event: "request", duration_ms: Date.now() - start }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
