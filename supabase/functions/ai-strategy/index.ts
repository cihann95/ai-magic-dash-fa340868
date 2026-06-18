// AI strateji önerileri - kullanıcının portföy dengesine göre
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const StrategyRequestSchema = z.object({
  language: z.enum(["tr", "en"]).default("tr"),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const start = Date.now();
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401, headers: corsHeaders });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData.user;
    if (!user) return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401, headers: corsHeaders });

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
    const { language } = parseResult.data;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [{ data: positions }, { data: profile }] = await Promise.all([
      admin.from("positions").select("symbol,asset_class,side,quantity,entry_price,current_price").eq("user_id", user.id),
      admin.from("profiles").select("demo_balance,initial_balance").eq("id", user.id).single(),
    ]);

    // Dağılım hesapla
    const allocation: Record<string, number> = {};
    let total = 0;
    for (const p of positions ?? []) {
      const v = Number(p.quantity) * Number(p.current_price ?? p.entry_price);
      allocation[p.asset_class] = (allocation[p.asset_class] ?? 0) + v;
      total += v;
    }
    const pct: Record<string, number> = {};
    for (const k of Object.keys(allocation)) pct[k] = +((allocation[k] / total) * 100).toFixed(1);

    const ctx = {
      balance: profile?.demo_balance,
      initial: profile?.initial_balance,
      positions_count: positions?.length ?? 0,
      allocation_pct: pct,
      total_value: total,
    };

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const sys = language === "tr"
      ? "Sen risk yönetimi uzmanısın. Verilen portföy dağılımına göre 3 somut, kısa ve aksiyona yönelik strateji önerisi ver. Markdown bullet liste, max 200 kelime. Sonda yatırım tavsiyesi değil notu ekle."
      : "You are a risk management expert. Given the portfolio allocation, give 3 concrete, short, actionable strategy suggestions. Markdown bullets, max 200 words. End with not-investment-advice note.";

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
            { role: "user", content: `Portföy: ${JSON.stringify(ctx)}` },
          ],
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        console.log(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
        return new Response(JSON.stringify({ error: "AI servisi zaman aşımına uğradı", code: "AI_TIMEOUT" }), {
          status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    const ms = Date.now() - start;
    if (aiResp.status === 429) {
      console.log(JSON.stringify({ event: "request", duration_ms: ms }));
      return new Response(JSON.stringify({ error: "Çok fazla istek, lütfen bekleyin", code: "RATE_LIMITED" }), { status: 429, headers: corsHeaders });
    }
    if (aiResp.status === 402) {
      console.log(JSON.stringify({ event: "request", duration_ms: ms }));
      return new Response(JSON.stringify({ error: "AI kredisi yetersiz", code: "QUOTA_EXCEEDED" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiResp.status >= 500) {
      console.log(JSON.stringify({ event: "request", duration_ms: ms }));
      return new Response(JSON.stringify({ error: "AI servisi geçici olarak kullanılamıyor", code: "AI_UNAVAILABLE" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!aiResp.ok) {
      console.log(JSON.stringify({ event: "request", duration_ms: ms }));
      return new Response(JSON.stringify({ error: "AI servisi hatası", code: "AI_ERROR" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
