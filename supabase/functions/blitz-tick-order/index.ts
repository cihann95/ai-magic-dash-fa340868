// ──────────────────────────────────────────────────────────────────
// ANTI-TAMPER NOTICE — DO NOT REMOVE
// No client-supplied timestamp is ever used. All time fields are
// either DEFAULT now() in PostgreSQL or explicitly set via admin
// client (service_role) calling order_timestamp() RPC.
// ──────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { redis } from "../_shared/redis.ts";
import { rateLimit } from "../_shared/rate-limit.ts";
import { checkBodySize } from "../_shared/body-size-limit.ts";

import { corsHeaders, handleCors } from "../_shared/cors.ts";

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
  const cors = handleCors(req);
  if (cors) return cors;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const authHdr = req.headers.get("Authorization") ?? "";
  const token = authHdr.startsWith("Bearer ") ? authHdr.slice(7) : "";
  const { data: userRes } = await admin.auth.getUser(token);
  const user = userRes?.user;
  if (!user) {
    return jsonResp({ error: "Yetkisiz erişim", code: "UNAUTHORIZED" }, 401);
  }

  const start = Date.now();

  const rlResponse = await rateLimit(user.id, "blitz-tick-order");
  if (rlResponse) {
    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return rlResponse;
  }

  const bodyError = await checkBodySize(req);
  if (bodyError) {
    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return bodyError;
  }

  // ── CRSH-003: server-time freshness guard ───────────────────────────
  // Reject requests whose client-sent timestamp drifts > 150 ms from
  // server wall clock. Anti front-running / stale-price replay defence.
  const sentAtHdr = req.headers.get("x-client-sent-at");
  if (sentAtHdr) {
    const sentAt = Number(sentAtHdr);
    if (!isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 150) {
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return jsonResp({ error: "Eski istek (saat sapması > 150ms)", code: "CLOCK_DRIFT" }, 409);
    }
  }

  let body: Req & { entry_price?: unknown; price?: unknown; timestamp?: unknown; client_time?: unknown };
  try {
    body = await req.json();
  } catch {
    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return jsonResp({ error: "Geçersiz veri", code: "INVALID_JSON" }, 400);
  }
  // Reject client-supplied price/time fields outright (defence-in-depth).
  if (
    body.entry_price !== undefined || body.price !== undefined ||
    body.timestamp !== undefined || body.client_time !== undefined
  ) {
    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return jsonResp({ error: "Yasaklı alan", code: "FORBIDDEN_FIELD" }, 400);
  }
  const { room_id, action } = body;
  if (!room_id || !action) {
    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return jsonResp({ error: "Eksik alanlar", code: "MISSING_FIELDS" }, 400);
  }

  // ── CRSH-003: idempotency guard ─────────────────────────────────────
  // Identical Idempotency-Key from the same user within 30s → 409.
  const idemKey = req.headers.get("idempotency-key");
  if (idemKey) {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(idemKey)) {
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return jsonResp({ error: "Geçersiz tekillik anahtarı", code: "INVALID_IDEMPOTENCY_KEY" }, 400);
    }
    const fresh = await redis.setNxEx(`blitz:idem:${user.id}:${idemKey}`, "1", 30);
    if (!fresh) {
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return jsonResp({ error: "Tekrarlanan istek", code: "IDEMPOTENCY_CONFLICT" }, 409);
    }
  }


  const { data: room } = await admin
    .from("blitz_rooms")
    .select("symbol")
    .eq("id", room_id)
    .maybeSingle();

  if (!room) {
    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return jsonResp({ error: "Oda bulunamadı", code: "ROOM_NOT_FOUND" }, 404);
  }

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
    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return jsonResp({ error: "Fiyat bilgisi alınamadı", code: "PRICE_UNAVAILABLE" }, 503);
  }

  if (action === "open") {
    const { side, amount } = body;
    if (!side || !(amount && amount > 0)) {
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return jsonResp({ error: "side and amount required", code: "INVALID_PARAMS" }, 400);
    }

    const { data: validation, error: rpcErr } = await admin.rpc(
      "tick_order_atomic",
      { _room_id: room_id, _user_id: user.id, _side: side, _amount: amount },
    );

    if (rpcErr) {
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return jsonResp({ error: rpcErr.message, code: "RPC_ERROR" }, 500);
    }
    if (validation?.error) {
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return jsonResp({ error: validation.error, code: "VALIDATION_ERROR" }, 409);
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
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return jsonResp({ error: slErr.message, code: "RPC_ERROR" }, 500);
    }
    if (!slippageOk) {
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return jsonResp({ error: "Kayma çok yüksek. Emir reddedildi.", code: "SLIPPAGE_EXCEEDED" }, 409);
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
      }).catch((e: unknown) => console.warn("[blitz-tick-order] payout_failed insert failed", e));
      console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
      return jsonResp({ error: oErr?.message ?? "Order failed", code: "ORDER_INSERT_FAILED" }, 500);
    }

    await admin.rpc("log_observability", {
      p_service: "blitz-tick-order",
      p_event: "order_open",
      p_level: "info",
      p_room_id: room_id,
      p_user_id: user.id,
      p_metadata: { side, amount, entry_price: price, symbol: room.symbol },
    }).catch((e: unknown) => console.warn("[blitz-tick-order] log order_open failed", e));

    await admin.from("analytics_events_staging").insert({
      event_type: "blitz_joined",
      room_id,
      user_id: user.id,
      payload: { side, amount, entry_price: price },
    }).catch((e: unknown) => console.warn("[blitz-tick-order] blitz_joined insert failed", e));

    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return jsonResp({ ok: true, order });
  }

  const { order_id } = body;

  const { data: lockResult, error: lockErr } = await admin.rpc(
    "close_order_atomic",
    { _room_id: room_id, _user_id: user.id, _order_id: order_id ?? null },
  );

  if (lockErr) {
    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return jsonResp({ error: lockErr.message, code: "LOCK_FAILED" }, 500);
  }
  if (lockResult?.error) {
    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return jsonResp({ error: lockResult.error, code: "ORDER_NOT_FOUND" }, 404);
  }

  const dir = lockResult.side === "long" ? 1 : -1;
  const pnl = +(
    ((price - Number(lockResult.entry_price)) / Number(lockResult.entry_price)) *
      Number(lockResult.amount) *
      dir
  ).toFixed(6);

  const { data: closedAt, error: tsErr } = await admin.rpc("order_timestamp");
  if (tsErr || !closedAt) {
    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return jsonResp({ error: "Sunucu zaman damgası alınamadı", code: "TIMESTAMP_FAILED" }, 500);
  }

  const { error: cErr } = await admin
    .from("blitz_orders")
    .update({ closed_at: closedAt, exit_price: price, pnl })
    .eq("id", lockResult.order_id);

  if (cErr) {
    console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
    return jsonResp({ error: cErr.message, code: "CLOSE_FAILED" }, 500);
  }

  await admin.rpc("log_observability", {
    p_service: "blitz-tick-order",
    p_event: "order_close",
    p_level: "info",
    p_room_id: room_id,
    p_user_id: user.id,
    p_metadata: { pnl, exit_price: price },
  }).catch((e: unknown) => console.warn("[blitz-tick-order] log order_close failed", e));

  console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
  return jsonResp({ ok: true, pnl, exit_price: price });
});
