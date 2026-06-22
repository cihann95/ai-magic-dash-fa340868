// Sipariş yönetimi — place / cancel
// Client-side orders insert/update yasaktır; tüm write'lar bu Edge Function üzerinden service_role ile yapılır.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { checkBodySize } from "../_shared/body-size-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ASSET_CLASSES = new Set(["crypto", "stocks", "forex", "commodities", "indices", "etf"]);
const ORDER_TYPES = new Set(["limit", "stop", "take_profit", "stop_loss"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface PlaceOrderRequest {
  action: "place";
  symbol: string;
  asset_class: string;
  order_type: string;
  side: "buy" | "sell";
  quantity: number;
  trigger_price: number;
}

interface CancelOrderRequest {
  action: "cancel";
  order_id: string;
}

type ManageOrderRequest = PlaceOrderRequest | CancelOrderRequest;

function parseRequest(payload: unknown): { ok: true; data: ManageOrderRequest } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Geçersiz istek parametreleri" };
  }

  const raw = payload as Record<string, unknown>;
  const action = raw.action;

  if (action === "place") {
    const symbol = typeof raw.symbol === "string" ? raw.symbol.trim().toUpperCase() : "";
    const asset_class = typeof raw.asset_class === "string" ? raw.asset_class.trim().toLowerCase() : "";
    const order_type = typeof raw.order_type === "string" ? raw.order_type.trim().toLowerCase() : "";
    const side = raw.side;
    const quantity = Number(raw.quantity);
    const trigger_price = Number(raw.trigger_price);

    if (!symbol || symbol.length > 24) return { ok: false, error: "Geçersiz sembol" };
    if (!ALLOWED_ASSET_CLASSES.has(asset_class)) return { ok: false, error: "Geçersiz varlık sınıfı" };
    if (!ORDER_TYPES.has(order_type)) return { ok: false, error: "Geçersiz emir tipi" };
    if (side !== "buy" && side !== "sell") return { ok: false, error: "Geçersiz işlem yönü" };
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000_000) {
      return { ok: false, error: "Geçersiz miktar" };
    }
    if (!Number.isFinite(trigger_price) || trigger_price <= 0) {
      return { ok: false, error: "Geçersiz tetikleme fiyatı" };
    }

    return {
      ok: true,
      data: { action: "place", symbol, asset_class, order_type, side, quantity, trigger_price },
    };
  }

  if (action === "cancel") {
    const order_id = typeof raw.order_id === "string" ? raw.order_id.trim() : "";
    if (!order_id || !UUID_RE.test(order_id)) {
      return { ok: false, error: "Geçersiz emir kimliği" };
    }
    return { ok: true, data: { action: "cancel", order_id } };
  }

  return { ok: false, error: "Geçersiz eylem. 'place' veya 'cancel' bekleniyor." };
}

async function placeOrder(admin: ReturnType<typeof createClient>, userId: string, body: PlaceOrderRequest) {
  const { symbol, asset_class, order_type, side, quantity, trigger_price } = body;

  const { data, error } = await admin
    .from("orders")
    .insert({
      user_id: userId,
      symbol,
      asset_class,
      order_type,
      side,
      quantity,
      trigger_price,
      status: "open",
    })
    .select("id")
    .single();

  if (error) {
    console.error(JSON.stringify({ event: "order_insert_failed", error: error.message, user_id: userId, symbol }));
    return { ok: false as const, error: "Emir oluşturulamadı", code: "ORDER_CREATE_FAILED", retryable: true };
  }

  return { ok: true as const, order_id: data.id };
}

async function cancelOrder(admin: ReturnType<typeof createClient>, userId: string, body: CancelOrderRequest) {
  const { order_id } = body;

  // Verify ownership and status
  const { data: existing, error: fetchError } = await admin
    .from("orders")
    .select("id, status, user_id")
    .eq("id", order_id)
    .single();

  if (fetchError || !existing) {
    return { ok: false as const, error: "Emir bulunamadı", code: "ORDER_NOT_FOUND" };
  }
  if (existing.user_id !== userId) {
    return { ok: false as const, error: "Bu emir size ait değil", code: "FORBIDDEN" };
  }
  if (existing.status !== "open") {
    return { ok: false as const, error: "Emir zaten kapatılmış", code: "ORDER_NOT_OPEN" };
  }

  const { error } = await admin
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", order_id);

  if (error) {
    console.error(JSON.stringify({ event: "order_cancel_failed", error: error.message, user_id: userId, order_id }));
    return { ok: false as const, error: "Emir kapatılamadı", code: "ORDER_CANCEL_FAILED", retryable: true };
  }

  return { ok: true as const, order_id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const rlResponse = await rateLimit(user.id, "manage-order");
    if (rlResponse) return rlResponse;

    const bodySizeError = await checkBodySize(req);
    if (bodySizeError) return bodySizeError;

    const rawBody = await req.json().catch(() => null);
    const parsed = parseRequest(rawBody);
    if (!parsed.ok) {
      return new Response(JSON.stringify({ error: parsed.error, code: "INVALID_REQUEST" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let result;
    if (parsed.data.action === "place") {
      result = await placeOrder(admin, user.id, parsed.data);
    } else {
      result = await cancelOrder(admin, user.id, parsed.data);
    }

    if (!result.ok) {
      const status = result.code === "FORBIDDEN" || result.code === "ORDER_NOT_FOUND" ? 403 : 400;
      return new Response(JSON.stringify({ error: result.error, code: result.code, retryable: (result as any).retryable ?? false }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("manage-order error", e);
    return new Response(JSON.stringify({ error: "Sunucu hatası oluştu", code: "INTERNAL_ERROR" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
