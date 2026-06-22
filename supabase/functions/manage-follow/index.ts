// Takip etme/bırakma yönetimi
// Client-side followers insert/delete yasaktır; tüm write'lar bu Edge Function üzerinden service_role ile yapılır.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { checkBodySize } from "../_shared/body-size-limit.ts";
import { logObservability, logger } from "../_shared/logger.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const ManageFollowSchema = z.object({
  action: z.enum(["follow", "unfollow"]),
  leader_id: z.string().uuid(),
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const start = Date.now();
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Yetkisiz erişim", code: "UNAUTHORIZED" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Yetkisiz erişim", code: "UNAUTHORIZED" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rlResponse = await rateLimit(user.id, "manage-follow");
    if (rlResponse) return rlResponse;

    const bodySizeError = await checkBodySize(req);
    if (bodySizeError) return bodySizeError;

    const rawBody = await req.json().catch(() => null);
    const parsed = ManageFollowSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", code: "VALIDATION_ERROR", details: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, leader_id } = parsed.data;

    // Self-follow kontrolü
    if (user.id === leader_id) {
      return new Response(JSON.stringify({ error: "Kendini takip edemezsin", code: "SELF_FOLLOW" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "follow") {
      // Zaten takip ediyor mu kontrol et
      const { data: existing } = await admin
        .from("followers")
        .select("id")
        .eq("follower_id", user.id)
        .eq("following_id", leader_id)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: "Zaten takip ediliyor", code: "ALREADY_FOLLOWING" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await admin.from("followers").insert({
        follower_id: user.id,
        following_id: leader_id,
      });

      if (error) {
        logger.error("follow insert failed", { error: error.message, user_id: user.id, leader_id });
        return new Response(JSON.stringify({ error: "Takip edilemedi", code: "FOLLOW_FAILED", retryable: true }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      logObservability(admin, "manage-follow", "User followed", {
        user_id: user.id, leader_id, action: "follow",
      });

      return new Response(JSON.stringify({ success: true, action: "followed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Unfollow
      const { error } = await admin
        .from("followers")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", leader_id);

      if (error) {
        logger.error("unfollow delete failed", { error: error.message, user_id: user.id, leader_id });
        return new Response(JSON.stringify({ error: "Takipten çıkarılamadı", code: "UNFOLLOW_FAILED", retryable: true }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      logObservability(admin, "manage-follow", "User unfollowed", {
        user_id: user.id, leader_id, action: "unfollow",
      });

      return new Response(JSON.stringify({ success: true, action: "unfollowed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    const durationMs = Date.now() - start;
    logger.error("manage-follow unhandled", { error: String(e), duration_ms: durationMs });
    return new Response(JSON.stringify({ error: "Sunucu hatası oluştu", code: "INTERNAL_ERROR" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
