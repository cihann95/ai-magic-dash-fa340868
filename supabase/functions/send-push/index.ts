// Web Push gönderici - VAPID ile imzalanmış push notification gönderir.
// notifications tablosuna yeni kayıt eklendiğinde DB trigger ile çağrılır.
// VAPID anahtarları yoksa sessizce çıkar (PWA opsiyonel).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@lumen.trade";

function b64urlToUint8(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function uint8ToB64url(u: Uint8Array): string {
  let s = ""; for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function importVapidKey(): Promise<CryptoKey> {
  // VAPID private key 32 byte raw scalar (base64url)
  const d = b64urlToUint8(VAPID_PRIVATE);
  const pub = b64urlToUint8(VAPID_PUBLIC);
  // x = bytes 1..33, y = bytes 33..65 of uncompressed pub
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("invalid vapid public key");
  const x = pub.slice(1, 33), y = pub.slice(33, 65);
  const jwk: JsonWebKey = {
    kty: "EC", crv: "P-256",
    d: uint8ToB64url(d), x: uint8ToB64url(x), y: uint8ToB64url(y),
    ext: true,
  };
  return await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function buildVapidJWT(audience: string): Promise<string> {
  const header = { alg: "ES256", typ: "JWT" };
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT };
  const enc = new TextEncoder();
  const h = uint8ToB64url(enc.encode(JSON.stringify(header)));
  const p = uint8ToB64url(enc.encode(JSON.stringify(payload)));
  const data = `${h}.${p}`;
  const key = await importVapidKey();
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(data)));
  return `${data}.${uint8ToB64url(sig)}`;
}

async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, _payload: object): Promise<number> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;
  try {
    const url = new URL(sub.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    let jwt: string;
    try {
      jwt = await buildVapidJWT(audience);
    } catch (e) {
      console.error(JSON.stringify({event: "vapid_jwt_error", error: e.message}));
      return -1;
    }
    // Push servisleri body'siz "tickle" çağrıyı kabul eder; gerçek payload encryption için web-push şifrelemesi gerekir
    // Burada body'siz tetikleme yapıyoruz; service worker'da fetch ile son notification'ı çekiyoruz.
    const r = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Authorization": `vapid t=${jwt}, k=${VAPID_PUBLIC}`,
        "TTL": "60",
        "Content-Length": "0",
      },
    });
    return r.status;
  } catch (e) {
    console.error("push send error", e);
    return -1;
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authHdr = req.headers.get("Authorization") ?? "";
  if (authHdr !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const start = Date.now();

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}));
    return new Response(JSON.stringify({ error: "Push bildirim ayarları eksik", code: "VAPID_NOT_CONFIGURED" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const { user_id, notification } = body;
    if (!user_id) {
      console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}));
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs } = await admin.from("push_subscriptions")
      .select("endpoint, p256dh, auth").eq("user_id", user_id);

    let sent = 0; let removed = 0;
    for (const s of subs ?? []) {
      const status = await sendPush(s, notification ?? {});
      if (status >= 200 && status < 300) sent++;
      else if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        removed++;
      }
    }
    console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}));
    return new Response(JSON.stringify({ success: true, sent, removed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-push error", e);
    console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}));
    return new Response(JSON.stringify({ error: "Sunucu hatası oluştu" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
