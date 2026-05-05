// AI Trade Coach: Kullanıcının son 30 günlük işlem davranışını analiz eder.
// Pattern'leri tespit eder, kişiselleşmiş içgörüler üretir, coach_insights tablosuna yazar.
// Lovable AI Gateway (gemini-2.5-flash) kullanır - API key gerekmez.
// Tetikleme: Manuel (UI'dan) veya cron (haftalık).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TradeRow {
  symbol: string; asset_class: string; side: string; action: string;
  quantity: number; price: number; total: number; pnl: number | null;
  executed_at: string;
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
  };
}

async function generateInsight(stats: any): Promise<{ category: string; severity: string; title: string; body: string } | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;

  const prompt = `Sen bir profesyonel trading koçusun. Kullanıcının son 30 gündeki işlem istatistikleri:
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
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      console.error("AI gateway", r.status, await r.text());
      return null;
    }
    const json = await r.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch (e) {
    console.error("AI parse error", e);
    return null;
  }
}

async function processUser(admin: any, userId: string) {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: trades } = await admin.from("trades")
    .select("symbol, asset_class, side, action, quantity, price, total, pnl, executed_at")
    .eq("user_id", userId)
    .gte("executed_at", since)
    .order("executed_at", { ascending: true });

  if (!trades || trades.length < 3) return { skipped: true, reason: "not_enough_trades" };

  const stats = analyzeBehavior(trades as TradeRow[]);
  if (!stats) return { skipped: true };

  const insight = await generateInsight(stats);
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const targetUserId = body?.user_id;

    // Tek kullanıcı modu (UI'dan tetik) — auth kontrolü
    if (targetUserId) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } });
      const { data: userData } = await auth.auth.getUser(authHeader.replace("Bearer ", ""));
      if (userData.user?.id !== targetUserId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await processUser(admin, targetUserId);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Toplu mod (cron) — service-role bearer zorunlu
    const cronAuth = req.headers.get("Authorization") ?? "";
    if (cronAuth !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
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
    return new Response(JSON.stringify({ success: true, users: ids.length, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-trade-coach error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
