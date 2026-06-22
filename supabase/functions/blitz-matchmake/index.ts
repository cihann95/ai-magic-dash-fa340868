// Blitz matchmaking: Kullanıcıyı kuyruğa sokar; eşleşme olursa oda açar.
// Modlar: 'quick' (public FIFO kuyruk), 'create_private' (davet kodu üretir), 'cancel' (kuyruktan çıkar).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { redis, redisEnabled } from "../_shared/redis.ts";
import { rateLimit } from "../_shared/rate-limit.ts";
import { checkBodySize } from "../_shared/body-size-limit.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const ROOM_DURATION_SECONDS = 60;

// How long a waiting room can exist before it's considered stale.
// Default: 300s (5 min). Set via WAITING_ROOM_TTL_SECONDS env var.
const WAITING_ROOM_TTL_SECONDS = Number(
  Deno.env.get("WAITING_ROOM_TTL_SECONDS") ?? "300",
);

interface Req {
  mode: "quick" | "create_private" | "cancel";
  symbol: string;
  entry_fee: number;
}

/**
 * Release locked balances for participants of stale waiting rooms AND stale queue entries.
 * Called inline on each matchmake request. The DB-side cron (cleanup_stale_rooms)
 * also runs every 5 min as a safety net but does NOT unlock balances.
 */
async function releaseStaleBalances(admin: ReturnType<typeof createClient>): Promise<void> {
  const cutoff = new Date(Date.now() - WAITING_ROOM_TTL_SECONDS * 1000).toISOString();
  const { data: staleRooms, error } = await admin
    .from("blitz_rooms")
    .select("id, symbol, entry_fee, created_by")
    .eq("status", "waiting")
    .lt("created_at", cutoff)
    .limit(20);

  if (error || !staleRooms?.length) return;

  for (const room of staleRooms) {
    // Find participants who locked balance for this room
    const { data: participants } = await admin
      .from("blitz_participants")
      .select("user_id")
      .eq("room_id", room.id);

    for (const p of participants ?? []) {
      // Release locked balance (unlock entry_fee)
      const { data: profile } = await admin
        .from("profiles")
        .select("real_balance_locked")
        .eq("id", p.user_id)
        .single();
      if (profile) {
        const newLocked = Math.max(0, Number(profile.real_balance_locked) - Number(room.entry_fee));
        await admin.from("profiles")
          .update({ real_balance_locked: newLocked })
          .eq("id", p.user_id);
      }
    }

    // Mark room as cancelled
    await admin.from("blitz_rooms")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", room.id);

    // Log for observability
    await admin.rpc("log_observability", {
      p_service: "blitz_matchmake",
      p_event: "waiting_room_timeout",
      p_level: "warn",
      p_room_id: room.id,
      p_metadata: {
        symbol: room.symbol,
        entry_fee: room.entry_fee,
        created_by: room.created_by,
        participant_count: participants?.length ?? 0,
        ttl_seconds: WAITING_ROOM_TTL_SECONDS,
      },
    }).catch((e: unknown) => console.warn("[blitz-matchmake] log stale room release failed", e));
  }

  if (redisEnabled) {
    const now = Date.now();
    const staleCutoff = now - WAITING_ROOM_TTL_SECONDS * 1000;
    try {
      const queueKeys = await redis.smembers("blitz:queue:keys");
      for (const queueKey of queueKeys ?? []) {
        const staleEntries = await redis.zrangebyscore(queueKey, 0, staleCutoff, { withScores: true }) as Array<{ score: number; member: string }>;
        if (staleEntries.length > 0) {
          const userIds = staleEntries.map((e) => e.member);
          await redis.zremrangebyscore(queueKey, 0, staleCutoff);
          for (const userId of userIds) {
            await redis.lrem(queueKey, 0, userId);
          }
          for (const userId of userIds) {
            const parts = queueKey.split(":");
            const entryFee = Number(parts[parts.length - 1]);
            const { data: profile } = await admin
              .from("profiles")
              .select("real_balance_locked")
              .eq("id", userId)
              .single();
            if (profile && Number(profile.real_balance_locked) >= entryFee) {
              await admin.from("profiles")
                .update({ real_balance_locked: Number(profile.real_balance_locked) - entryFee })
                .eq("id", userId)
                .eq("real_balance_locked", Number(profile.real_balance_locked));
            }
          }
          await admin.rpc("log_observability", {
            p_service: "blitz_matchmake",
            p_event: "queue_stale_cleanup",
            p_level: "warn",
            p_metadata: { queue_key: queueKey, cleaned_count: userIds.length, ttl_seconds: WAITING_ROOM_TTL_SECONDS },
          }).catch((e: unknown) => console.warn("[blitz-matchmake] log queue stale cleanup failed", e));
        }
      }
    } catch (e) {
      console.warn(JSON.stringify({ event: "redis_fail_open", op: "stale_queue_cleanup", error: String(e) }));
    }
  }
}

function genInviteCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase().slice(0, 8);
}

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
  const user = userRes?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const start = Date.now();

  const rlResponse = await rateLimit(user.id, "blitz-matchmake");
  if (rlResponse) return rlResponse;

  // Body size limit check
  const bodyError = await checkBodySize(req);
  if (bodyError) return bodyError;

  // Inline cleanup: release balances for stale waiting rooms
  await releaseStaleBalances(admin);

  let body: Req;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Geçersiz veri" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { mode, symbol, entry_fee } = body;
  if (!mode || !symbol || !(entry_fee > 0)) {
    return new Response(JSON.stringify({ error: "Eksik alanlar" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const queueKey = `blitz:queue:${symbol}:${entry_fee}`;

  // CANCEL
  if (mode === "cancel") {
    // Try to remove from Redis queue (best effort, fail-open)
    try {
      await redis.lrem(queueKey, 0, user.id);
    } catch (e) {
      console.warn(JSON.stringify({ event: "redis_fail_open", op: "lrem", queueKey, error: String(e) }));
    }

    // Unlock balance from DB (idempotent, conditional UPDATE for TOCTOU protection)
    // Only unlock if there's actually locked balance >= entry_fee
    const { data: profile } = await admin
      .from("profiles")
      .select("real_balance_locked")
      .eq("id", user.id)
      .single();
    if (profile && Number(profile.real_balance_locked) >= entry_fee) {
      await admin.from("profiles")
        .update({ real_balance_locked: Number(profile.real_balance_locked) - entry_fee })
        .eq("id", user.id)
        .eq("real_balance_locked", Number(profile.real_balance_locked));
    }

    // Clean up abandoned private waiting rooms (no participants)
    const { data: waitingRooms } = await admin
      .from("blitz_rooms")
      .select("id, symbol")
      .eq("created_by", user.id)
      .eq("status", "waiting")
      .eq("mode", "private")
      .limit(5);
    for (const wr of waitingRooms ?? []) {
      const { count } = await admin
        .from("blitz_participants")
        .select("*", { count: "exact", head: true })
        .eq("room_id", wr.id);
      if (!count) {
        await admin.from("analytics_events_staging").insert({
          event_type: "blitz_abandoned",
          room_id: wr.id,
          payload: { symbol: wr.symbol, reason: "no_participants" },
        }).catch((e: unknown) => console.warn("[blitz-matchmake] blitz_abandoned insert failed", e));
      }
    }

    console.warn(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Bakiyeyi kontrol et
  const { data: profile, error: pErr } = await admin
    .from("profiles").select("real_balance, real_balance_locked")
    .eq("id", user.id).single();
  if (pErr || !profile) {
    return new Response(JSON.stringify({ error: "Profil bulunamadı" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const available = Number(profile.real_balance) - Number(profile.real_balance_locked);
  if (available < entry_fee) {
    console.warn(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return new Response(JSON.stringify({ error: "Yetersiz bakiye", code: "INSUFFICIENT_BALANCE", available }), {
      status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // CREATE PRIVATE: oda yaratıp davet kodu döner, kuyruğa sokmaz
  if (mode === "create_private") {
    // Conditional UPDATE ile TOCTOU koruması
    const { error: lockErr } = await admin.from("profiles")
      .update({ real_balance_locked: Number(profile.real_balance_locked) + entry_fee })
      .eq("id", user.id)
      .eq("real_balance_locked", Number(profile.real_balance_locked));
    if (lockErr) {
      console.warn(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify({ error: "Bakiye kilitleme başarısız", code: "LOCK_FAILED" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      console.warn(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return new Response(JSON.stringify({ error: rErr?.message ?? "Oda oluşturulamadı", code: "ROOM_CREATE_FAILED" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await admin.from("blitz_participants").insert({ room_id: room.id, user_id: user.id });

    await admin.from("analytics_events_staging").insert({
      event_type: "blitz_created",
      room_id: room.id,
      payload: { symbol, entry_fee, creator_id: user.id },
    }).catch((e: unknown) => console.warn("[blitz-matchmake] blitz_created insert failed", e));

    return new Response(JSON.stringify({ room_id: room.id, invite_code: inviteCode, status: "waiting" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // QUICK MATCH: kuyrukta rakip varsa eşleştir, yoksa kuyruğa gir
  // Redis kontrolü: yoksa 503 döner (sessiz fail-open yerine açık hata)
  if (!redisEnabled) {
    console.warn(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return new Response(JSON.stringify({
      error: "Eşleştirme servisi geçici olarak kullanılamıyor",
      code: "MATCHMAKER_UNAVAILABLE",
      retryable: true,
    }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // İlk önce kullanıcının zaten kuyrukta olmadığından emin ol
  try {
    await redis.lrem(queueKey, 0, user.id);
  } catch (e) {
    console.warn(JSON.stringify({ event: "redis_fail_open", op: "lrem", queueKey, error: String(e) }));
  }

  let opponent: string | null = null;
  try {
    opponent = await redis.lpop(queueKey);
  } catch (e) {
    console.warn(JSON.stringify({ event: "redis_fail_open", op: "lpop", queueKey, error: String(e) }));
  }

  if (!opponent || opponent === user.id) {
    // Rakip yok veya self-match — kuyruğa ekle ve bakiyeyi kilitle
    // Self-match durumunda bakiye zaten kilitli, tekrar kilitlemeye gerek yok
    if (!opponent || opponent !== user.id) {
      // Yeni kullanıcı — kilitle
      const { error: lockErr } = await admin.from("profiles")
        .update({ real_balance_locked: Number(profile.real_balance_locked) + entry_fee })
        .eq("id", user.id)
        .eq("real_balance_locked", Number(profile.real_balance_locked));
      if (lockErr) {
        console.warn(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
        return new Response(JSON.stringify({ error: "Bakiye kilitleme başarısız", code: "LOCK_FAILED" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    try {
      await redis.rpush(queueKey, user.id);
      // Also add to sorted set with timestamp for stale cleanup
      const now = Date.now();
      await redis.zadd(queueKey, now, user.id);
      // Track this queue key for stale cleanup scanning
      await redis.sadd("blitz:queue:keys", queueKey);
      await redis.expire(queueKey, WAITING_ROOM_TTL_SECONDS);
    } catch (e) {
      console.warn(JSON.stringify({ event: "redis_fail_open", op: "rpush/zadd/sadd", queueKey, error: String(e) }));
    }

    // Log queue entry for observability (helps detect orphaned queues)
    await admin.rpc("log_observability", {
      p_service: "blitz_matchmake",
      p_event: "queue_joined",
      p_level: "info",
      p_metadata: { symbol, entry_fee, user_id: user.id, ttl_seconds: WAITING_ROOM_TTL_SECONDS },
    }).catch((e: unknown) => console.warn("[blitz-matchmake] log queue_joined failed", e));

    console.warn(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return new Response(JSON.stringify({ status: "queued" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rakip var — odayı aç
  // Rakibin bakiyesini doğrula (kuyruğa girerken kilitlemişti zaten ama emin olalım)
  const { data: oppProfile } = await admin
    .from("profiles").select("real_balance, real_balance_locked")
    .eq("id", opponent).single();

  const oppAvailable = oppProfile ? Number(oppProfile.real_balance) - Number(oppProfile.real_balance_locked) : -1;
  if (!oppProfile || oppAvailable < entry_fee) {
    // Rakip artık geçersiz — rakibin kilitini temizle
    if (oppProfile) {
      const oppNewLocked = Math.max(0, Number(oppProfile.real_balance_locked) - entry_fee);
      await admin.from("profiles")
        .update({ real_balance_locked: oppNewLocked })
        .eq("id", opponent);
    }
    // Kullanıcıyı kuyruğa geri koy (bakiyesi zaten kilitli)
    try {
      await redis.rpush(queueKey, user.id);
      const now = Date.now();
      await redis.zadd(queueKey, now, user.id);
      await redis.sadd("blitz:queue:keys", queueKey);
      await redis.expire(queueKey, WAITING_ROOM_TTL_SECONDS);
    } catch (e) {
      console.warn(JSON.stringify({ event: "redis_fail_open", op: "rpush/zadd/sadd", queueKey, error: String(e) }));
    }
    console.warn(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return new Response(JSON.stringify({ status: "queued" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Çağıran kullanıcının bakiyesini kilitle (conditional UPDATE)
  const { error: callerLockErr } = await admin.from("profiles")
    .update({ real_balance_locked: Number(profile.real_balance_locked) + entry_fee })
    .eq("id", user.id)
    .eq("real_balance_locked", Number(profile.real_balance_locked));
  if (callerLockErr) {
    // Kilitleme başarısız — rakibi geri kuyruğa koy
    try {
      await redis.rpush(queueKey, opponent);
      const now = Date.now();
      await redis.zadd(queueKey, now, opponent);
      await redis.sadd("blitz:queue:keys", queueKey);
      await redis.expire(queueKey, WAITING_ROOM_TTL_SECONDS);
    } catch (e) {
      console.warn(JSON.stringify({ event: "redis_fail_open", op: "rpush/zadd/sadd", queueKey, error: String(e) }));
    }
    console.warn(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return new Response(JSON.stringify({ error: "Bakiye kilitleme başarısız", code: "LOCK_FAILED" }), {
      status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Başlangıç fiyatını Redis'ten (price-feed yazıyor) veya price_cache'ten al
  let startPriceRaw: string | null = null;
  try {
    startPriceRaw = await redis.get(`blitz:price:${symbol}`);
  } catch (e) {
    console.warn(JSON.stringify({ event: "redis_fail_open", op: "get", key: `blitz:price:${symbol}`, error: String(e) }));
  }
  if (!startPriceRaw) {
    const { data: pc } = await admin.from("price_cache").select("price").eq("symbol", symbol).single();
    startPriceRaw = pc ? String(pc.price) : null;
  }
  const startPrice = startPriceRaw ? Number(startPriceRaw) : null;
  if (!startPrice || !isFinite(startPrice) || startPrice <= 0) {
    console.warn(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return new Response(JSON.stringify({ error: "Sembol için fiyat bilgisi alınamadı", code: "PRICE_UNAVAILABLE" }), {
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
    console.warn(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return new Response(JSON.stringify({ error: rErr?.message ?? "Oda oluşturulamadı", code: "ROOM_CREATE_FAILED" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await admin.from("blitz_participants").insert([
    { room_id: room.id, user_id: opponent },
    { room_id: room.id, user_id: user.id },
  ]);

  await admin.from("analytics_events_staging").insert({
    event_type: "blitz_created",
    room_id: room.id,
    payload: { symbol, entry_fee, creator_id: user.id },
  }).catch((e: unknown) => console.warn("[blitz-matchmake] match blitz_created insert failed", e));

  await admin.from("analytics_events_staging").insert({
    event_type: "blitz_started",
    room_id: room.id,
    payload: { symbol, participant_count: 2, starts_at: new Date().toISOString() },
  }).catch((e: unknown) => console.warn("[blitz-matchmake] blitz_started insert failed", e));

  await admin.rpc("log_observability", {
    p_service: "blitz_matchmake",
    p_event: "match_found",
    p_level: "info",
    p_room_id: room.id,
    p_metadata: { symbol, opponent_id: opponent, caller_id: user.id },
  }).catch((e: unknown) => console.warn("[blitz-matchmake] log match_found failed", e));

  // Redis odası
  try {
    await redis.hsetAll(`blitz:room:${room.id}`, {
      status: "active",
      symbol,
      start_price: startPrice,
      ends_at: endsAt.toISOString(),
    });
    await redis.sadd(`blitz:room:${room.id}:users`, opponent, user.id);
    await redis.expire(`blitz:room:${room.id}`, 600);
    await redis.expire(`blitz:room:${room.id}:users`, 600);
  } catch (e) {
    console.warn(JSON.stringify({ event: "redis_fail_open", op: "hsetAll/sadd/expire", roomId: room.id, error: String(e) }));
  }

  console.warn(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
  return new Response(JSON.stringify({ room_id: room.id, status: "active", opponent }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
