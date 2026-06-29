// Audit Log Edge Function — records sensitive actions, admin query
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { rateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const start = Date.now();

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const authHdr = req.headers.get("Authorization") ?? "";
    const token = authHdr.startsWith("Bearer ") ? authHdr.slice(7) : "";
    const { data: userRes } = await admin.auth.getUser(token);
    const caller = userRes?.user;
    if (!caller) return json({ error: "Yetkisiz erişim", code: "UNAUTHORIZED" }, 401);

    const { data: hasRole } = await admin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!hasRole) return json({ error: "Yasak", code: "FORBIDDEN" }, 403);

    const rl = await rateLimit(caller.id, "audit-log");
    if (rl) return rl;

    const method = req.method;
    const url = new URL(req.url);

    if (method === "GET") {
      // Query params
      const userId = url.searchParams.get("user_id");
      const action = url.searchParams.get("action");
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
      const offset = parseInt(url.searchParams.get("offset") ?? "0");

      let query = admin.from("audit_logs").select("*", { count: "exact" });
      if (userId) query = query.eq("user_id", userId);
      if (action) query = query.eq("action", action);
      query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      const { data, count, error } = await query;
      if (error) throw error;

      console.log(JSON.stringify({ event: "audit_log_list", duration_ms: Date.now() - start }));
      return json({ data: data ?? [], total: count ?? 0, limit, offset });
    }

    if (method === "POST") {
      const body = await req.json();
      const { action, entity_type, entity_id, metadata } = body;
      if (!action) return json({ error: "action required", code: "VALIDATION_ERROR" }, 400);

      const { error } = await admin.from("audit_logs").insert({
        user_id: caller.id,
        action,
        entity_type,
        entity_id: entity_id?.toString(),
        metadata: metadata ?? {},
        ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
      });
      if (error) throw error;

      console.log(JSON.stringify({ event: "audit_log_write", action, duration_ms: Date.now() - start }));
      return json({ success: true });
    }

    return json({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405);
  } catch (e) {
    console.error("audit-log error", e);
    return json({ error: "Sunucu hatası", code: "INTERNAL_ERROR" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
