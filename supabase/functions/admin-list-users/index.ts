// Admin tarafından tüm kullanıcıları listeleme + arama
// Sadece 'admin' rolü erişebilir. service_role ile RLS bypass.
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

  // Rate limit: 10/dk
  const rlResponse = await rateLimit(caller.id, "admin-list-users");
  if (rlResponse) return rlResponse;

  // Query params
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? "";
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  const roleFilter = url.searchParams.get("role") ?? "";
  const statusFilter = url.searchParams.get("status") ?? "";

  let query = admin
    .from("profiles")
    .select("id, display_name, avatar_url, demo_balance, real_balance, real_balance_locked, created_at", { count: "exact" });

  if (search) {
    const { data: matchingProfiles } = await admin
      .from("public_profiles")
      .select("user_id")
      .ilike("username", `%${search}%`);

    const usernameIds = (matchingProfiles ?? []).map((p: { user_id: string }) => p.user_id);
    const orParts = [`display_name.ilike.%${search}%`, `id.eq.${search}`];
    if (usernameIds.length > 0) {
      orParts.push(`id.in.(${usernameIds.join(",")})`);
    }
    query = query.or(orParts.join(","));
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data: profiles, error, count } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!profiles || profiles.length === 0) {
    return new Response(JSON.stringify({ users: [], total: count ?? 0, limit, offset }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userIds = profiles.map((p: { id: string }) => p.id);

  const [rolesResult, publicProfilesResult] = await Promise.all([
    admin.from("user_roles").select("user_id, role").in("user_id", userIds),
    admin.from("public_profiles").select("user_id, username, is_active").in("user_id", userIds),
  ]);

  const rolesMap = new Map<string, string>();
  for (const r of rolesResult.data ?? []) {
    rolesMap.set(r.user_id, r.role);
  }

  const publicMap = new Map<string, { username: string | null; is_active: boolean | null }>();
  for (const pu of publicProfilesResult.data ?? []) {
    publicMap.set(pu.user_id, { username: pu.username, is_active: pu.is_active });
  }

  let users = profiles.map((p: Record<string, unknown>) => {
    const pub = publicMap.get(p.id as string);
    const role = rolesMap.get(p.id as string) ?? null;
    const username = pub?.username ?? null;
    const is_active = pub?.is_active ?? null;

    if (statusFilter === "active" && is_active !== true) return null;
    if (statusFilter === "banned" && is_active !== false) return null;
    if (roleFilter && role !== roleFilter) return null;

    return {
      id: p.id,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      demo_balance: p.demo_balance,
      real_balance: p.real_balance,
      real_balance_locked: p.real_balance_locked,
      created_at: p.created_at,
      role,
      username,
      is_active,
    };
  }).filter(Boolean);

  return new Response(JSON.stringify({
    users,
    total: count ?? users.length,
    limit,
    offset,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
