// Süresi dolan Blitz odalarını kapatır: pozisyonları liquidate, PnL hesapla, kazananı belirle, ödülü dağıt.
// Hem manuel (room_id ile) hem de cron tarafından (tüm süresi dolmuşları tara) çağrılabilir. Idempotent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { redis } from "../_shared/redis.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const PLATFORM_FEE_PCT = 0.05; // FAZ 4 raporları için kayıt; ödül net dağıtılır

async function settleRoom(admin: any, roomId: string): Promise<{ ok: boolean; reason?: string }> {
  // Atomik: status'u 'active'ten 'settling'e çevir (race koruması)
  const { data: locked } = await admin.from("blitz_rooms")
    .update({ status: "settling" })
    .eq("id", roomId).eq("status", "active")
    .select().maybeSingle();
  if (!locked) return { ok: false, reason: "already_settled_or_inactive" };

  const room = locked;
  const { data: participants } = await admin.from("blitz_participants").select("*").eq("room_id", roomId);
  if (!participants || participants.length === 0) {
    await admin.from("blitz_rooms").update({ status: "finished" }).eq("id", roomId);
    return { ok: true, reason: "no_participants" };
  }

  // Son fiyat
  let priceRaw: string | null = await redis.get(`blitz:price:${room.symbol}`);
  if (!priceRaw) {
    const { data: pc } = await admin.from("price_cache").select("price").eq("symbol", room.symbol).single();
    priceRaw = pc ? String(pc.price) : null;
  }
  const lastPrice = priceRaw ? Number(priceRaw) : Number(room.start_price ?? 0);

  // Açık pozisyonları liquidate
  const { data: openOrders } = await admin.from("blitz_orders")
    .select("*").eq("room_id", roomId).is("closed_at", null);
  const nowIso = new Date().toISOString();
  for (const o of openOrders ?? []) {
    const dir = o.side === "long" ? 1 : -1;
    const pnl = +(((lastPrice - Number(o.entry_price)) / Number(o.entry_price)) * Number(o.amount) * dir).toFixed(6);
    await admin.from("blitz_orders").update({ closed_at: nowIso, exit_price: lastPrice, pnl }).eq("id", o.id);
  }

  // Her katılımcının toplam PnL'i
  const userPnl: Record<string, number> = {};
  for (const p of participants) userPnl[p.user_id] = 0;
  const { data: allOrders } = await admin.from("blitz_orders").select("user_id,pnl").eq("room_id", roomId);
  for (const o of allOrders ?? []) {
    if (o.pnl != null) userPnl[o.user_id] = (userPnl[o.user_id] ?? 0) + Number(o.pnl);
  }

  // Sıralama
  const ranking = Object.entries(userPnl).sort((a, b) => b[1] - a[1]);
  const winnerId = ranking.length > 0 && ranking[0][1] > (ranking[1]?.[1] ?? -Infinity) ? ranking[0][0] : null;

  const entryFee = Number(room.entry_fee);
  const pot = entryFee * participants.length;
  const fee = +(pot * PLATFORM_FEE_PCT).toFixed(4);
  const prize = +(pot - fee).toFixed(4);

  // Katılımcı sonuçlarını yaz + bakiyeleri güncelle
  for (let i = 0; i < ranking.length; i++) {
    const [uid, pnl] = ranking[i];
    const rank = i + 1;
    await admin.from("blitz_participants").update({
      final_pnl: pnl, rank, final_balance: 0,
    }).eq("room_id", roomId).eq("user_id", uid);

    // Bakiye: önce kilitlenmiş entry_fee'yi çöz, sonra kazananın ödülü ekle
    const { data: prof } = await admin.from("profiles").select("real_balance, real_balance_locked").eq("id", uid).single();
    if (!prof) continue;
    const newLocked = Math.max(0, Number(prof.real_balance_locked) - entryFee);
    let newBalance = Number(prof.real_balance) - entryFee; // entry fee düş
    if (winnerId && uid === winnerId) {
      newBalance += prize; // bütün havuzun net'i kazanana
    }
    await admin.from("profiles").update({
      real_balance: +newBalance.toFixed(4),
      real_balance_locked: +newLocked.toFixed(4),
    }).eq("id", uid);

    // Bildirim
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

  // Redis temizliği
  await redis.del(`blitz:room:${roomId}`, `blitz:room:${roomId}:users`, `blitz:room:${roomId}:positions`);

  return { ok: true };
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
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    return new Response(JSON.stringify({ error: "Internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
