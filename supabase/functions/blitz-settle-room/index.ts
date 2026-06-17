// Süresi dolan Blitz odalarını kapatır: pozisyonları liquidate, PnL hesapla, kazananı belirle, ödülü dağıt.
// Hem manuel (room_id ile) hem de cron tarafından (tüm süresi dolmuşları tara) çağrılabilir. Idempotent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { redis } from "../_shared/redis.ts";
import type { Admin } from "../_shared/blitz-types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const PLATFORM_FEE_PCT = 0.05; // FAZ 4 raporları için kayıt; ödül net dağıtılır

async function settleRoom(admin: Admin, roomId: string): Promise<{ ok: boolean; reason?: string; error?: string }> {
  const idempotencyKey = `${roomId}:edge_function`;

  // Acquire advisory lock (same hash as DB trigger uses via make_advisory_lock_key())
  const { data: lockKey } = await admin.rpc("make_advisory_lock_key", { p_room_id: roomId });
  const { data: lockAcquired, error: lockErr1 } = await admin.rpc("try_advisory_lock", {
    p_key: lockKey,
  });
  if (lockErr1) return { ok: false, error: lockErr1.message };
  if (lockAcquired === false) {
    return { ok: true, reason: "locked_by_other_session" };
  }

  const { data: lockResult, error: lockErr } = await admin.rpc("lock_and_validate_room", {
    p_room_id: roomId,
    p_idempotency_key: idempotencyKey,
  });
  if (lockErr) return { ok: false, error: lockErr.message };
  if (!lockResult) return { ok: false, error: "Oda kilitleme yanıtsız" };
  if (lockResult.already_settled) return { ok: true, reason: "already_settled" };
  if (lockResult.error) return { ok: false, error: lockResult.error };

  const room = {
    symbol: lockResult.symbol,
    start_price: lockResult.start_price,
    entry_fee: lockResult.entry_fee,
    pot: lockResult.pot,
  };

  await admin.rpc("log_observability", {
    p_service: "settlement",
    p_event: "settle_start",
    p_level: "info",
    p_room_id: roomId,
    p_metadata: { symbol: room.symbol },
  }).catch((e: unknown) => console.warn("[settlement] log_observability failed", e));

  try {
    const { data: participants } = await admin.from("blitz_participants").select("*").eq("room_id", roomId);
    if (!participants || participants.length === 0) {
      await admin.from("blitz_rooms").update({ status: "finished" }).eq("id", roomId);
      return { ok: true, reason: "no_participants" };
    }

    let priceRaw: string | null = await redis.get(`blitz:price:${room.symbol}`);
    if (!priceRaw) {
      const { data: pc } = await admin.from("price_cache").select("price").eq("symbol", room.symbol).single();
      priceRaw = pc ? String(pc.price) : null;
    }
    const lastPrice = priceRaw ? Number(priceRaw) : Number(room.start_price ?? 0);

    const { data: openOrders } = await admin.from("blitz_orders")
      .select("*").eq("room_id", roomId).is("closed_at", null);
    const { data: nowIso, error: tsErr } = await admin.rpc("order_timestamp");
    if (tsErr || !nowIso) {
      return { ok: false, error: "Sunucu zaman damgası alınamadı" };
    }
    for (const o of openOrders ?? []) {
      const dir = o.side === "long" ? 1 : -1;
      const pnl = +(((lastPrice - Number(o.entry_price)) / Number(o.entry_price)) * Number(o.amount) * dir).toFixed(6);
      await admin.from("blitz_orders").update({ closed_at: nowIso, exit_price: lastPrice, pnl }).eq("id", o.id);
    }

    const userPnl: Record<string, number> = {};
    for (const p of participants) userPnl[p.user_id] = 0;
    const { data: allOrders } = await admin.from("blitz_orders").select("user_id,pnl").eq("room_id", roomId);
    for (const o of allOrders ?? []) {
      if (o.pnl != null) userPnl[o.user_id] = (userPnl[o.user_id] ?? 0) + Number(o.pnl);
    }

    const ranking = Object.entries(userPnl).sort((a, b) => b[1] - a[1]);
    const winnerId = ranking.length > 0 && ranking[0][1] > (ranking[1]?.[1] ?? -Infinity) ? ranking[0][0] : null;

    const entryFee = Number(room.entry_fee);
    const pot = entryFee * participants.length;
    const fee = +(pot * PLATFORM_FEE_PCT).toFixed(4);
    const prize = +(pot - fee).toFixed(4);

    for (let i = 0; i < ranking.length; i++) {
      const [uid, pnl] = ranking[i];
      const rank = i + 1;
      await admin.from("blitz_participants").update({
        final_pnl: pnl, rank, final_balance: 0,
      }).eq("room_id", roomId).eq("user_id", uid);

      const { data: prof } = await admin.from("profiles").select("real_balance, real_balance_locked").eq("id", uid).single();
      if (!prof) continue;
      const newLocked = Math.max(0, Number(prof.real_balance_locked) - entryFee);
      let newBalance = Number(prof.real_balance) - entryFee;
      if (winnerId && uid === winnerId) {
        newBalance += prize;
      }
      await admin.from("profiles").update({
        real_balance: +newBalance.toFixed(4),
        real_balance_locked: +newLocked.toFixed(4),
      }).eq("id", uid);

      await admin.from("notifications").insert({
        user_id: uid,
        type: "blitz_result",
        title: winnerId === uid ? `🏆 Blitz Kazandın!` : (winnerId ? `Blitz: Kaybettin` : `Blitz: Berabere`),
        body: winnerId === uid ? `+${prize.toFixed(2)}$ kazandın (${room.symbol})` : `${room.symbol} • PnL ${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)}`,
        link: `/blitz/${roomId}`,
        metadata: { room_id: roomId, pnl, won: winnerId === uid },
      });
    }

    await admin.from("blitz_rooms").update({
      status: "finished",
      winner_id: winnerId,
      pot,
      fee_collected: fee,
    }).eq("id", roomId);

    if (fee > 0) {
      await admin.from("platform_revenue").insert({
        source: "blitz",
        room_id: roomId,
        amount: fee,
        metadata: { symbol: room.symbol, pot, participants: participants.length, winner_id: winnerId },
      });
    }

    await admin.from("settlement_ledger").insert({
      room_id: roomId,
      idempotency_key: idempotencyKey,
      settlement_type: "edge_function",
      winner_id: winnerId,
      prize_amount: prize,
      fee_collected: fee,
      pot_total: pot,
      participant_count: ranking.length,
      status: "completed",
      metadata: { symbol: room.symbol, participant_count: ranking.length },
    });

    await admin.from("analytics_events_staging").insert({
      event_type: "blitz_finished",
      room_id: roomId,
      payload: {
        symbol: room.symbol,
        participant_count: ranking.length,
        winner_id: winnerId,
        pot_total: pot,
        fee_collected: fee,
      },
    }).catch((e: unknown) => console.warn("[settlement] analytics_events_staging insert failed", e));

    if (winnerId) {
      await admin.from("analytics_events_staging").insert({
        event_type: "payout_completed",
        room_id: roomId,
        user_id: winnerId,
        payload: { prize_amount: prize, symbol: room.symbol },
      }).catch((e: unknown) => console.warn("[settlement] payout_completed insert failed", e));
    }

    await redis.del(`blitz:room:${roomId}`, `blitz:room:${roomId}:users`, `blitz:room:${roomId}:positions`);

    await admin.rpc("log_observability", {
      p_service: "settlement",
      p_event: "settle_complete",
      p_level: "info",
      p_room_id: roomId,
      p_metadata: { winner_id: winnerId, prize, participant_count: ranking.length },
    }).catch((e: unknown) => console.warn("[settlement] log settle_complete failed", e));

    return { ok: true };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await admin.from("settlement_ledger").insert({
      room_id: roomId,
      idempotency_key: idempotencyKey,
      settlement_type: "edge_function",
      prize_amount: 0,
      fee_collected: 0,
      pot_total: 0,
      participant_count: 1,
      status: "failed",
      error_message: errorMessage,
      metadata: { symbol: room.symbol, error: errorMessage },
    }).catch((err: unknown) => console.warn("[settlement] settlement_ledger insert failed", err));

    await admin.rpc("log_observability", {
      p_service: "settlement",
      p_event: "settle_failed",
      p_level: "error",
      p_room_id: roomId,
      p_metadata: { error: errorMessage },
    }).catch((err: unknown) => console.warn("[settlement] log settle_failed failed", err));

    throw e;
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const authHdr = req.headers.get("Authorization") ?? "";
  const cronToken = req.headers.get("x-cron-secret") ?? "";
  const isServiceRole = authHdr === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  let isCron = false;
  if (!isServiceRole && cronToken) {
    const { data: ok } = await admin.rpc("verify_cron_secret", { _token: cronToken });
    isCron = ok === true;
  }
  // Authenticated kullanıcı kendi odasını da settle tetikleyebilir (idempotent)
  let isUser = false;
  if (!isServiceRole && !isCron && authHdr.startsWith("Bearer ")) {
    const { data: u } = await admin.auth.getUser(authHdr.slice(7));
    isUser = !!u?.user;
  }
  if (!isServiceRole && !isCron && !isUser) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let room_id: string | undefined;
  if (req.method === "POST") {
    try { room_id = (await req.json())?.room_id; } catch { /* noop */ }
  }

  try {
    if (room_id) {
      const r = await settleRoom(admin, room_id);
      return new Response(JSON.stringify(r), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Süresi dolmuş tüm aktif odaları topla
    const { data: due } = await admin.from("blitz_rooms")
      .select("id").eq("status", "active").lte("ends_at", new Date().toISOString());
    const results = [];
    for (const r of due ?? []) {
      results.push({ id: r.id, ...(await settleRoom(admin, r.id)) });
    }
    return new Response(JSON.stringify({ settled: results.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("blitz-settle-room error", e);
    return new Response(JSON.stringify({ error: "Sunucu hatası oluştu" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
