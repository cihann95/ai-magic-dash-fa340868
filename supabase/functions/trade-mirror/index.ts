// AI Ayna - Kapanan trade'den sonra kullanıcının davranış kalıbına dair 1-2 cümle gözlem üretir.
// Tavsiye DEĞİL, gözlem. Sonucu coach_insights'a + notifications'a yazar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

interface MirrorRequest {
  user_id: string;
  trade_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
      .select("id, symbol, side, action, quantity, price, total, pnl, intent_tag, executed_at")
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

    // Compact context for the model
    const compact = trades.slice(0, 30).map((t) => ({
      sym: t.symbol,
      side: t.side,
      action: t.action,
      pnl: t.pnl != null ? Number(t.pnl).toFixed(2) : null,
      intent: t.intent_tag ?? null,
      at: t.executed_at,
    }));

    const systemPrompt = `Sen bir trader davranış aynasısın. Kullanıcının son işlemlerine bakıp YENİ KAPATILAN işlem hakkında 1-2 cümle GÖZLEM yazarsın. KURALLAR:
- Tavsiye verme. Sadece gözlemle.
- Veride kalıp varsa onu söyle (saat, gün, sembol, niyet etiketi, kazanma oranı).
- Türkçe yanıtla, samimi ve kısa.
- "Olabilir mi?" gibi sorularla bitir, kesin yargı yok.`;

    const userPrompt = `Yeni kapatılan işlem: ${JSON.stringify({
      sym: current.symbol, side: current.side, pnl: current.pnl, intent: current.intent_tag,
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
          tools: [
            {
              type: "function",
              function: {
                name: "emit_mirror",
                description: "Emit a behavioral mirror observation",
                parameters: {
                  type: "object",
                  properties: {
                    observation: { type: "string", description: "1-2 sentence observation in Turkish" },
                    pattern_type: {
                      type: "string",
                      enum: ["timing", "intent", "size", "symbol", "frequency", "other"],
                    },
                    severity: { type: "string", enum: ["info", "warning"] },
                  },
                  required: ["observation", "pattern_type", "severity"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "emit_mirror" } },
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
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      const elapsed = Date.now() - start;
      return new Response(JSON.stringify({ skipped: true, reason: "no_tool_call", event: "request", duration_ms: elapsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const args = JSON.parse(toolCall.function.arguments);
    const observation: string = args.observation;
    const patternType: string = args.pattern_type;
    const severity: string = args.severity ?? "info";

    // Build intent-aware title
    const intentMap: Record<string, string> = {
      technical: "📊 Teknik sinyal",
      news: "📰 Haber",
      intuition: "✨ Sezgi",
    };
    const pnlNum = current.pnl != null ? Number(current.pnl) : 0;
    const titlePrefix = current.intent_tag && intentMap[current.intent_tag]
      ? `${intentMap[current.intent_tag]} → ${pnlNum >= 0 ? "+" : ""}$${pnlNum.toFixed(2)}`
      : `🪞 ${current.symbol} aynası`;

    // Insert into coach_insights
    await admin.from("coach_insights").insert({
      user_id,
      category: "mirror",
      severity,
      title: titlePrefix,
      body: observation,
      metadata: { trade_id, pattern_type: patternType, intent: current.intent_tag, pnl: pnlNum },
    });

    // Notification
    await admin.from("notifications").insert({
      user_id,
      type: "ai_signal",
      title: `🪞 ${titlePrefix}`,
      body: observation,
      link: "/insights",
      metadata: { trade_id, pattern_type: patternType },
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
