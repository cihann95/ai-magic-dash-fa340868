const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, language = "tr", context_symbol } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY yapılandırılmamış");

    const sys = language === "tr"
      ? `Sen yardımcı bir finans/yatırım asistanısın. Net, kısa cevaplar ver. Markdown kullan. ${context_symbol ? `Aktif sembol: ${context_symbol}.` : ""} Yatırım tavsiyesi vermediğini hatırlat.`
      : `You are a helpful financial assistant. Be clear and concise. Use markdown. ${context_symbol ? `Active symbol: ${context_symbol}.` : ""} Remind users this is not investment advice.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, ...messages],
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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
