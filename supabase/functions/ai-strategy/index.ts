// AI strateji önerileri - kullanıcının portföy dengesine göre
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { language = "tr" } = await req.json().catch(() => ({}));
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const sys = language === "tr"
      ? "Sen risk yönetimi uzmanısın. Verilen portföy dağılımına göre 3 somut, kısa ve aksiyona yönelik strateji önerisi ver. Markdown bullet liste, max 200 kelime. Sonda yatırım tavsiyesi değil notu ekle."
      : "You are a risk management expert. Given the portfolio allocation, give 3 concrete, short, actionable strategy suggestions. Markdown bullets, max 200 words. End with not-investment-advice note.";

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Portföy: ${JSON.stringify(ctx)}` },
        ],
      }),
    });

    if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: corsHeaders });
    if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: corsHeaders });
    if (!aiResp.ok) throw new Error("AI error");

    const data = await aiResp.json();
    return new Response(JSON.stringify({ suggestion: data.choices?.[0]?.message?.content ?? "" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-strategy error", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
