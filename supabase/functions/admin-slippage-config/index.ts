// Admin tarafından slippage config okuma/yazma
// GET: tüm config'leri listele | POST: sembol config'i ekle/güncelle (UPSERT)
// Sadece 'admin' rolü erişebilir. service_role ile RLS bypass.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const VALID_MODES = ["fixed", "dynamic"] as const;

function validatePostBody(body: unknown): { symbol: string; max_slippage_pct: number; mode: string } | string {
  if (!body || typeof body !== "object") return "Geçersiz veri";
  const { symbol, max_slippage_pct, mode } = body as Record<string, unknown>;
  if (!symbol || typeof symbol !== "string") return "symbol gerekli (string)";
  if (typeof max_slippage_pct !== "number" || !isFinite(max_slippage_pct)) return "max_slippage_pct gerekli (number)";
  if (max_slippage_pct <= 0 || max_slippage_pct > 100) return "max_slippage_pct 0.01-100 arası olmalı";
  if (!mode || typeof mode !== "string" || !VALID_MODES.includes(mode as typeof VALID_MODES[number])) {
    return `mode gerekli: 'fixed' veya 'dynamic' olmalı`;
  }
  return { symbol, max_slippage_pct, mode };
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

  const rlResponse = await rateLimit(caller.id, "admin-slippage-config");
  if (rlResponse) return rlResponse;

  // GET: list all configs
  if (req.method === "GET") {
    const { data: configs, error } = await admin
      .from("slippage_config")
      .select("symbol, max_slippage_pct, mode, updated_at")
      .order("symbol");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ configs: configs ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // POST: upsert config
  let body: unknown;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Geçersiz JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const validated = validatePostBody(body);
  if (typeof validated === "string") {
    return new Response(JSON.stringify({ error: validated }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { symbol, max_slippage_pct, mode } = validated;

  const { data: config, error } = await admin
    .from("slippage_config")
    .upsert(
      { symbol, max_slippage_pct, mode },
      { onConflict: "symbol" }
    )
    .select("symbol, max_slippage_pct, mode, updated_at")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, config }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
