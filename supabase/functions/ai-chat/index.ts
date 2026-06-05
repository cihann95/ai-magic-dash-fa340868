import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYMBOL_RE = /^[A-Z0-9.-]{1,16}$/;
const MAX_MESSAGES = 20;
const MAX_MSG_LEN = 4000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: u, error: ue } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (ue || !u.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const { messages, language = "tr", context_symbol } = body ?? {};

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
      return new Response(JSON.stringify({ error: "Geçersiz mesaj listesi" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const cleanMessages: Array<{ role: string; content: string }> = [];
    for (const m of messages) {
      if (!m || typeof m !== "object") return new Response(JSON.stringify({ error: "Geçersiz mesaj" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const role = m.role;
      const content = m.content;
      if (role !== "user" && role !== "assistant" && role !== "system") {
        return new Response(JSON.stringify({ error: "Geçersiz rol" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (typeof content !== "string" || content.length === 0 || content.length > MAX_MSG_LEN) {
        return new Response(JSON.stringify({ error: "Mesaj uzunluğu sınır dışı" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      cleanMessages.push({ role, content });
    }

    let safeSymbol: string | undefined;
    if (context_symbol != null) {
      if (typeof context_symbol !== "string" || !SYMBOL_RE.test(context_symbol)) {
        return new Response(JSON.stringify({ error: "Geçersiz sembol" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      safeSymbol = context_symbol;
    }
    const lang = language === "en" ? "en" : "tr";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("ai-chat: LOVABLE_API_KEY missing");
      return new Response(JSON.stringify({ error: "Servis geçici olarak kullanılamıyor" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sys = lang === "tr"
      ? `Sen yardımcı bir finans/yatırım asistanısın. Net, kısa cevaplar ver. Markdown kullan. ${safeSymbol ? `Aktif sembol: ${safeSymbol}.` : ""} Yatırım tavsiyesi vermediğini hatırlat.`
      : `You are a helpful financial assistant. Be clear and concise. Use markdown. ${safeSymbol ? `Active symbol: ${safeSymbol}.` : ""} Remind users this is not investment advice.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
