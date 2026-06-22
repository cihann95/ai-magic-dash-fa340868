// Admin tarafından blitz odası iptal etme + bakiye kilidi açma + bildirim
// Sadece 'admin' rolü erişebilir. service_role ile RLS bypass.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

function validateBody(body: unknown): { room_id: string; reason?: string } | string {
  if (!body || typeof body !== "object") return "Geçersiz veri";
  const { room_id, reason } = body as Record<string, unknown>;
  if (!room_id || typeof room_id !== "string") return "room_id gerekli (uuid string)";
  if (reason !== undefined && reason !== null && typeof reason !== "string") return "reason string olmalı";
  return { room_id, reason: reason ?? undefined };
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

  const rlResponse = await rateLimit(caller.id, "admin-cancel-room");
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

  const { room_id, reason } = validated;

  const { data: room, error: roomErr } = await admin
    .from("blitz_rooms")
    .select("id, status, entry_fee")
    .eq("id", room_id)
    .maybeSingle();

  if (roomErr || !room) {
    return new Response(JSON.stringify({ error: "Oda bulunamadı" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (room.status !== "waiting" && room.status !== "active") {
    return new Response(JSON.stringify({ error: `Oda iptal edilemez — durum: ${room.status}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const entryFee = Number(room.entry_fee);

  await admin
    .from("blitz_rooms")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", room_id);

  const { data: participants } = await admin
    .from("blitz_participants")
    .select("user_id")
    .eq("room_id", room_id);

  let refundCount = 0;

  if (participants && participants.length > 0) {
    const uniqueUserIds = [...new Set(participants.map((p: { user_id: string }) => p.user_id))];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, real_balance_locked")
      .in("id", uniqueUserIds);

    if (profiles) {
      for (const profile of profiles) {
        const currentLocked = Number(profile.real_balance_locked);
        if (currentLocked >= entryFee) {
          await admin
            .from("profiles")
            .update({ real_balance_locked: currentLocked - entryFee })
            .eq("id", profile.id);
          refundCount++;
        }
      }
    }

    const notificationBody = reason
      ? `${reason} Bakiyeniz iade edildi.`
      : "Bakiyeniz iade edildi.";

    for (const p of participants) {
      await admin.from("notifications").insert({
        user_id: p.user_id,
        type: "blitz_cancelled",
        title: "Blitz odası iptal edildi",
        body: notificationBody,
        metadata: { room_id, refund_amount: entryFee },
      });
    }
  }

  return new Response(JSON.stringify({ success: true, room_id, refund_count: refundCount }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
