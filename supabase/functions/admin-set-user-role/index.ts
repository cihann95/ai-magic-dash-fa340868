// Admin tarafından kullanıcı rolü değiştirme (admin/user)
// Sadece 'admin' rolü erişebilir. UPSERT user_roles.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

// Inline Zod-like validation (edge function runtime)
const VALID_ROLES = ["admin", "user"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

function validateBody(body: unknown): { user_id: string; role: ValidRole } | string {
  if (!body || typeof body !== "object") return "Geçersiz veri";
  const { user_id, role } = body as Record<string, unknown>;
  if (!user_id || typeof user_id !== "string") return "user_id gerekli (string)";
  if (!role || typeof role !== "string" || !VALID_ROLES.includes(role as ValidRole)) {
    return `role gerekli: 'admin' veya 'user' olmalı`;
  }
  return { user_id, role: role as ValidRole };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth check
  const authHdr = req.headers.get("Authorization") ?? "";
  const token = authHdr.startsWith("Bearer ") ? authHdr.slice(7) : "";
  const { data: userRes } = await admin.auth.getUser(token);
  const caller = userRes?.user;
  if (!caller) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Admin check
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Yasak — sadece yönetici" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rate limit: 5/dk
  const rlResponse = await rateLimit(caller.id, "admin-set-user-role");
  if (rlResponse) return rlResponse;

  // Parse + validate body
  let body: unknown;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Geçersiz JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const validated = validateBody(body);
  if (typeof validated === "string") {
    return new Response(JSON.stringify({ error: validated }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { user_id, role } = validated;

  // Verify target user exists in profiles
  const { data: targetProfile, error: profErr } = await admin
    .from("profiles").select("id").eq("id", user_id).maybeSingle();

  if (profErr || !targetProfile) {
    return new Response(JSON.stringify({ error: "Kullanıcı bulunamadı" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await admin.from("user_roles").delete().eq("user_id", user_id);

  const { error: insertErr } = await admin
    .from("user_roles")
    .insert({ user_id, role });

  if (insertErr) {
    return new Response(JSON.stringify({ error: insertErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, user_id, role }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
