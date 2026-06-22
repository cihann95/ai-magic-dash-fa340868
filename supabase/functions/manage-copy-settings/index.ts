// Copy trading ayarları yönetimi
// Client-side copy_settings insert/update yasaktır; tüm write'lar bu Edge Function üzerinden service_role ile yapılır.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { checkBodySize } from "../_shared/body-size-limit.ts";
import { logObservability, logger } from "../_shared/logger.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const CopySettingsSchema = z.object({
  leader_id: z.string().uuid(),
  enabled: z.boolean(),
  ratio: z.number().min(0.1).max(10).optional().default(1.0),
  max_position_usd: z.number().min(10).max(100_000).optional().default(5000),
  asset_classes: z.array(z.string()).optional(),
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

    const rlResponse = await rateLimit(user.id, "manage-copy-settings");
    if (rlResponse) return rlResponse;

    const bodySizeError = await checkBodySize(req);
    if (bodySizeError) return bodySizeError;

    const rawBody = await req.json().catch(() => null);
    const parsed = CopySettingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", code: "VALIDATION_ERROR", details: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { leader_id, enabled, ratio, max_position_usd, asset_classes } = parsed.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Leader'ın copyable olduğunu kontrol et
    const { data: profile } = await admin
      .from("public_profiles")
      .select("copyable")
      .eq("user_id", leader_id)
      .maybeSingle();

    if (!profile || !profile.copyable) {
      return new Response(JSON.stringify({ error: "Bu trader kopyalanamıyor", code: "NOT_COPYABLE" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Takip ediyor mu kontrol et
    const { data: follow } = await admin
      .from("followers")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", leader_id)
      .maybeSingle();

    if (!follow) {
      return new Response(JSON.stringify({ error: "Önce trader'ı takip etmelisin", code: "NOT_FOLLOWING" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UPSERT
    const { error } = await admin.from("copy_settings").upsert({
      follower_id: user.id,
      leader_id,
      enabled,
      ratio,
      max_position_usd,
      asset_classes: asset_classes ?? [],
    }, { onConflict: "follower_id,leader_id" });

    if (error) {
      logger.error("copy_settings upsert failed", { error: error.message, user_id: user.id, leader_id });
      return new Response(JSON.stringify({ error: "Copy ayarları kaydedilemedi", code: "COPY_SAVE_FAILED", retryable: true }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logObservability(admin, "manage-copy-settings", "Copy settings updated", {
      user_id: user.id, leader_id, enabled, ratio,
    });

    return new Response(JSON.stringify({ success: true, action: enabled ? "activated" : "deactivated" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const durationMs = Date.now() - start;
    logger.error("manage-copy-settings unhandled", { error: String(e), duration_ms: durationMs });
    return new Response(JSON.stringify({ error: "Sunucu hatası oluştu", code: "INTERNAL_ERROR" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
