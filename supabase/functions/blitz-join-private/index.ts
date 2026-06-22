// Davet koduyla private odaya katılım. Oda dolarsa active'e çeker.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { redis } from "../_shared/redis.ts";
import { checkBodySize } from "../_shared/body-size-limit.ts";
import { rateLimit } from "../_shared/rate-limit.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const ROOM_DURATION_SECONDS = 60;

const JoinPrivateSchema = z.object({
  invite_code: z.string().min(4).max(32).regex(/^[A-Z0-9]+$/i),
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const start = Date.now();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const authHdr = req.headers.get("Authorization") ?? "";
  const token = authHdr.startsWith("Bearer ") ? authHdr.slice(7) : "";
  const { data: userRes } = await admin.auth.getUser(token);
  const user = userRes?.user;
  if (!user) return new Response(JSON.stringify({ error: "Yetkisiz erişim", code: "UNAUTHORIZED" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const rlResponse = await rateLimit(user.id, "blitz-join-private");
  if (rlResponse) return rlResponse;

  const bodyError = await checkBodySize(req);
  if (bodyError) return bodyError;

  let rawBody: unknown;
  try { rawBody = await req.json(); } catch { rawBody = {}; }
  const parsed = JoinPrivateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "VALIDATION_ERROR", code: "VALIDATION_ERROR", details: parsed.error.flatten() }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const invite_code = parsed.data.invite_code.trim().toUpperCase();

  const { data: room } = await admin.from("blitz_rooms").select("*").eq("invite_code", invite_code).maybeSingle();
  if (!room) return new Response(JSON.stringify({ error: "Oda bulunamadı", code: "ROOM_NOT_FOUND" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (room.status !== "waiting") return new Response(JSON.stringify({ error: "Oda kullanılamıyor", code: "ROOM_UNAVAILABLE" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Bakiye
  const { data: profile } = await admin.from("profiles").select("real_balance, real_balance_locked").eq("id", user.id).single();
  if (!profile) return new Response(JSON.stringify({ error: "Profil bulunamadı", code: "PROFILE_NOT_FOUND" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const available = Number(profile.real_balance) - Number(profile.real_balance_locked);
  if (available < Number(room.entry_fee)) {
    return new Response(JSON.stringify({ error: "Yetersiz bakiye", code: "INSUFFICIENT_BALANCE" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Zaten katılımcı mı?
  const { data: exists } = await admin.from("blitz_participants").select("id").eq("room_id", room.id).eq("user_id", user.id).maybeSingle();
  if (exists) {
    return new Response(JSON.stringify({ room_id: room.id, status: room.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Conditional UPDATE for TOCTOU balance lock protection
  const { error: lockErr } = await admin.from("profiles")
    .update({ real_balance_locked: Number(profile.real_balance_locked) + Number(room.entry_fee) })
    .eq("id", user.id)
    .eq("real_balance_locked", Number(profile.real_balance_locked));
  if (lockErr) {
    return new Response(JSON.stringify({ error: "Bakiye kilitleme başarısız (eş zamanlı istek olabilir)", code: "LOCK_CONFLICT" }), {
      status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  await admin.from("blitz_participants").insert({ room_id: room.id, user_id: user.id });

  // Oda dolduysa active'e çek
  const { count } = await admin.from("blitz_participants").select("*", { count: "exact", head: true }).eq("room_id", room.id);
  if ((count ?? 0) >= room.max_players) {
    let startPriceRaw: string | null = await redis.get(`blitz:price:${room.symbol}`);
    if (!startPriceRaw) {
      const { data: pc } = await admin.from("price_cache").select("price").eq("symbol", room.symbol).single();
      startPriceRaw = pc ? String(pc.price) : null;
    }
    const startPrice = startPriceRaw ? Number(startPriceRaw) : null;
    if (!startPrice || !isFinite(startPrice) || startPrice <= 0) {
      return new Response(JSON.stringify({ error: "Sembol için fiyat bilgisi alınamadı", code: "PRICE_UNAVAILABLE" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + ROOM_DURATION_SECONDS * 1000);
    await admin.from("blitz_rooms").update({
      status: "active",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      start_price: startPrice,
      pot: Number(room.entry_fee) * (count ?? 0),
    }).eq("id", room.id);
    await redis.hsetAll(`blitz:room:${room.id}`, {
      status: "active", symbol: room.symbol,
      start_price: startPrice, ends_at: endsAt.toISOString(),
    });
    await redis.expire(`blitz:room:${room.id}`, 600);
  }

  console.error(JSON.stringify({ event: "request", duration_ms: Date.now() - start }));
  return new Response(JSON.stringify({ room_id: room.id, status: "joined" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
