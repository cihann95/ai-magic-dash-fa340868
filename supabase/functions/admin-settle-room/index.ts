// Admin tarafından blitz odası settle etme
// Mevcut blitz-settle-room'un settleRoom() fonksiyonunu import eder.
// Idempotent: settlement_ledger kontrolü önceden yapılır.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { settleRoom } from "../blitz-settle-room/index.ts";

function validateBody(body: unknown): { room_id: string } | string {
  if (!body || typeof body !== "object") return "Geçersiz veri";
  const { room_id } = body as Record<string, unknown>;
  if (!room_id || typeof room_id !== "string") return "room_id gerekli (uuid string)";
  return { room_id };
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
  const caller = userRes?.user;
  if (!caller) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Yasak — sadece yönetici" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rlResponse = await rateLimit(caller.id, "admin-settle-room");
  if (rlResponse) return rlResponse;

  let body: unknown;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Geçersiz JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const validated = validateBody(body);
  if (typeof validated === "string") {
    return new Response(JSON.stringify({ error: validated }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { room_id } = validated;

  // Idempotency check: settlement_ledger'da zaten tamamlanmış kayıt var mı?
  const { data: existing } = await admin
    .from("settlement_ledger")
    .select("id")
    .eq("room_id", room_id)
    .eq("status", "completed")
    .limit(1);

  if (existing && existing.length > 0) {
    return new Response(JSON.stringify({ already_settled: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const result = await settleRoom(admin, room_id);

    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error ?? result.reason }), {
        status: result.error === "Oda kilitleme yanıtsız" ? 503 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (result.reason === "already_settled") {
      return new Response(JSON.stringify({ already_settled: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Settlement başarılı — sonuçları topla
    const { data: room } = await admin
      .from("blitz_rooms")
      .select("winner_id, pot, fee_collected")
      .eq("id", room_id)
      .maybeSingle();

    const { count: participantCount } = await admin
      .from("blitz_participants")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room_id);

    return new Response(JSON.stringify({
      success: true,
      room_id,
      winner_id: room?.winner_id ?? null,
      prize: room ? Number(room.pot) - Number(room.fee_collected) : 0,
      fee: room ? Number(room.fee_collected) : 0,
      participant_count: participantCount ?? 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("admin-settle-room error", e);
    return new Response(JSON.stringify({ error: "Settlement hatası" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
