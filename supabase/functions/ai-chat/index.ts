import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { logObservability, logger } from "../_shared/logger.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYMBOL_RE = /^[A-Z0-9.-]{1,16}$/;
const MAX_MESSAGES = 20;
const MAX_MSG_LEN = 4000;

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(MAX_MSG_LEN),
});

const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(MAX_MESSAGES),
  language: z.enum(["tr", "en"]).default("tr"),
  context_symbol: z.string().regex(SYMBOL_RE).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let start = 0;
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: u, error: ue } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (ue || !u.user) return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    start = Date.now();

    const rlResponse = await rateLimit(u.user.id, "ai-chat");
    if (rlResponse) { console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start })); return rlResponse; }

    const body = await req.json().catch(() => ({}));
    const parseResult = ChatRequestSchema.safeParse(body);
    if (!parseResult.success) {
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify({ error: parseResult.error.errors[0].message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { messages, language, context_symbol } = parseResult.data;
    const cleanMessages = messages;
    const safeSymbol = context_symbol;
    const lang = language;

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      console.error("ai-chat: OPENROUTER_API_KEY missing");
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify({ error: "Servis geçici olarak kullanılamıyor" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sys = lang === "tr"
      ? `Sen yardımcı bir finans/yatırım asistanısın. Net, kısa cevaplar ver. Markdown kullan. ${safeSymbol ? `Aktif sembol: ${safeSymbol}.` : ""} Yatırım tavsiyesi vermediğini hatırlat.`
      : `You are a helpful financial assistant. Be clear and concise. Use markdown. ${safeSymbol ? `Active symbol: ${safeSymbol}.` : ""} Remind users this is not investment advice.`;

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
        messages: [{ role: "system", content: sys }, ...cleanMessages],
        stream: true,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (resp.status === 429) {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      logObservability(admin, "ai-chat", "Rate limited", { error_code: "RATE_LIMITED", duration_ms: Date.now() - start });
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify({ skipped: true, reason: "rate_limit", code: "RATE_LIMITED", retryable: true }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (resp.status === 402) {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      logObservability(admin, "ai-chat", "Quota exceeded", { error_code: "QUOTA_EXCEEDED", duration_ms: Date.now() - start });
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify({ skipped: true, reason: "credits", code: "QUOTA_EXCEEDED", retryable: false }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!resp.ok) {
      const t = await resp.text(); console.error("AI gateway:", resp.status, t);
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      logObservability(admin, "ai-chat", "AI gateway error", { error_code: "AI_UNAVAILABLE", status: resp.status, duration_ms: Date.now() - start });
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify({ skipped: true, reason: "ai_error", code: "AI_UNAVAILABLE", retryable: true }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Pass through stream with error logging
    const { readable, writable } = new TransformStream();
    resp.body!.pipeTo(writable).catch((err) => {
      console.error("Stream error:", err);
    });

    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return new Response(readable, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      console.error("ai-chat timeout");
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      logObservability(admin, "ai-chat", "Timeout", { error_code: "AI_TIMEOUT", duration_ms: start ? Date.now() - start : 0 });
      console.error(JSON.stringify({ event: "request", duration_ms: start ? Date.now() - start : 0 }));
      return new Response(JSON.stringify({ skipped: true, reason: "timeout", code: "AI_TIMEOUT", retryable: true }), {
        status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("ai-chat error", e);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    logObservability(admin, "ai-chat", String(e), { error_code: "INTERNAL_ERROR", duration_ms: start ? Date.now() - start : 0 });
    console.error(JSON.stringify({ event: "request", duration_ms: start ? Date.now() - start : 0 }));
    return new Response(JSON.stringify({ error: "Sunucu hatası oluştu", code: "INTERNAL_ERROR" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
