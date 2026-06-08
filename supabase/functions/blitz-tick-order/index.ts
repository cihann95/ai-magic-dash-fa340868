// Aktif Blitz odasında LONG/SHORT emir aç veya kapat.
// action: 'open' | 'close'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { redis } from "../_shared/redis.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const authHdr = req.headers.get("Authorization") ?? "";
  const token = authHdr.startsWith("Bearer ") ? authHdr.slice(7) : "";
  const { data: userRes } = await admin.auth.getUser(token);
  const user = userRes?.user;
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let body: Req;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { room_id, action } = body;
  if (!room_id || !action) return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: room } = await admin.from("blitz_rooms").select("*").eq("id", room_id).maybeSingle();
  if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (room.status !== "active") return new Response(JSON.stringify({ error: "Room not active" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (new Date(room.ends_at!).getTime() <= Date.now()) {
    return new Response(JSON.stringify({ error: "Room expired" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: participant } = await admin.from("blitz_participants").select("id").eq("room_id", room_id).eq("user_id", user.id).maybeSingle();
  if (!participant) return new Response(JSON.stringify({ error: "Not a participant" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Anlık fiyat
  let priceRaw: string | null = await redis.get(`blitz:price:${room.symbol}`);
  if (!priceRaw) {
    const { data: pc } = await admin.from("price_cache").select("price").eq("symbol", room.symbol).single();
    priceRaw = pc ? String(pc.price) : null;
  }
  const price = priceRaw ? Number(priceRaw) : null;
  if (!price || !isFinite(price) || price <= 0) {
    return new Response(JSON.stringify({ error: "Price unavailable" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (action === "open") {
    const { side, amount } = body;
    if (!side || !(amount && amount > 0)) {
      return new Response(JSON.stringify({ error: "side and amount required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Aynı yönde açık emir varsa engelle (basitlik) — kullanıcı önce kapatmalı
    const { data: open } = await admin.from("blitz_orders").select("id").eq("room_id", room_id).eq("user_id", user.id).is("closed_at", null);
    if (open && open.length > 0) {
      return new Response(JSON.stringify({ error: "Already have an open position. Close it first." }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: order, error: oErr } = await admin.from("blitz_orders").insert({
      room_id, user_id: user.id, side, amount, entry_price: price,
    }).select().single();
    if (oErr || !order) return new Response(JSON.stringify({ error: oErr?.message ?? "Order failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, order }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // CLOSE
  const { order_id } = body;
  const q = admin.from("blitz_orders").select("*").eq("room_id", room_id).eq("user_id", user.id).is("closed_at", null);
  const { data: orders } = order_id ? await q.eq("id", order_id) : await q;
  const order = orders?.[0];
  if (!order) return new Response(JSON.stringify({ error: "No open order" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const dir = order.side === "long" ? 1 : -1;
  const pnl = +(((price - Number(order.entry_price)) / Number(order.entry_price)) * Number(order.amount) * dir).toFixed(6);

  const { error: cErr } = await admin.from("blitz_orders").update({
    closed_at: new Date().toISOString(), exit_price: price, pnl,
  }).eq("id", order.id);
  if (cErr) return new Response(JSON.stringify({ error: cErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  return new Response(JSON.stringify({ ok: true, pnl, exit_price: price }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
