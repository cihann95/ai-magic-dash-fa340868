import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AnalyzeRequestSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9.-]{1,16}$/, "Geçersiz sembol formatı"),
  asset_class: z.string().regex(/^[a-z]{1,16}$/).optional(),
  language: z.enum(["tr", "en"]).default("tr"),
});

async function requireUser(req: Request): Promise<{ response: Response | null; userId: string | null }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { response: new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }), userId: null };
  const token = authHeader.replace("Bearer ", "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return { response: new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }), userId: null };
  return { response: null, userId: data.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { response: unauthorized, userId } = await requireUser(req);
    if (unauthorized) return unauthorized;

    const rlResponse = await rateLimit(userId!, "ai-analyze");
    if (rlResponse) return rlResponse;

    const body = await req.json().catch(() => ({}));
    const parseResult = AnalyzeRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: parseResult.error.errors[0].message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { symbol, asset_class, language } = parseResult.data;
    const safeAsset = asset_class ?? null;
    const lang = language;

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY yapılandırılmamış");

    const sys = lang === "tr"
      ? "Sen profesyonel bir piyasa analistisin. Sembol için kısa, eyleme dönük teknik+temel analiz yap. Markdown kullan. Bölümler: **Genel Görünüm**, **Teknik (trend, destek/direnç)**, **Temel Etkenler**, **Sinyal: AL / SAT / BEKLE** (kalın). 200 kelimeyi geçme. Yatırım tavsiyesi olmadığını sonda kısaca belirt."
      : "You are a professional market analyst. Provide a concise, actionable technical+fundamental analysis. Use markdown sections: **Overview**, **Technical (trend, S/R)**, **Fundamentals**, **Signal: BUY / SELL / HOLD** (bold). Under 200 words. Add brief disclaimer.";

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
          { role: "user", content: `Sembol: ${symbol} (${safeAsset || "—"}). Güncel piyasa koşullarına göre analiz et.` },
        ],
      }),
    });

    if (resp.status === 429) return new Response(JSON.stringify({ error: "AI istek limiti doldu, biraz sonra deneyin." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (resp.status === 402) return new Response(JSON.stringify({ error: "AI kredisi yetersiz. Lütfen workspace'inize kredi ekleyin." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!resp.ok) {
      const t = await resp.text(); console.error("AI gateway:", resp.status, t);
      return new Response(JSON.stringify({ error: "AI servisi hatası" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "Analiz oluşturulamadı.";

    return new Response(JSON.stringify({ analysis: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-analyze error", e);
    return new Response(JSON.stringify({ error: "Sunucu hatası oluştu" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
