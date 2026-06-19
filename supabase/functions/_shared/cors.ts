/**
 * Shared CORS Headers for Edge Functions
 *
 * Provides a `corsHeaders` object and a `handleCors()` helper for OPTIONS
 * preflight requests. Origin is configurable via `CORS_ORIGIN` env var
 * (defaults to `*` in development, should be restricted in production).
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   import { corsHeaders, handleCors } from "../_shared/cors.ts";
 *
 *   Deno.serve(async (req) => {
 *     // Handle preflight
 *     const cors = handleCors(req);
 *     if (cors) return cors;
 *
 *     // ... your handler ...
 *     return new Response(JSON.stringify(body), {
 *       headers: { ...corsHeaders, "Content-Type": "application/json" },
 *     });
 *   });
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const DEFAULT_ORIGIN = Deno.env.get("CORS_ORIGIN") ?? "*";

/** Standard CORS response headers for HTTP Edge Functions. */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-sent-at, x-idempotency-key",
  "Access-Control-Max-Age": "86400",
};

/**
 * Handle an OPTIONS preflight request.
 *
 * Returns a 204 response with CORS headers if the method is OPTIONS,
 * or `null` otherwise — pass through to the main handler.
 *
 * @example
 *   const preflight = handleCors(req);
 *   if (preflight) return preflight;
 */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }
  return null;
}
