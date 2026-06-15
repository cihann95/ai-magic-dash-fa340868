// ──────────────────────────────────────────────────────────────────
// ANTI-TAMPER NOTICE — DO NOT REMOVE
// No client-supplied timestamp is ever used. All time fields are
// either DEFAULT now() in PostgreSQL or explicitly set via admin
// client (service_role) calling order_timestamp() RPC.
// ──────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { redis } from "../_shared/redis.ts";
import { rateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Req {
  room_id: string;
  action: "open" | "close";
  side?: "long" | "short";
  amount?: number;
  order_id?: string;
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const authHdr = req.headers.get("Authorization") ?? "";
  const token = authHdr.startsWith("Bearer ") ? authHdr.slice(7) : "";
  const { data: userRes } = await admin.auth.getUser(token);
  const user = userRes?.user;
  if (!user) return jsonResp({ error: "Unauthorized" }, 401);

  const rlResponse = await rateLimit(user.id, "blitz-tick-order");
  if (rlResponse) return rlResponse;

  // ── CRSH-003: server-time freshness guard ───────────────────────────
  // Reject requests whose client-sent timestamp drifts > 150 ms from
  // server wall clock. Anti front-running / stale-price replay defence.
  const sentAtHdr = req.headers.get("x-client-sent-at");
  if (sentAtHdr) {
    const sentAt = Number(sentAtHdr);
    if (!isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 150) {
      return jsonResp({ error: "Stale request (clock drift > 150ms)" }, 409);
    }
  }

  let body: Req & { entry_price?: unknown; price?: unknown; timestamp?: unknown; client_time?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResp({ error: "Invalid body" }, 400);
  }
  // Reject client-supplied price/time fields outright (defence-in-depth).
  if (
    body.entry_price !== undefined || body.price !== undefined ||
    body.timestamp !== undefined || body.client_time !== undefined
  ) {
    return jsonResp({ error: "Forbidden field in body" }, 400);
  }
  const { room_id, action } = body;
  if (!room_id || !action) return jsonResp({ error: "Missing fields" }, 400);

  // ── CRSH-003: idempotency guard ─────────────────────────────────────
  // Identical Idempotency-Key from the same user within 30s → 409.
  const idemKey = req.headers.get("idempotency-key");
  if (idemKey) {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(idemKey)) {
      return jsonResp({ error: "Invalid Idempotency-Key" }, 400);
    }
    const fresh = await redis.setNxEx(`blitz:idem:${user.id}:${idemKey}`, "1", 30);
    if (!fresh) {
      return jsonResp({ error: "Duplicate request (idempotency replay)" }, 409);
    }
  }


  const { data: room } = await admin
    .from("blitz_rooms")
    .select("symbol")
    .eq("id", room_id)
    .maybeSingle();

  if (!room) return jsonResp({ error: "Room not found" }, 404);

  let priceRaw: string | null = await redis.get(`blitz:price:${room.symbol}`);
  if (!priceRaw) {
    const { data: pc } = await admin
      .from("price_cache")
      .select("price")
      .eq("symbol", room.symbol)
      .single();
    priceRaw = pc ? String(pc.price) : null;
  }
  const price = priceRaw ? Number(priceRaw) : null;
  if (!price || !isFinite(price) || price <= 0) {
    return jsonResp({ error: "Price unavailable" }, 503);
  }

  if (action === "open") {
    const { side, amount } = body;
    if (!side || !(amount && amount > 0)) {
      return jsonResp({ error: "side and amount required" }, 400);
    }

    const { data: validation, error: rpcErr } = await admin.rpc(
      "tick_order_atomic",
      { _room_id: room_id, _user_id: user.id, _side: side, _amount: amount },
    );

    if (rpcErr) {
      return jsonResp({ error: rpcErr.message }, 500);
    }
    if (validation?.error) {
      return jsonResp({ error: validation.error }, 409);
    }

    const { data: slippageOk, error: slErr } = await admin.rpc(
      "validate_slippage",
      {
        _symbol: room.symbol,
        _entry_price: price,
        _reference_price: Number(validation.start_price),
      },
    );

    if (slErr) {
      return jsonResp({ error: slErr.message }, 500);
    }
    if (!slippageOk) {
      return jsonResp({ error: "Slippage too high. Order rejected." }, 409);
    }

    const { data: order, error: oErr } = await admin
      .from("blitz_orders")
      .insert({
        room_id,
        user_id: user.id,
        side,
        amount,
        entry_price: price,
      })
      .select()
      .single();

    if (oErr || !order) {
      await admin.from("analytics_events_staging").insert({
        event_type: "payout_failed",
        room_id,
        user_id: user.id,
        payload: { error: oErr?.message, side, amount },
      }).catch(() => {});
      return jsonResp({ error: oErr?.message ?? "Order failed" }, 500);
    }

    await admin.rpc("log_observability", {
      p_service: "blitz-tick-order",
      p_event: "order_open",
      p_level: "info",
      p_room_id: room_id,
      p_user_id: user.id,
      p_metadata: { side, amount, entry_price: price, symbol: room.symbol },
    }).catch(() => {});

    await admin.from("analytics_events_staging").insert({
      event_type: "blitz_joined",
      room_id,
      user_id: user.id,
      payload: { side, amount, entry_price: price },
    }).catch(() => {});

    return jsonResp({ ok: true, order });
  }

  const { order_id } = body;

  const { data: lockResult, error: lockErr } = await admin.rpc(
    "close_order_atomic",
    { _room_id: room_id, _user_id: user.id, _order_id: order_id ?? null },
  );

  if (lockErr) {
    return jsonResp({ error: lockErr.message }, 500);
  }
  if (lockResult?.error) {
    return jsonResp({ error: lockResult.error }, 404);
  }

  const dir = lockResult.side === "long" ? 1 : -1;
  const pnl = +(
    ((price - Number(lockResult.entry_price)) / Number(lockResult.entry_price)) *
      Number(lockResult.amount) *
      dir
  ).toFixed(6);

  const { data: closedAt, error: tsErr } = await admin.rpc("order_timestamp");
  if (tsErr || !closedAt) {
    return jsonResp({ error: "Server timestamp unavailable" }, 500);
  }

  const { error: cErr } = await admin
    .from("blitz_orders")
    .update({ closed_at: closedAt, exit_price: price, pnl })
    .eq("id", lockResult.order_id);

  if (cErr) return jsonResp({ error: cErr.message }, 500);

  await admin.rpc("log_observability", {
    p_service: "blitz-tick-order",
    p_event: "order_close",
    p_level: "info",
    p_room_id: room_id,
    p_user_id: user.id,
    p_metadata: { pnl, exit_price: price },
  }).catch(() => {});

  return jsonResp({ ok: true, pnl, exit_price: price });
});
