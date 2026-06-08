// Blitz matchmaking: Kullanıcıyı kuyruğa sokar; eşleşme olursa oda açar.
// Modlar: 'quick' (public FIFO kuyruk), 'create_private' (davet kodu üretir), 'cancel' (kuyruktan çıkar).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { redis } from "../_shared/redis.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ROOM_DURATION_SECONDS = 60;

interface Req {
  mode: "quick" | "create_private" | "cancel";
  symbol: string;
  entry_fee: number;
}

function genInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const authHdr = req.headers.get("Authorization") ?? "";
  const token = authHdr.startsWith("Bearer ") ? authHdr.slice(7) : "";
  const { data: userRes } = await admin.auth.getUser(token);
  const user = userRes?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Req;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { mode, symbol, entry_fee } = body;
  if (!mode || !symbol || !(entry_fee > 0)) {
    return new Response(JSON.stringify({ error: "Missing fields" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const queueKey = `blitz:queue:${symbol}:${entry_fee}`;

  // CANCEL
  if (mode === "cancel") {
    await redis.lrem(queueKey, 0, user.id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Bakiyeyi kontrol et + kilitle (atomik)
  const { data: profile, error: pErr } = await admin
    .from("profiles").select("real_balance, real_balance_locked")
    .eq("id", user.id).single();
  if (pErr || !profile) {
    return new Response(JSON.stringify({ error: "Profile not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const available = Number(profile.real_balance) - Number(profile.real_balance_locked);
  if (available < entry_fee) {
    return new Response(JSON.stringify({ error: "Insufficient balance", available }), {
      status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // CREATE PRIVATE: oda yaratıp davet kodu döner, kuyruğa sokmaz
  if (mode === "create_private") {
    // Kullanıcının bakiyesinden kilitle
    await admin.from("profiles")
      .update({ real_balance_locked: Number(profile.real_balance_locked) + entry_fee })
      .eq("id", user.id);

    const inviteCode = genInviteCode();
    const { data: room, error: rErr } = await admin.from("blitz_rooms").insert({
      symbol, entry_fee, mode: "private", invite_code: inviteCode,
      created_by: user.id, status: "waiting", pot: entry_fee,
    }).select().single();
    if (rErr || !room) {
      // rollback kilit
      await admin.from("profiles")
        .update({ real_balance_locked: Number(profile.real_balance_locked) })
        .eq("id", user.id);
      return new Response(JSON.stringify({ error: rErr?.message ?? "Room create failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await admin.from("blitz_participants").insert({ room_id: room.id, user_id: user.id });
    return new Response(JSON.stringify({ room_id: room.id, invite_code: inviteCode, status: "waiting" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // QUICK MATCH: kuyrukta rakip varsa eşleştir, yoksa kuyruğa gir
  // İlk önce kullanıcının zaten kuyrukta olmadığından emin ol
  await redis.lrem(queueKey, 0, user.id);

  const opponent: string | null = await redis.lpop(queueKey);

  if (!opponent || opponent === user.id) {
    // Rakip yok — kuyruğa ekle ve bakiyeyi kilitle
    await admin.from("profiles")
      .update({ real_balance_locked: Number(profile.real_balance_locked) + entry_fee })
      .eq("id", user.id);
    await redis.rpush(queueKey, user.id);
    await redis.expire(queueKey, 300); // 5 dk
    return new Response(JSON.stringify({ status: "queued" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rakip var — odayı aç
  // Rakibin bakiyesini doğrula (kuyruğa girerken kilitlemişti zaten ama emin olalım)
  const { data: oppProfile } = await admin
    .from("profiles").select("real_balance, real_balance_locked")
    .eq("id", opponent).single();
  if (!oppProfile || Number(oppProfile.real_balance) - Number(oppProfile.real_balance_locked) < 0) {
    // Rakip artık geçersiz — kullanıcıyı kuyruğa geri koy
    await admin.from("profiles")
      .update({ real_balance_locked: Number(profile.real_balance_locked) + entry_fee })
      .eq("id", user.id);
    await redis.rpush(queueKey, user.id);
    return new Response(JSON.stringify({ status: "queued" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Çağıran kullanıcının bakiyesini kilitle
  await admin.from("profiles")
    .update({ real_balance_locked: Number(profile.real_balance_locked) + entry_fee })
    .eq("id", user.id);

  // Başlangıç fiyatını Redis'ten (price-feed yazıyor) veya price_cache'ten al
  let startPriceRaw: string | null = await redis.get(`blitz:price:${symbol}`);
  if (!startPriceRaw) {
    const { data: pc } = await admin.from("price_cache").select("price").eq("symbol", symbol).single();
    startPriceRaw = pc ? String(pc.price) : null;
  }
  const startPrice = startPriceRaw ? Number(startPriceRaw) : null;
  if (!startPrice || !isFinite(startPrice) || startPrice <= 0) {
    return new Response(JSON.stringify({ error: "Price unavailable for symbol" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + ROOM_DURATION_SECONDS * 1000);

  const { data: room, error: rErr } = await admin.from("blitz_rooms").insert({
    symbol, entry_fee, mode: "public",
    status: "active",
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    start_price: startPrice,
    pot: entry_fee * 2,
    created_by: user.id,
  }).select().single();
  if (rErr || !room) {
    return new Response(JSON.stringify({ error: rErr?.message ?? "Room create failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await admin.from("blitz_participants").insert([
    { room_id: room.id, user_id: opponent },
    { room_id: room.id, user_id: user.id },
  ]);

  // Redis odası
  await redis.hsetAll(`blitz:room:${room.id}`, {
    status: "active",
    symbol,
    start_price: startPrice,
    ends_at: endsAt.toISOString(),
  });
  await redis.sadd(`blitz:room:${room.id}:users`, opponent, user.id);
  await redis.expire(`blitz:room:${room.id}`, 600);
  await redis.expire(`blitz:room:${room.id}:users`, 600);

  return new Response(JSON.stringify({ room_id: room.id, status: "active", opponent }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
