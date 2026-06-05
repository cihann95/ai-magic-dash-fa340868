// Proaktif risk uyarıları - tüm açık pozisyonları tarar, riskli durumlarda
// kullanıcılara bildirim gönderir. Cron her 15 dk'da bir çalıştırır.
// Aynı kullanıcıya aynı tip uyarı son 6 saatte gönderildiyse atlanır (spam önleme).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COOLDOWN_HOURS = 6;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth: accept service_role bearer OR a valid x-cron-secret (issued from pg_cron via Vault)
  const authHdr = req.headers.get("Authorization") ?? "";
  const cronToken = req.headers.get("x-cron-secret") ?? "";
  const isServiceRole = authHdr === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  let isCron = false;
  if (!isServiceRole && cronToken) {
    const { data: ok } = await admin.rpc("verify_cron_secret", { _token: cronToken });
    isCron = ok === true;
  }
  if (!isServiceRole && !isCron) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {

    // Tüm açık pozisyonlar
    const { data: positions } = await admin.from("positions").select("*");
    if (!positions || positions.length === 0) {
      return new Response(JSON.stringify({ success: true, alerts: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Kullanıcı bazında grupla
    const byUser: Record<string, any[]> = {};
    for (const p of positions) {
      (byUser[p.user_id] ||= []).push(p);
    }

    const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 3600 * 1000).toISOString();
    let alertsCreated = 0;

    for (const [userId, userPositions] of Object.entries(byUser)) {
      // Son uyarıları çek (cooldown için)
      const { data: recent } = await admin.from("notifications")
        .select("metadata, type, created_at")
        .eq("user_id", userId)
        .eq("type", "ai_signal")
        .gte("created_at", cutoff);

      const sentSignals = new Set<string>();
      for (const r of recent ?? []) {
        const sig = (r.metadata as any)?.signal;
        if (sig) sentSignals.add(sig);
      }

      // Toplam pozisyon değeri
      const totalValue = userPositions.reduce((a, p) => {
        const cur = Number(p.current_price ?? p.entry_price);
        return a + cur * Number(p.quantity);
      }, 0);

      // 1) Konsantrasyon riski: tek sembolde >50%
      for (const p of userPositions) {
        const cur = Number(p.current_price ?? p.entry_price);
        const v = cur * Number(p.quantity);
        const weight = totalValue > 0 ? v / totalValue : 0;
        if (weight > 0.5 && userPositions.length > 1) {
          const sig = `concentration:${p.symbol}`;
          if (!sentSignals.has(sig)) {
            await admin.from("notifications").insert({
              user_id: userId,
              type: "ai_signal",
              title: `⚠️ Konsantrasyon Riski: ${p.symbol}`,
              body: `Portföyünün %${(weight * 100).toFixed(0)}'i tek bir varlıkta. Çeşitlendirmeyi düşün.`,
              link: `/portfolio`,
              metadata: { signal: sig, symbol: p.symbol, weight },
            });
            alertsCreated++;
          }
        }

        // 2) Tek pozisyon -%10 veya daha kötü
        const entry = Number(p.entry_price);
        const pnlPct = p.side === "long"
          ? ((cur - entry) / entry) * 100
          : ((entry - cur) / entry) * 100;
        if (pnlPct <= -10) {
          const sig = `loss:${p.symbol}`;
          if (!sentSignals.has(sig)) {
            await admin.from("notifications").insert({
              user_id: userId,
              type: "ai_signal",
              title: `🛑 Stop-Loss Düşün: ${p.symbol}`,
              body: `Pozisyon %${pnlPct.toFixed(1)} zararda. Risk yönetimi için stop-loss değerlendir.`,
              link: `/portfolio`,
              metadata: { signal: sig, symbol: p.symbol, pnl_pct: pnlPct },
            });
            alertsCreated++;
          }
        }
      }

      // 3) Günlük P&L -%5 altında (toplam unrealized)
      const totalUnrealized = userPositions.reduce((a, p) => {
        const cur = Number(p.current_price ?? p.entry_price);
        const entry = Number(p.entry_price);
        const qty = Number(p.quantity);
        const pnl = p.side === "long" ? (cur - entry) * qty : (entry - cur) * qty;
        return a + pnl;
      }, 0);
      const totalCost = userPositions.reduce((a, p) =>
        a + Number(p.entry_price) * Number(p.quantity), 0);
      if (totalCost > 0) {
        const portfolioPct = (totalUnrealized / totalCost) * 100;
        if (portfolioPct <= -5) {
          const sig = `discipline`;
          if (!sentSignals.has(sig)) {
            await admin.from("notifications").insert({
              user_id: userId,
              type: "ai_signal",
              title: `🧘 Disiplin Uyarısı`,
              body: `Toplam pozisyon %${portfolioPct.toFixed(1)} zararda. Duygusal kararlardan kaçın.`,
              link: `/portfolio`,
              metadata: { signal: sig, portfolio_pct: portfolioPct },
            });
            alertsCreated++;
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true, users_scanned: Object.keys(byUser).length, alerts: alertsCreated,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-risk-monitor error", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
