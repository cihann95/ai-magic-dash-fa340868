// Referral bonus edge function
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { rateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Yetkisiz erişim", code: "UNAUTHORIZED" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return new Response(JSON.stringify({ error: "Yetkisiz erişim", code: "UNAUTHORIZED" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const rl = await rateLimit(user.id, "referral-bonus");
    if (rl) return rl;

    const { referral_code } = await req.json().catch(() => ({}));
    if (!referral_code || typeof referral_code !== "string" || referral_code.length < 3) {
      return new Response(JSON.stringify({ error: "Geçersiz referans kodu", code: "VALIDATION_ERROR" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Find referrer
    const { data: referrer } = await admin.from("public_profiles").select("user_id").eq("referral_code", referral_code).maybeSingle();
    if (!referrer) {
      return new Response(JSON.stringify({ error: "Geçersiz referans kodu", code: "INVALID_CODE" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (referrer.user_id === user.id) {
      return new Response(JSON.stringify({ error: "Kendi kodunu kullanamazsın", code: "SELF_REFERRAL" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check already referred
    const { data: existing } = await admin.from("referrals").select("id").eq("referred_id", user.id).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: "Zaten kayıtlı referans", code: "ALREADY_REFERRED" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const BONUS = 50;

    // Create referral record
    const { error: refErr } = await admin.from("referrals").insert({
      referrer_id: referrer.user_id,
      referred_id: user.id,
      bonus_amount: BONUS,
      status: "completed",
      completed_at: new Date().toISOString(),
    });
    if (refErr) {
      console.error("Referral insert error", refErr);
      return new Response(JSON.stringify({ error: "Referans kaydı başarısız", code: "INSERT_FAILED" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Award bonus to both
    const { error: bonus1Err } = await admin.rpc("award_real_bonus", {
      _user_id: user.id,
      _amount: BONUS,
      _reason: `Referral bonus (${referral_code})`,
    });
    const { error: bonus2Err } = await admin.rpc("award_real_bonus", {
      _user_id: referrer.user_id,
      _amount: BONUS,
      _reason: `Referral bonus for referring ${user.id.slice(0, 8)}`,
    });

    if (bonus1Err || bonus2Err) {
      console.error("Bonus award error", bonus1Err, bonus2Err);
    }

    return new Response(JSON.stringify({
      success: true,
      bonus: BONUS,
      message: `$${BONUS} bonus added to both accounts!`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), code: "INTERNAL_ERROR" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
