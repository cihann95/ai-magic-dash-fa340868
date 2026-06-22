// Admin tarafından kullanıcı banlama/de-banlama
// Sadece 'admin' rolü erişebilir. public_profiles.is_active toggle + blitz oda iptal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

// Inline Zod-like validation
function validateBody(body: unknown): { user_id: string; banned: boolean; reason?: string } | string {
  if (!body || typeof body !== "object") return "Geçersiz veri";
  const { user_id, banned, reason } = body as Record<string, unknown>;
  if (!user_id || typeof user_id !== "string") return "user_id gerekli (string)";
  if (typeof banned !== "boolean") return "banned gerekli (boolean)";
  if (reason !== undefined && reason !== null && typeof reason !== "string") return "reason string olmalı";
  return { user_id, banned, reason: reason ?? undefined };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth check
  const authHdr = req.headers.get("Authorization") ?? "";
  const token = authHdr.startsWith("Bearer ") ? authHdr.slice(7) : "";
  const { data: userRes } = await admin.auth.getUser(token);
  const caller = userRes?.user;
  if (!caller) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Admin check
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Yasak — sadece yönetici" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rate limit: 5/dk
  const rlResponse = await rateLimit(caller.id, "admin-ban-user");
  if (rlResponse) return rlResponse;

  // Parse + validate body
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

  const { user_id, banned, reason } = validated;

  // Verify target user exists
  const { data: targetProfile, error: profErr } = await admin
    .from("profiles").select("id").eq("id", user_id).maybeSingle();

  if (profErr || !targetProfile) {
    return new Response(JSON.stringify({ error: "Kullanıcı bulunamadı" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Update public_profiles.is_active (upsert in case row doesn't exist)
  const { error: updateErr } = await admin
    .from("public_profiles")
    .upsert({ user_id, is_active: !banned }, { onConflict: "user_id" });

  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // If banning: cancel active/waiting blitz rooms + unlock balances
  let refundedRooms = 0;

  if (banned) {
    // Find active/waiting rooms created by this user
    const { data: rooms } = await admin
      .from("blitz_rooms")
      .select("id, entry_fee")
      .eq("created_by", user_id)
      .in("status", ["waiting", "active"]);

    if (rooms && rooms.length > 0) {
      const roomIds = rooms.map((r: { id: string }) => r.id);

      // Cancel all rooms
      await admin
        .from("blitz_rooms")
        .update({ status: "cancelled" })
        .in("id", roomIds);

      // Unlock balances for all participants in these rooms
      const { data: participants } = await admin
        .from("blitz_participants")
        .select("user_id, room_id")
        .in("room_id", roomIds);

      if (participants && participants.length > 0) {
        const uniqueUserIds = [...new Set(participants.map((p: { user_id: string }) => p.user_id))];
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, real_balance_locked")
          .in("id", uniqueUserIds);

        if (profiles) {
          const lockedPerUser: Record<string, number> = {};
          for (const p of participants) {
            const room = rooms.find((r: { id: string }) => r.id === p.room_id);
            if (room) {
              lockedPerUser[p.user_id] = (lockedPerUser[p.user_id] ?? 0) + Number(room.entry_fee);
            }
          }
          for (const profile of profiles) {
            const unlock = lockedPerUser[profile.id] ?? 0;
            if (unlock > 0) {
              const newLocked = Math.max(0, Number(profile.real_balance_locked) - unlock);
              await admin
                .from("profiles")
                .update({ real_balance_locked: newLocked })
                .eq("id", profile.id);
            }
          }
        }
      }

      refundedRooms = rooms.length;
    }
  }

  return new Response(JSON.stringify({ success: true, user_id, banned, refunded_rooms: refundedRooms }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
