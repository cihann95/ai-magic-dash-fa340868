import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function requireUser(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const token = authHeader.replace("Bearer ", "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const unauthorized = await requireUser(req);
    if (unauthorized) return unauthorized;
    const { symbol, asset_class, language = "tr" } = await req.json().catch(() => ({}));
    if (typeof symbol !== "string" || !/^[A-Z0-9.\-]{1,16}$/.test(symbol)) {
      return new Response(JSON.stringify({ error: "Geçersiz sembol" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const safeAsset = typeof asset_class === "string" && /^[a-z]{1,16}$/.test(asset_class) ? asset_class : null;
    const lang = language === "en" ? "en" : "tr";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY yapılandırılmamış");

    const sys = language === "tr"
      ? "Sen profesyonel bir piyasa analistisin. Sembol için kısa, eyleme dönük teknik+temel analiz yap. Markdown kullan. Bölümler: **Genel Görünüm**, **Teknik (trend, destek/direnç)**, **Temel Etkenler**, **Sinyal: AL / SAT / BEKLE** (kalın). 200 kelimeyi geçme. Yatırım tavsiyesi olmadığını sonda kısaca belirt."
      : "You are a professional market analyst. Provide a concise, actionable technical+fundamental analysis. Use markdown sections: **Overview**, **Technical (trend, S/R)**, **Fundamentals**, **Signal: BUY / SELL / HOLD** (bold). Under 200 words. Add brief disclaimer.";

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Sembol: ${symbol} (${asset_class || "—"}). Güncel piyasa koşullarına göre analiz et.` },
        ],
      }),
    });

    if (resp.status === 429) return new Response(JSON.stringify({ error: "AI istek limiti doldu, biraz sonra deneyin." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (resp.status === 402) return new Response(JSON.stringify({ error: "AI kredisi yetersiz. Lütfen workspace'inize kredi ekleyin." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!resp.ok) {
      const t = await resp.text(); console.error("AI gateway:", resp.status, t);
      throw new Error("AI servisi hatası");
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "Analiz oluşturulamadı.";

    return new Response(JSON.stringify({ analysis: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-analyze error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
