// Admin tarafından bir kullanıcının real_balance'ına manuel kredi yükleme/düşme
// Sadece 'admin' rolü erişebilir. Her işlem real_balance_ledger'a yazılır.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const authHdr = req.headers.get("Authorization") ?? "";
  const token = authHdr.startsWith("Bearer ") ? authHdr.slice(7) : "";
  const { data: userRes } = await admin.auth.getUser(token);
  const caller = userRes?.user;
  if (!caller) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Yasak — sadece yönetici" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rlResponse = await rateLimit(caller.id, "blitz-admin-topup");
  if (rlResponse) return rlResponse;

  let body: { user_id?: string; amount?: number; reason?: string };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Geçersiz veri" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { user_id, amount, reason } = body;
  if (!user_id || typeof amount !== "number" || !isFinite(amount) || amount === 0) {
    return new Response(JSON.stringify({ error: "user_id and non-zero numeric amount required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: prof, error: pErr } = await admin
    .from("profiles").select("real_balance, real_balance_locked")
    .eq("id", user_id).maybeSingle();
  if (pErr || !prof) {
    return new Response(JSON.stringify({ error: "Kullanıcı profili bulunamadı" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const newBalance = +(Number(prof.real_balance) + amount).toFixed(4);
  if (newBalance < Number(prof.real_balance_locked)) {
    return new Response(JSON.stringify({ error: "Bakiye kilitli fondan az olamaz" }), {
      status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (newBalance < 0) {
    return new Response(JSON.stringify({ error: "Bakiye negatif olamaz" }), {
      status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error: uErr } = await admin.from("profiles")
    .update({ real_balance: newBalance }).eq("id", user_id);
  if (uErr) {
    return new Response(JSON.stringify({ error: uErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await admin.from("real_balance_ledger").insert({
    user_id, granted_by: caller.id, amount, reason: reason ?? null,
  });

  return new Response(JSON.stringify({ ok: true, new_balance: newBalance }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
