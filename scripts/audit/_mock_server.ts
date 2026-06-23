#!/usr/bin/env -S deno run -A
// Mock server for Hard Technical Audit crash-tests.
// Simulates:
//   - Supabase Auth REST API  (user create/delete, sign-in, generate-link)
//   - Supabase Data REST API  (profiles, rooms, participants, orders, RPC)
//   - Supabase Edge Functions (blitz-matchmake, blitz-tick-order)
//   - Upstash Redis REST API  (DBSIZE, SET, SETNX, GET, DEL, …)
//
// Usage:  deno run -A scripts/audit/_mock_server.ts
// Prints PORT=<port> to stdout once ready, then blocks.

const PORT = Number(Deno.args[0] || 0) || 3547;
const HOST = "0.0.0.0";

// ─── In-memory state ──────────────────────────────────────────────────────────

const users = new Map<string, { id: string; email: string; password: string }>();
const profiles = new Map<string, { real_balance: number }>();
const rooms = new Map<string, Record<string, unknown>>();
const participants = new Map<string, string[]>(); // room_id → user_ids
const orders: Record<string, unknown>[] = [];
let orderIdCounter = 0;

// In-memory Redis (Upstash mock)
const redisStore = new Map<string, { value: string; ttl: number | null }>();
const redisExpiry = new Map<string, number>(); // key → expiry timestamp

// Idempotency store + in-flight set for parallel-safe dedup
// Synchronous flag set before any yield point ensures single-threaded atomicity.
const idempotencyStore = new Map<string, { status: number; body: string }>();
const idempotencyInflight = new Set<string>();

let nextUserId = 1;

function uid() {
  return `mock-user-${nextUserId++}`;
}

function cleanExpiredRedis() {
  const now = Date.now();
  for (const [k, expiry] of redisExpiry) {
    if (expiry <= now) {
      redisStore.delete(k);
      redisExpiry.delete(k);
    }
  }
}

function redisSet(key: string, value: string, ttlSec?: number) {
  cleanExpiredRedis();
  redisStore.set(key, { value, ttl: ttlSec ?? null });
  if (ttlSec) redisExpiry.set(key, Date.now() + ttlSec * 1000);
}

function redisGet(key: string): string | null {
  cleanExpiredRedis();
  const e = redisStore.get(key);
  return e ? e.value : null;
}

function redisSetNx(key: string, value: string, ttlSec: number): boolean {
  cleanExpiredRedis();
  if (redisStore.has(key)) return false;
  redisStore.set(key, { value, ttl: ttlSec });
  redisExpiry.set(key, Date.now() + ttlSec * 1000);
  return true;
}

function redisDel(...keys: string[]) {
  cleanExpiredRedis();
  let n = 0;
  for (const k of keys) {
    if (redisStore.delete(k)) { redisExpiry.delete(k); n++; }
  }
  return n;
}

function redisDbsize(): number {
  cleanExpiredRedis();
  return redisStore.size;
}

// ─── Edge function response builders ──────────────────────────────────────────

