// Davet koduyla private odaya katılım. Oda dolarsa active'e çeker.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { redis } from "../_shared/redis.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ROOM_DURATION_SECONDS = 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const authHdr = req.headers.get("Authorization") ?? "";
  const token = authHdr.startsWith("Bearer ") ? authHdr.slice(7) : "";
  const { data: userRes } = await admin.auth.getUser(token);
  const user = userRes?.user;
  if (!user) return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let invite_code = "";
  try { invite_code = ((await req.json()).invite_code ?? "").toString().trim().toUpperCase(); } catch { /* noop */ }
  if (!invite_code) return new Response(JSON.stringify({ error: "Davet kodu eksik" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: room } = await admin.from("blitz_rooms").select("*").eq("invite_code", invite_code).maybeSingle();
  if (!room) return new Response(JSON.stringify({ error: "Oda bulunamadı" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (room.status !== "waiting") return new Response(JSON.stringify({ error: "Oda kullanılamıyor" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Bakiye
  const { data: profile } = await admin.from("profiles").select("real_balance, real_balance_locked").eq("id", user.id).single();
  if (!profile) return new Response(JSON.stringify({ error: "Profil bulunamadı" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const available = Number(profile.real_balance) - Number(profile.real_balance_locked);
  if (available < Number(room.entry_fee)) {
    return new Response(JSON.stringify({ error: "Yetersiz bakiye" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Zaten katılımcı mı?
  const { data: exists } = await admin.from("blitz_participants").select("id").eq("room_id", room.id).eq("user_id", user.id).maybeSingle();
  if (exists) {
    return new Response(JSON.stringify({ room_id: room.id, status: room.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  await admin.from("profiles").update({ real_balance_locked: Number(profile.real_balance_locked) + Number(room.entry_fee) }).eq("id", user.id);
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
    if (startPrice && isFinite(startPrice) && startPrice > 0) {
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
  }

  return new Response(JSON.stringify({ room_id: room.id, status: "joined" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
