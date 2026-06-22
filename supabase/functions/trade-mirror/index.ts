// AI Ayna - Kapanan trade'den sonra kullanıcının davranış kalıbına dair 1-2 cümle gözlem üretir.
// Tavsiye DEĞİL, gözlem. Sonucu coach_insights'a + notifications'a yazar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

interface MirrorRequest {
  user_id: string;
  trade_id: string;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // Internal only — must be invoked with the service-role key
  const auth = req.headers.get("Authorization") ?? "";
  const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (auth !== expected) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const start = Date.now();

  try {
    const { user_id, trade_id } = (await req.json()) as MirrorRequest;
    if (!user_id || !trade_id) {
      return new Response(JSON.stringify({ error: "Eksik parametreler" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Pull last 90d closed trades for context
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: trades } = await admin
      .from("trades")
      .select("id, symbol, side, action, quantity, price, total, pnl, intent_tag, executed_at, position_id")
      .eq("user_id", user_id)
      .gte("executed_at", since)
      .order("executed_at", { ascending: false })
      .limit(50);

    if (!trades || trades.length < 2) {
      return new Response(JSON.stringify({ skipped: true, reason: "not_enough_trades" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const current = trades.find((t) => t.id === trade_id);
    if (!current) {
      return new Response(JSON.stringify({ skipped: true, reason: "trade_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch entry_price from positions for the current trade
    let currentEntryPrice: number | null = null;
    let currentQuantity: number | null = null;
    if (current.position_id) {
      const { data: pos } = await admin
        .from("positions")
        .select("entry_price, quantity")
        .eq("id", current.position_id)
        .single();
      if (pos) {
        currentEntryPrice = pos.entry_price != null ? Number(pos.entry_price) : null;
        currentQuantity = pos.quantity != null ? Number(pos.quantity) : null;
      }
    }

    // pnlPct: kod'da hesapla, AI'a GÖNDERME
    const pnlNum = current.pnl != null ? Number(current.pnl) : 0;
    const entryForPct = currentEntryPrice ?? 0;
    const qtyForPct = currentQuantity ?? Number(current.quantity ?? 0);
    const pnlPct = entryForPct > 0 && qtyForPct > 0
      ? (pnlNum / (entryForPct * qtyForPct)) * 100
      : 0;

    const compact = trades.slice(0, 30).map((t) => ({
      sym: t.symbol,
      side: t.side,
      action: t.action,
      pnl: t.pnl != null ? Number(t.pnl).toFixed(2) : null,
      entry_price: null,
      exit_price: t.price != null ? Number(t.price) : null,
      quantity: t.quantity != null ? Number(t.quantity) : null,
      intent: t.intent_tag ?? null,
      at: t.executed_at,
    }));

    const systemPrompt = `Sen bir trader davranış aynasısın. Kullanıcının son işlemlerine bakıp YENİ KAPATILAN işlem hakkında 1-2 cümle GÖZLEM yazarsın.

KESIN KURALLAR:
- pnl BİR DOLAR TUTARIDIR, yüzde DEĞİLDİR. pnlPct sana ayrıca verilir, sadece onu kullan.
- Yüzdeyi ASLA kendin hesaplama. Sadece pnlPct alanını kullan.
- Veride olmayan bilgiyi uydurma.
- Çıktı MUTLAKA JSON formatında: {"observation": "1-2 cümle Türkçe gözlem", "pattern": "kalıp açıklaması veya null", "winRate": "son 30 işlemde kazanma oranı %X veya null"}
- Türkçe yanıtla, samimi ve kısa.
- "Olabilir mi?" ile bitir, kesin yargı yok.
- Tavsiye verme, sadece gözlemle.`;

    const currentPnl = current.pnl != null ? Number(current.pnl).toFixed(2) : "0";
    const userPrompt = `Yeni kapatılan işlem: ${JSON.stringify({
      sym: current.symbol, side: current.side, pnl: currentPnl, pnlPct: pnlPct.toFixed(1), intent: current.intent_tag,
    })}\n\nSon 30 işlem (en yeni önce):\n${JSON.stringify(compact)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let aiResp: Response;
    try {
      aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://lumen.trade",
          "X-Title": "Lumen Trade",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeout);
      const elapsed = Date.now() - start;
      if (e instanceof DOMException && e.name === "AbortError") {
        return new Response(JSON.stringify({ error: "AI zaman aşımı", code: "AI_TIMEOUT", event: "request", duration_ms: elapsed }), {
          status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw e;
    }
    clearTimeout(timeout);

    if (!aiResp.ok) {
      const elapsed = Date.now() - start;
      const txt = await aiResp.text();
      console.error("AI error", aiResp.status, txt);
      if (aiResp.status === 429 || aiResp.status === 402) {
        return new Response(JSON.stringify({ skipped: true, reason: aiResp.status === 429 ? "rate_limit" : "credits", event: "request", duration_ms: elapsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ skipped: true, reason: "ai_error", code: `AI_${aiResp.status}`, event: "request", duration_ms: elapsed }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const rawContent = aiJson.choices?.[0]?.message?.content ?? "";

    let observation = `İşlem kapatıldı: ${pnlNum >= 0 ? "+" : ""}$${pnlNum.toFixed(2)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)`;
    let pattern: string | null = null;
    let winRate: string | null = null;
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed.observation) observation = String(parsed.observation);
      if (parsed.pattern) pattern = String(parsed.pattern);
      if (parsed.winRate) winRate = String(parsed.winRate);
    } catch {
    }

    const patternType = pattern ?? "other";

    // Build intent-aware title
    const intentMap: Record<string, string> = {
      technical: "📊 Teknik sinyal",
      news: "📰 Haber",
      intuition: "✨ Sezgi",
    };
    const pnlPctStr = `(${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)`;
    const titlePrefix = current.intent_tag && intentMap[current.intent_tag]
      ? `${intentMap[current.intent_tag]} → +$${pnlNum.toFixed(2)} ${pnlPctStr}`
      : `🪞 ${current.symbol} aynası`;

    // Insert into coach_insights
    await admin.from("coach_insights").insert({
      user_id,
      category: "mirror",
      severity: "info",
      title: titlePrefix,
      body: observation,
      metadata: { trade_id, pattern_type: patternType, intent: current.intent_tag, pnl: pnlNum, pnlPct, pattern, winRate },
    });

    await admin.from("notifications").insert({
      user_id,
      type: "ai_signal",
      title: `🪞 ${titlePrefix}`,
      body: observation,
      link: "/insights",
      metadata: { trade_id, pattern_type: patternType, pnlPct, pattern, winRate },
    });

    const elapsed = Date.now() - start;
    return new Response(JSON.stringify({ ok: true, observation, pattern_type: patternType, event: "request", duration_ms: elapsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const elapsed = Date.now() - start;
    console.error("trade-mirror error", e);
    return new Response(JSON.stringify({ error: "Sunucu hatası oluştu", event: "request", duration_ms: elapsed }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
