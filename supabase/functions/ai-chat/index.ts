import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: u, error: ue } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (ue || !u.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const rlResponse = await rateLimit(u.user.id, "ai-chat");
    if (rlResponse) return rlResponse;

    const body = await req.json().catch(() => ({}));
    const parseResult = ChatRequestSchema.safeParse(body);
    if (!parseResult.success) {
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
      return new Response(JSON.stringify({ error: "Servis geçici olarak kullanılamıyor" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sys = lang === "tr"
      ? `Sen yardımcı bir finans/yatırım asistanısın. Net, kısa cevaplar ver. Markdown kullan. ${safeSymbol ? `Aktif sembol: ${safeSymbol}.` : ""} Yatırım tavsiyesi vermediğini hatırlat.`
      : `You are a helpful financial assistant. Be clear and concise. Use markdown. ${safeSymbol ? `Active symbol: ${safeSymbol}.` : ""} Remind users this is not investment advice.`;

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
    });

    if (resp.status === 429) return new Response(JSON.stringify({ error: "Çok fazla istek, lütfen bekleyin." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (resp.status === 402) return new Response(JSON.stringify({ error: "AI kredisi yetersiz." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!resp.ok) {
      const t = await resp.text(); console.error("AI gateway:", resp.status, t);
      return new Response(JSON.stringify({ error: "AI servisi hatası" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(resp.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("ai-chat error", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
