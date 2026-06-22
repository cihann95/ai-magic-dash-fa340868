import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const TIMEOUT_MS = 3000;

async function checkDatabase(supabaseUrl: string, serviceRoleKey: string): Promise<"ok" | "error"> {
  try {
    const client = createClient(supabaseUrl, serviceRoleKey);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)
    );
    const query = client.from("price_cache").select("symbol").limit(1);
    await Promise.race([query, timeout]);
    return "ok";
  } catch {
    return "error";
  }
}

async function checkRedis(): Promise<"ok" | "error" | "skipped"> {
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return "skipped";

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)
    );
    const fetchPromise = fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const resp = await Promise.race([fetchPromise, timeout]);
    return resp.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const [dbStatus, redisStatus] = await Promise.all([
    checkDatabase(supabaseUrl, serviceRoleKey),
    checkRedis(),
  ]);

  const allOk = dbStatus === "ok" && (redisStatus === "ok" || redisStatus === "skipped");

  const body = {
    status: allOk ? "ok" : "error",
    timestamp: new Date().toISOString(),
    version: Deno.env.get("GIT_COMMIT_HASH") ?? "unknown",
    checks: {
      database: dbStatus,
      redis: redisStatus,
    },
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: allOk ? 200 : 503,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
});
