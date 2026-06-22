// Günlük AI brifing üretir - kullanıcının açık pozisyonları, watchlist'i ve genel piyasa bağlamına göre.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let start = 0;
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Yetkisiz erişim", code: "UNAUTHORIZED" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData.user;
    if (!user) return new Response(JSON.stringify({ error: "Yetkisiz erişim", code: "UNAUTHORIZED" }), { status: 401, headers: corsHeaders });

    start = Date.now();

    const { language = "tr" } = await req.json().catch(() => ({}));
    const today = new Date().toISOString().slice(0, 10);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Bugünki brifing zaten var mı?
    const { data: existing } = await admin
      .from("daily_briefs").select("*").eq("user_id", user.id).eq("brief_date", today).maybeSingle();
    if (existing) {
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify(existing), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Kullanıcı bağlamı
    const [{ data: positions }, { data: watch }, { data: prices }] = await Promise.all([
      admin.from("positions").select("symbol,side,quantity,entry_price,current_price").eq("user_id", user.id),
      admin.from("watchlist").select("symbol").eq("user_id", user.id).limit(10),
      admin.from("price_cache").select("symbol,price,change_pct_24h").order("change_pct_24h", { ascending: false }).limit(20),
    ]);

    const ctx = {
      open_positions: positions ?? [],
      watchlist: (watch ?? []).map((w) => w.symbol),
      top_movers: prices ?? [],
      date: today,
    };

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("AI key missing");

    const sys = language === "tr"
      ? "Sen profesyonel bir piyasa analistisin. Markdown ile kısa (max 250 kelime), aksiyona yönelik bir günlük brifing yaz. Bölümler: 📊 Genel Piyasa | 💼 Pozisyonların | 👀 İzleme Listen | ⚡ Bugünün Aksiyonu. Yatırım tavsiyesi olmadığını sonda küçük punto ile belirt."
      : "You are a professional market analyst. Write a concise (max 250 words) actionable daily brief in markdown. Sections: 📊 Market Overview | 💼 Your Positions | 👀 Watchlist | ⚡ Today's Action. End with small disclaimer that this is not investment advice.";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
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
            { role: "user", content: `Context JSON:\n${JSON.stringify(ctx, null, 2)}\n\nLütfen ${language === "tr" ? "Türkçe" : "English"} brifingi oluştur.` },
          ],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (aiResp.status === 429) {
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify({ skipped: true, reason: "rate_limit", code: "RATE_LIMITED", retryable: true }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiResp.status === 402) {
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify({ skipped: true, reason: "credits", code: "QUOTA_EXCEEDED", retryable: false }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiResp.status >= 500) {
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify({ skipped: true, reason: "ai_error", code: "AI_UNAVAILABLE", retryable: true }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text(); console.error("AI gateway:", aiResp.status, t);
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify({ skipped: true, reason: "ai_error", code: `AI_${aiResp.status}`, retryable: false }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content ?? "Brief unavailable";

    // Sentiment - top mover ortalamasından
    const avgChange = (prices ?? []).reduce((a, p) => a + Number(p.change_pct_24h ?? 0), 0) / Math.max(1, prices?.length ?? 1);
    const sentiment = avgChange > 1 ? "bullish" : avgChange < -1 ? "bearish" : "neutral";

    const { data: brief } = await admin.from("daily_briefs").insert({
      user_id: user.id, brief_date: today, content, sentiment,
    }).select().single();

    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return new Response(JSON.stringify(brief), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const elapsed = Date.now() - start;
    if ((e as Error)?.name === "AbortError") {
      console.error(JSON.stringify({ event: "request", duration_ms: elapsed }));
      return new Response(JSON.stringify({ skipped: true, reason: "timeout", code: "AI_TIMEOUT", retryable: true }), {
        status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error(JSON.stringify({ event: "request", duration_ms: elapsed }));
    console.error("daily-brief error", e);
    return new Response(JSON.stringify({ error: "Sunucu hatası oluştu", code: "INTERNAL_ERROR" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
