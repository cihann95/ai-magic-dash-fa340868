import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rlResponse = await rateLimit(user.id, "reset-demo-account");
    if (rlResponse) return rlResponse;

    const start = Date.now();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin, demo_balance")
      .eq("id", user.id)
      .single();

    if (!profile || profile.is_admin !== true) {
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify({ error: "Bu işlem için yetkiniz yok", code: "NOT_ADMIN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.demo_balance === 100000) {
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify({ success: true, changes: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("positions").delete().eq("user_id", user.id);
    await admin.from("orders").update({ status: "cancelled" }).eq("user_id", user.id).eq("status", "open");
    const { error } = await admin
      .from("profiles")
      .update({ demo_balance: 100000, initial_balance: 100000 })
      .eq("id", user.id);

    if (error) throw error;

    await admin.from("analytics_events_staging").insert({
      event_type: "demo_reset",
      user_id: user.id,
      payload: { demo_balance: 100000 },
    });

    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Sunucu hatası oluştu" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});