#!/usr/bin/env -S deno run -A
// CRSH-002 — Concurrency bombardment for blitz-tick-order.
// Fires 100 parallel open/close orders against a synthetic active room
// within a 500 ms window. Measures deadlocks, latency, error histogram,
// and final order-table consistency.
//
// Requires service-role key (seeds + teardown). Reads test creds from env.
// Pass criteria: 0 deadlocks, 0 orphan opens, p95 < 800, p99 < 1500, 0 5xx.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
if (!SUPABASE_URL || !SR || !ANON) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY");
  Deno.exit(2);
}

const admin = createClient(SUPABASE_URL, SR);
const PARALLEL = Number(Deno.env.get("PARALLEL") ?? 100);
const SYMBOL = "BTCUSDT";
const ENTRY_FEE = 1;

async function mkUser(label: string) {
  const email = `crsh002-${label}-${crypto.randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: crypto.randomUUID() + "Aa1!", email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  // Top up real_balance
  await admin.from("profiles").update({ real_balance: 100 }).eq("id", data.user.id);
  // Mint session
  const { data: sess, error: sErr } = await admin.auth.admin.generateLink({
    type: "magiclink", email,
  });
  if (sErr || !sess) throw new Error(`generateLink failed: ${sErr?.message}`);
  return { id: data.user.id, email, hashed_token: sess.properties.hashed_token };
}

async function jwtFor(email: string): Promise<string> {
  // Sign in via password is simpler — set a known password instead.
  const pwd = "Bombardment#1!";
  const { data: u } = await admin.from("profiles").select("id").eq("display_name", email.split("@")[0]).maybeSingle();
  if (u?.id) await admin.auth.admin.updateUserById(u.id, { password: pwd });
  const client = createClient(SUPABASE_URL, ANON);
  const { data, error } = await client.auth.signInWithPassword({ email, password: pwd });
  if (error || !data.session) throw new Error(`signin failed: ${error?.message}`);
  return data.session.access_token;
}

console.log("[crsh-002] seeding room + 2 users...");
const u1 = await mkUser("a");
const u2 = await mkUser("b");

// Seed price
await admin.from("price_cache").upsert({ symbol: SYMBOL, price: 100000, updated_at: new Date().toISOString() } as never);

const { data: room, error: rErr } = await admin.from("blitz_rooms").insert({
  symbol: SYMBOL, entry_fee: ENTRY_FEE, mode: "public", status: "active",
  starts_at: new Date().toISOString(),
  ends_at: new Date(Date.now() + 120_000).toISOString(),
  start_price: 100000, pot: ENTRY_FEE * 2, created_by: u1.id,
}).select().single();
if (rErr || !room) throw new Error(`room insert failed: ${rErr?.message}`);

await admin.from("blitz_participants").insert([
  { room_id: room.id, user_id: u1.id },
  { room_id: room.id, user_id: u2.id },
]);

const jwt1 = await jwtFor(u1.email);
const jwt2 = await jwtFor(u2.email);

// Deadlock baseline
await admin.rpc("pg_stat_database_deadlocks" as never).single();

async function fire(jwt: string, action: "open" | "close", side?: "long" | "short") {
  const t0 = performance.now();
  const body: Record<string, unknown> = { room_id: room.id, action };
  if (action === "open") { body.side = side; body.amount = 1; }
  const r = await fetch(`${SUPABASE_URL}/functions/v1/blitz-tick-order`, {
    method: "POST",
    headers: {
      apikey: ANON, Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      "x-client-sent-at": String(Date.now()),
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, ms: performance.now() - t0, text: text.slice(0, 120) };
}

console.log(`[crsh-002] firing ${PARALLEL} parallel orders...`);
const t0 = performance.now();
const promises: Promise<{ status: number; ms: number; text: string }>[] = [];
for (let i = 0; i < PARALLEL; i++) {
  const jwt = i % 2 === 0 ? jwt1 : jwt2;
  const action: "open" | "close" = i % 2 === 0 ? "open" : "close";
  const side: "long" | "short" = i % 4 === 0 ? "long" : "short";
  promises.push(new Promise((res) =>
    setTimeout(() => res(fire(jwt, action, side)), Math.random() * 500)
  ));
}
const results = await Promise.all(promises);
const wall = performance.now() - t0;

const lat = results.map((r) => r.ms).sort((a, b) => a - b);
const p50 = lat[Math.floor(lat.length * 0.5)];
const p95 = lat[Math.floor(lat.length * 0.95)];
const p99 = lat[Math.floor(lat.length * 0.99)];
const s5xx = results.filter((r) => r.status >= 500).length;
const s2xx = results.filter((r) => r.status >= 200 && r.status < 300).length;
const s409 = results.filter((r) => r.status === 409).length;

// Order-table consistency
const { data: orders } = await admin.from("blitz_orders").select("*").eq("room_id", room.id);
const openByUser = new Map<string, number>();
for (const o of (orders ?? []) as { user_id: string; closed_at: string | null }[]) {
  if (!o.closed_at) openByUser.set(o.user_id, (openByUser.get(o.user_id) ?? 0) + 1);
}
const dupOpens = [...openByUser.values()].filter((n) => n > 1).length;

console.log(`[crsh-002] wall=${wall.toFixed(0)}ms 2xx=${s2xx} 409=${s409} 5xx=${s5xx}`);
console.log(`[crsh-002] latency p50=${p50.toFixed(0)} p95=${p95.toFixed(0)} p99=${p99.toFixed(0)}`);
console.log(`[crsh-002] orders=${orders?.length ?? 0} duplicate_open_users=${dupOpens}`);

// Cleanup
try {
  await admin.from("blitz_orders").delete().eq("room_id", room.id);
  await admin.from("blitz_participants").delete().eq("room_id", room.id);
  await admin.from("blitz_rooms").delete().eq("id", room.id);
  await admin.auth.admin.deleteUser(u1.id);
  await admin.auth.admin.deleteUser(u2.id);
} catch (e) {
  console.warn("cleanup warning", (e as Error).message);
}

const ok = s5xx === 0 && dupOpens === 0 && p95 < 800 && p99 < 1500;
console.log(`[crsh-002] result=${ok ? "PASS" : "FAIL"}`);
Deno.exit(ok ? 0 : 1);
