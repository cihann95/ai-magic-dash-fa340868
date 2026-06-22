// Admin tarafından tüm kullanıcıları listeleme + arama
// Sadece 'admin' rolü erişebilir. service_role ile RLS bypass.
// Uses auth.admin.listUsers() to get email + phone, then joins profiles.
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

  // Fetch all users from auth (paginated by Supabase; we fetch up to 200 for now)
  const { data: authList, error: authErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (authErr) {
    return new Response(JSON.stringify({ error: authErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const authUsers = authList?.users ?? [];

  // Fetch all profiles + roles + public_profiles in one go
  const [profilesRes, rolesRes, publicRes] = await Promise.all([
    admin.from("profiles").select("id, display_name, avatar_url, demo_balance, real_balance, real_balance_locked, is_banned, created_at"),
    admin.from("user_roles").select("user_id, role"),
    admin.from("public_profiles").select("user_id, username, is_active"),
  ]);

  const profilesMap = new Map<string, Record<string, unknown>>();
  for (const p of profilesRes.data ?? []) {
    profilesMap.set(p.id, p);
  }
  const rolesMap = new Map<string, string>();
  for (const r of rolesRes.data ?? []) {
    rolesMap.set(r.user_id, r.role);
  }
  const publicMap = new Map<string, { username: string | null; is_active: boolean | null }>();
  for (const pu of publicRes.data ?? []) {
    publicMap.set(pu.user_id, { username: pu.username, is_active: pu.is_active });
  }

  // Merge: use auth.users as canonical list (includes email), enrich with profile/role
  let merged = authUsers.map((u) => {
    const prof = profilesMap.get(u.id);
    const pub = publicMap.get(u.id);
    const role = rolesMap.get(u.id) ?? null;
    const username = pub?.username ?? null;
    const is_banned = prof?.is_banned ?? false;
    // Legacy compatibility: frontend expects is_active (true=active, false=banned)
    const is_active = !is_banned;

    return {
      id: u.id,
      email: u.email ?? null,
      phone: u.phone ?? null,
      display_name: prof?.display_name ?? null,
      avatar_url: prof?.avatar_url ?? null,
      demo_balance: prof?.demo_balance ?? null,
      real_balance: prof?.real_balance ?? null,
      real_balance_locked: prof?.real_balance_locked ?? null,
      is_banned,
      is_active,
      created_at: prof?.created_at ?? u.created_at,
      role,
      username,
      // search hay for arama
      _hay: [
        u.email ?? "",
        prof?.display_name ?? "",
        username ?? "",
        u.id,
      ].join(" ").toLowerCase(),
    };
  });

  // Apply search filter
  if (search) {
    const q = search.toLowerCase();
    merged = merged.filter((u) => u._hay.includes(q));
  }

  // Apply role filter
  if (roleFilter) {
    merged = merged.filter((u) => u.role === roleFilter);
  }

  // Apply status filter
  if (statusFilter === "active") {
    merged = merged.filter((u) => !u.is_banned && u.is_active !== false);
  } else if (statusFilter === "banned") {
    merged = merged.filter((u) => u.is_banned === true);
  }

  // Sort by created_at desc
  merged.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  const total = merged.length;
  const users = merged.slice(offset, offset + limit).map(({ _hay, ...rest }) => rest);

  return new Response(JSON.stringify({
    users,
    total,
    limit,
    offset,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
