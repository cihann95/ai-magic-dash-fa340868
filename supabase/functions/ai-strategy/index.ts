// AI strateji önerileri - kullanıcının portföy dengesine göre
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { buildAIContext, formatContextForPrompt } from "../_shared/build-ai-context.ts";

const StrategyRequestSchema = z.object({
  language: z.enum(["tr", "en"]).default("tr"),
  symbol: z.string().regex(/^[A-Z0-9.-]{1,16}$/).optional(),
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const start = Date.now();
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Yetkisiz erişim", code: "UNAUTHORIZED" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData.user;
    if (!user) return new Response(JSON.stringify({ error: "Yetkisiz erişim", code: "UNAUTHORIZED" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const rlResponse = await rateLimit(user.id, "ai-strategy");
    if (rlResponse) {
      console.log(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return rlResponse;
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = StrategyRequestSchema.safeParse(body);
    if (!parseResult.success) {
      console.log(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify({ error: parseResult.error.errors[0].message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { language, symbol } = parseResult.data;

    const ctx = await buildAIContext(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      user.id,
      symbol
    );
    const contextStr = formatContextForPrompt(ctx);

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const sys = language === "tr"
      ? `${contextStr}\n\n---\n\nSen risk yönetimi uzmanısın. Verilen portföy dağılımına göre 3 somut, kısa ve aksiyona yönelik strateji önerisi ver. Markdown bullet liste, max 200 kelime. Sonda yatırım tavsiyesi değil notu ekle.`
      : `${contextStr}\n\n---\n\nYou are a risk management expert. Given the portfolio allocation, give 3 concrete, short, actionable strategy suggestions. Markdown bullets, max 200 words. End with not-investment-advice note.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

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
            { role: "system", content: sys },
            { role: "user", content: "Mevcut portföy durumuma göre strateji öner." },
          ],
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        console.log(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
        return new Response(JSON.stringify({ skipped: true, reason: "timeout", code: "AI_TIMEOUT", retryable: true }), {
          status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    const ms = Date.now() - start;
    if (aiResp.status === 429) {
      console.log(JSON.stringify({ event: "request", duration_ms: ms }));
      return new Response(JSON.stringify({ skipped: true, reason: "rate_limit", code: "RATE_LIMITED", retryable: true }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiResp.status === 402) {
      console.log(JSON.stringify({ event: "request", duration_ms: ms }));
      return new Response(JSON.stringify({ skipped: true, reason: "credits", code: "QUOTA_EXCEEDED", retryable: false }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiResp.status >= 500) {
      console.log(JSON.stringify({ event: "request", duration_ms: ms }));
      return new Response(JSON.stringify({ skipped: true, reason: "ai_error", code: "AI_UNAVAILABLE", retryable: true }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!aiResp.ok) {
      console.log(JSON.stringify({ event: "request", duration_ms: ms }));
      return new Response(JSON.stringify({ skipped: true, reason: "ai_error", code: `AI_${aiResp.status}`, retryable: false }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await aiResp.json();
    console.log(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return new Response(JSON.stringify({ suggestion: data.choices?.[0]?.message?.content ?? "" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-strategy error", e);
    console.log(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return new Response(JSON.stringify({ error: "Sunucu hatası oluştu", code: "INTERNAL_ERROR" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
