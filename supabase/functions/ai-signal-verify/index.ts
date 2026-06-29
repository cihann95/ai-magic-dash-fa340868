// AI Signal Verifier — cron job: checks unverified signals after 24h
// Runs every 30 minutes via pg_cron. Idempotent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth: service_role or x-cron-secret
  const authHdr = req.headers.get("Authorization") ?? "";
  const cronToken = req.headers.get("x-cron-secret") ?? "";
  const isServiceRole = authHdr === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  let isCron = false;
  if (!isServiceRole && cronToken) {
    const { data: ok } = await admin.rpc("verify_cron_secret", { _token: cronToken });
    isCron = ok === true;
  }
  if (!isServiceRole && !isCron) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const start = Date.now();
  try {
    // Find signals >24h old that aren't verified yet
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: signals, error: fetchErr } = await admin
      .from("ai_signal_history")
      .select("*")
      .eq("verified", false)
      .lte("created_at", cutoff)
      .limit(50);

    if (fetchErr) throw fetchErr;
    if (!signals || signals.length === 0) {
      return new Response(JSON.stringify({ success: true, verified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get current prices via price_cache
    const symbols = [...new Set(signals.map((s: any) => s.symbol))];
    const { data: prices } = await admin
      .from("price_cache")
      .select("symbol, price")
      .in("symbol", symbols);

    const priceMap: Record<string, number> = {};
    for (const p of prices ?? []) {
      priceMap[p.symbol] = Number(p.price);
    }

    let verified = 0;
    for (const sig of signals as any[]) {
      const currentPrice = priceMap[sig.symbol];
      if (!currentPrice) continue;

      const entryPrice = Number(sig.price_at_signal);
      const change = ((currentPrice - entryPrice) / entryPrice) * 100;

      // Determine if signal was correct
      let wasCorrect = false;
      if (sig.predicted_direction === "up" && change > 0.5) wasCorrect = true;
      else if (sig.predicted_direction === "down" && change < -0.5) wasCorrect = true;
      else if (sig.predicted_direction === "neutral" && Math.abs(change) <= 0.5) wasCorrect = true;

      await admin.from("ai_signal_history").update({
        verified: true,
        verified_at: new Date().toISOString(),
        price_after_24h: currentPrice,
        was_correct: wasCorrect,
      }).eq("id", sig.id);

      verified++;
    }

    console.error(JSON.stringify({ event: "signal_verify", duration_ms: Date.now() - start, verified }));
    return new Response(JSON.stringify({ success: true, verified }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-signal-verify error", e);
    return new Response(JSON.stringify({ error: "Sunucu hatası", code: "INTERNAL_ERROR" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
