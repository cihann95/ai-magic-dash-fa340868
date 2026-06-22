import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

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
  const cors = handleCors(req);
  if (cors) return cors;

  let start = 0;
  try {
    const { response: unauthorized, userId } = await requireUser(req);
    if (unauthorized) return unauthorized;

    start = Date.now();

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

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
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (resp.status === 429) {
      console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}));
      return new Response(JSON.stringify({ skipped: true, reason: "rate_limit", code: "AI_RATE_LIMITED", retryable: true }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (resp.status === 402) {
      console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}));
      return new Response(JSON.stringify({ skipped: true, reason: "credits", code: "QUOTA_EXCEEDED", retryable: false }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (resp.status === 500 || resp.status === 502 || resp.status === 503) {
      const t = await resp.text(); console.error("AI gateway:", resp.status, t);
      console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}));
      return new Response(JSON.stringify({ skipped: true, reason: "ai_error", code: "AI_UNAVAILABLE", retryable: true }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!resp.ok) {
      const t = await resp.text(); console.error("AI gateway:", resp.status, t);
      console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}));
      return new Response(JSON.stringify({ skipped: true, reason: "ai_error", code: `AI_${resp.status}`, retryable: false }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "Analiz oluşturulamadı.";

    console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}));
    return new Response(JSON.stringify({ analysis: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-analyze error", e);
    if (e instanceof DOMException && e.name === "AbortError") {
      console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}));
      return new Response(JSON.stringify({ skipped: true, reason: "timeout", code: "AI_TIMEOUT", retryable: true }), { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}));
    return new Response(JSON.stringify({ error: "Sunucu hatası oluştu", code: "INTERNAL_ERROR" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