async function handleTickOrder(body: Record<string, unknown>, headers: Headers): Promise<Response> {
  // 1. Body injection check (forbidden fields)
  const forbidden = ["entry_price", "price", "timestamp", "client_time"];
  for (const f of forbidden) {
    if (body[f] !== undefined) {
      return new Response(JSON.stringify({ error: `forbidden field: ${f}` }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
  }

  // 2. Stale-time check
  const clientSentAt = headers.get("x-client-sent-at");
  if (clientSentAt) {
    const drift = Date.now() - Number(clientSentAt);
    if (drift > 150) {
      return new Response(JSON.stringify({ error: "stale timestamp", drift_ms: drift }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }
  }

  // 3. Idempotency check (synchronous flag — single-threaded atomic)
  const idemKey = headers.get("idempotency-key");
  if (idemKey) {
    const keyExists = idempotencyStore.has(idemKey);
    console.warn(`[mock-tick] idemKey=${idemKey?.slice(0,8)} inFlight=${idempotencyInflight.has(idemKey)} stored=${keyExists}`);
    if (idempotencyInflight.has(idemKey) || keyExists) {
      const cached = idempotencyStore.get(idemKey);
      console.warn(`[mock-tick] idemKey=${idemKey?.slice(0,8)} → 409 (duplicate)`);
      return new Response(
        cached ? cached.body : JSON.stringify({ error: "duplicate", key: idemKey }),
        {
          status: 409, // always 409 for duplicates regardless of cached status
          headers: { "content-type": "application/json", "x-idempotent-replay": "true" },
        },
      );
    }
    idempotencyInflight.add(idemKey);
    const respBody = JSON.stringify({ id: `order-${++orderIdCounter}`, status: "pending" });
    idempotencyStore.set(idemKey, { status: 200, body: respBody });
    console.warn(`[mock-tick] idemKey=${idemKey?.slice(0,8)} → 200 (first)`);
    return new Response(respBody, { status: 200, headers: { "content-type": "application/json" } });
  }

  // 4. Normal order
  const order = { id: `order-${++orderIdCounter}`, ...body, created_at: new Date().toISOString() };
  orders.push(order);
  return new Response(JSON.stringify({ id: order.id, status: "pending" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function handleMatchmake(_body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ success: true, mode: "cancel" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// ─── HTTP Router ──────────────────────────────────────────────────────────────

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (path === "/" && method === "GET") {
    return new Response("ok", { status: 200 });
  }

  const bodyText = await req.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(bodyText); } catch { /* ignore */ }

  // ── Upstash Redis REST ──────────────────────────────────────────────────
  // POST to any path with JSON array commands: ["DBSIZE"], ["SET", "k", "v"], etc.
  if (Array.isArray(body) && typeof body[0] === "string") {
    const cmd = body[0].toUpperCase();
    const args = body.slice(1).map(String);

    cleanExpiredRedis();

    switch (cmd) {
      case "DBSIZE":
        return Response.json({ result: redisDbsize() });
      case "GET":
        return Response.json({ result: redisGet(args[0]) });
      case "DEL":
        return Response.json({ result: redisDel(...args) });
      case "SETNX": // converted by @upstash/redis to SET with NX
      case "SET": {
        // @upstash/redis sends: ["SET", key, value, "NX", "EX", ttl]
        const key = args[0];
        const value = args[1];
        let nx = false;
        let ex = 0;
        for (let i = 2; i < args.length; i++) {
          if (args[i] === "NX") nx = true;
          if (args[i] === "EX") ex = Number(args[i + 1]);
        }
        if (nx) {
          const ok = redisSetNx(key, value, ex || 30);
          return Response.json({ result: ok ? "OK" : null });
        }
        redisSet(key, value, ex || undefined);
        return Response.json({ result: "OK" });
      }
      case "EXPIRE":
        return Response.json({ result: 1 });
      default:
        return Response.json({ result: null });
    }
  }

  // ── Supabase Auth API ────────────────────────────────────────────────────
  if (path === "/auth/v1/admin/users" && method === "POST") {
    const id = uid();
    const email = body.email as string || `mock-${id}@test.test`;
    users.set(id, { id, email, password: body.password as string || "pass" });
    profiles.set(id, { real_balance: 0 });
    return Response.json({
      id,
      email,
      aud: "authenticated",
      role: "authenticated",
      confirmed_at: new Date().toISOString(),
    }, { status: 200, headers: { "content-type": "application/json" } });
  }

  // User update (password change via admin)
  const userUpdateMatch = path.match(/^\/auth\/v1\/admin\/users\/(.+)/);
  if (userUpdateMatch && method === "PATCH") {
    const uid_ = userUpdateMatch[1];
    const existing = users.get(uid_);
    if (existing) {
      if (body.password) existing.password = body.password as string;
      if (body.email) existing.email = body.email as string;
    }
    return Response.json({ id: uid_, ...(existing || {}) }, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  // User deletion
  const userDeleteMatch = path.match(/^\/auth\/v1\/admin\/users\/(.+)/);
  if (userDeleteMatch && method === "DELETE") {
    users.delete(userDeleteMatch[1]);
    profiles.delete(userDeleteMatch[1]);
    return Response.json({}, { status: 200 });
  }

  // Auth token (sign-in with password)
  if (path === "/auth/v1/token" && method === "POST") {
    const email = body.email as string;
    const pwd = body.password as string;
    for (const [, u] of users) {
      if (u.email === email && u.password === pwd) {
        return Response.json({
          access_token: `mock-jwt-${u.id}`,
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "mock-refresh",
          user: { id: u.id, email: u.email, aud: "authenticated", role: "authenticated" },
        }, { status: 200, headers: { "content-type": "application/json" } });
      }
    }
    console.warn(`[mock] token endpoint: no match for email=${email} pwd=${pwd?.slice(0,8)}...`);
    console.warn(`[mock] token endpoint: users count=${users.size}`);
    // Fallback: create user on the fly if not found
    const id = uid();
    users.set(id, { id, email: email || "anon@test.test", password: pwd || "pass" });
    profiles.set(id, { real_balance: 100 });
    return Response.json({
      access_token: `mock-jwt-${id}`,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "mock-refresh",
      user: { id, email, aud: "authenticated", role: "authenticated" },
    }, { status: 200, headers: { "content-type": "application/json" } });
  }

  // Admin generate link
  if (path === "/auth/v1/admin/generate_link" && method === "POST") {
    return Response.json({
      id: uid(),
      properties: { hashed_token: "mock-hashed-token", action_link: "mock-link" },
    }, { status: 200, headers: { "content-type": "application/json" } });
  }

  // Logout (POST /auth/v1/logout)
  if (path === "/auth/v1/logout" && method === "POST") {
    return Response.json({}, { status: 200 });
  }

  // ── Supabase Data REST API ───────────────────────────────────────────────
  // Profiles
  if (path === "/rest/v1/profiles" && method === "PATCH") {
    const id = url.searchParams.get("id")?.replace(/^eq\./, "");
    if (id && profiles.has(id)) {
      const p = profiles.get(id)!;
      if (typeof body.real_balance === "number") p.real_balance = body.real_balance;
    }
    return Response.json({}, { status: 200 });
  }
  if (path === "/rest/v1/profiles" && method === "GET") {
    const id = url.searchParams.get("id")?.replace(/^eq\./, "");
    const displayName = url.searchParams.get("display_name")?.replace(/^eq\./, "");
    if (id && profiles.has(id)) {
      return Response.json([{ id, ...profiles.get(id), display_name: id }], { status: 200 });
    }
    // search by display_name
    if (displayName) {
      for (const [uid, u] of users) {
        if (u.email.startsWith(displayName)) {
          return Response.json([{ id: uid, ...(profiles.get(uid) || { real_balance: 0 }), display_name: displayName }], { status: 200 });
        }
      }
    }
    return Response.json([], { status: 200 });
  }

  // Upsert (used for price_cache)
  if (path === "/rest/v1/price_cache" && method === "POST") {
    return Response.json([{ symbol: body.symbol, price: body.price }], { status: 201, headers: { "content-type": "application/json" } });
  }

  // Rooms
  if (path === "/rest/v1/blitz_rooms" && method === "POST") {
    const id = `room-${rooms.size + 1}`;
    const room = { id, ...body, created_at: new Date().toISOString() } as Record<string, unknown>;
    rooms.set(id, room);
    return Response.json([room], { status: 201, headers: { "content-type": "application/json" } });
  }
  if (path === "/rest/v1/blitz_rooms" && method === "DELETE") {
    const id = url.searchParams.get("id")?.replace(/^eq\./, "");
    if (id) rooms.delete(id);
    return Response.json([], { status: 200 });
  }

  // Participants
  if (path === "/rest/v1/blitz_participants" && method === "POST") {
    const roomId = body.room_id as string;
    const userId = body.user_id as string;
    if (!participants.has(roomId)) participants.set(roomId, []);
    participants.get(roomId)!.push(userId);
    return Response.json([{ room_id: roomId, user_id: userId }], { status: 201 });
  }
  if (path === "/rest/v1/blitz_participants" && method === "DELETE") {
    const roomId = url.searchParams.get("room_id")?.replace(/^eq\./, "");
    if (roomId) participants.delete(roomId);
    return Response.json([], { status: 200 });
  }

  // Orders
  if (path === "/rest/v1/blitz_orders" && method === "GET") {
    const roomId = url.searchParams.get("room_id")?.replace(/^eq\./, "");
    const filtered = roomId ? orders.filter((o: Record<string, unknown>) => o.room_id === roomId) : orders;
    return Response.json(filtered, { status: 200, headers: { "content-type": "application/json" } });
  }
  if (path === "/rest/v1/blitz_orders" && method === "DELETE") {
    const roomId = url.searchParams.get("room_id")?.replace(/^eq\./, "");
    if (roomId) {
      for (let i = orders.length - 1; i >= 0; i--) {
        if ((orders[i] as Record<string, unknown>).room_id === roomId) orders.splice(i, 1);
      }
    }
    return Response.json([], { status: 200 });
  }

  // RPC
  if (path.startsWith("/rest/v1/rpc/") && method === "POST") {
    // pg_stat_database_deadlocks
    return Response.json({ deadlocks: 0 }, { status: 200, headers: { "content-type": "application/json" } });
  }

  // ── Supabase Edge Functions ──────────────────────────────────────────────
  if (path === "/functions/v1/blitz-tick-order" && method === "POST") {
    return handleTickOrder(body, req.headers);
  }
  if (path === "/functions/v1/blitz-matchmake" && method === "POST") {
    return handleMatchmake(body);
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  console.warn(`[mock] unhandled: ${method} ${path}`);
  return new Response(JSON.stringify({ error: "not mocked", path }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

const BASE_PORT = PORT;
// Try to bind; if port taken, try next
let server: Deno.HttpServer | null = null;
for (let port = BASE_PORT; port < BASE_PORT + 100; port++) {
  try {
    server = Deno.serve({ hostname: HOST, port }, handler);
    console.log(`PORT=${port}`);
    break;
  } catch (e) {
    if (e instanceof Deno.errors.AddrInUse) continue;
    throw e;
  }
}

if (!server) {
  console.error("[mock] could not bind any port");
  Deno.exit(1);
}

// Keep alive until SIGTERM/SIGINT
await new Promise<void>((resolve) => {
  const onSignal = () => {
    server!.shutdown();
    resolve();
  };
  Deno.addSignalListener("SIGTERM", onSignal);
  Deno.addSignalListener("SIGINT", onSignal);
});
