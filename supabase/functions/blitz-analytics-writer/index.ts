import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const cronToken = req.headers.get("x-cron-secret") ?? "";
  const authHdr = req.headers.get("Authorization") ?? "";
  const isServiceRole = authHdr === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  let isCron = false;
  if (!isServiceRole && cronToken) {
    const { data: ok } = await admin.rpc("verify_cron_secret", { _token: cronToken });
    isCron = ok === true;
  }
  if (!isServiceRole && !isCron) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { data: rows, error: fetchErr } = await admin
      .from("analytics_events_staging")
      .select("*")
      .eq("flushed", false)
      .order("created_at", { ascending: true })
      .limit(500);

    if (fetchErr) throw fetchErr;
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ flushed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inserts = rows.map((r: any) => ({
      event_type: r.event_type,
      room_id: r.room_id,
      user_id: r.user_id,
      payload: r.payload,
      server_timestamp: r.server_timestamp,
      created_at: r.created_at,
    }));

    const { error: insertErr } = await admin.from("analytics_events").insert(inserts);
    if (insertErr) throw insertErr;

    const ids = rows.map((r: any) => r.id);
    const { error: updateErr } = await admin
      .from("analytics_events_staging")
      .update({ flushed: true })
      .in("id", ids);
    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({ flushed: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    console.error("analytics-writer error", e);
    return new Response(JSON.stringify({ error: "Internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
