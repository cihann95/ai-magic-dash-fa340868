import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: u, error: ue } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (ue || !u.user) return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { symbol, language = "tr" } = await req.json().catch(() => ({}));
    let safeSymbol = "";
    if (symbol != null) {
      if (typeof symbol !== "string" || !/^[A-Z0-9.-]{1,16}$/.test(symbol)) {
        return new Response(JSON.stringify({ error: "Geçersiz sembol" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      safeSymbol = symbol;
    }
    const lang = language === "en" ? "en" : "tr";
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      console.error("news-feed: OPENROUTER_API_KEY missing");
      return new Response(JSON.stringify({ error: "Servis geçici olarak kullanılamıyor" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sys = lang === "tr"
      ? "Sen finans haber editörüsün. Verilen sembol için 5 GERÇEK, GÜNCEL haber başlığı üret (kısa, 1 cümle özet ile). Her biri için duyarlılık skoru ver: bullish | bearish | neutral. Yalnızca JSON dön."
      : "You are a finance news editor. Produce 5 REAL, RECENT news headlines for the symbol with a 1-sentence summary and sentiment: bullish | bearish | neutral. Return JSON only.";

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
          { role: "system", content: sys },
          { role: "user", content: `Symbol: ${safeSymbol || "piyasa geneli"}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_news",
            description: "Return news items",
            parameters: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      summary: { type: "string" },
                      sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                      source: { type: "string" },
                    },
                    required: ["title", "summary", "sentiment"],
                  },
                },
              },
              required: ["items"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_news" } },
      }),
    });

    if (resp.status === 429) return new Response(JSON.stringify({ error: "Çok fazla istek." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (resp.status === 402) return new Response(JSON.stringify({ error: "AI kredisi yetersiz." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!resp.ok) {
      console.error("news-feed AI gateway:", resp.status);
      return new Response(JSON.stringify({ error: "AI servisi hatası" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { items: [] };

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("news-feed error", e);
    return new Response(JSON.stringify({ error: "Sunucu hatası oluştu" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
