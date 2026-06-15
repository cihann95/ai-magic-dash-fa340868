// Demo işlem yürütücü - Client'tan gelen fiyata GÜVENMEZ.
// Her zaman price_cache'ten anlık fiyatı okur ve stale/eksik veriyi reddeder.
// Trade tamamlandığında copy-trader'lara fan-out yapar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { Admin } from "../_shared/blitz-types.ts";
import { rateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TradeRequest {
  symbol: string;
  asset_class: string;
  side: "buy" | "sell";
  quantity: number;
  position_id?: string;
  executor?: "demo" | "alpaca";
  copied_from?: string;
  leader_user_id?: string;
  intent_tag?: string | null;
  intent_note?: string | null;
  planned_tp?: number | null;
  planned_sl?: number | null;
}

interface PublicTradeRequest {
  symbol: string;
  asset_class: string;
  side: "buy" | "sell";
  quantity: number;
  position_id?: string;
  intent_tag?: string | null;
  intent_note?: string | null;
  planned_tp?: number | null;
  planned_sl?: number | null;
}

interface OpenTrade {
  planned_tp: number | null;
  planned_sl: number | null;
  intent_tag: string | null;
  executed_at: string;
}

const STALE_MS = 5 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ASSET_CLASSES = new Set(["crypto", "stocks", "forex", "commodities", "indices", "etf"]);

function sanitizeNullableText(value: unknown, maxLen: number) {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : null;
}

function sanitizeNullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parsePublicTradeRequest(payload: unknown): { ok: true; data: PublicTradeRequest } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Geçersiz işlem parametreleri" };
  }

  const raw = payload as Record<string, unknown>;
  if (raw.copied_from != null || raw.leader_user_id != null) {
    return { ok: false, error: "Kopya işlem alanları istemciden gönderilemez" };
  }

  const symbol = typeof raw.symbol === "string" ? raw.symbol.trim().toUpperCase() : "";
  const asset_class = typeof raw.asset_class === "string" ? raw.asset_class.trim().toLowerCase() : "";
  const side = raw.side;
  const quantity = Number(raw.quantity);
  const position_id = typeof raw.position_id === "string" ? raw.position_id.trim() : undefined;

  if (!symbol || symbol.length > 24) return { ok: false, error: "Geçersiz sembol" };
  if (!ALLOWED_ASSET_CLASSES.has(asset_class)) return { ok: false, error: "Geçersiz varlık sınıfı" };
  if (side !== "buy" && side !== "sell") return { ok: false, error: "Geçersiz işlem yönü" };
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000000) {
    return { ok: false, error: "Geçersiz miktar" };
  }
  if (position_id && !UUID_RE.test(position_id)) return { ok: false, error: "Geçersiz pozisyon kimliği" };

  const planned_tp = sanitizeNullableNumber(raw.planned_tp);
  const planned_sl = sanitizeNullableNumber(raw.planned_sl);
  if ((raw.planned_tp != null && planned_tp == null) || (raw.planned_sl != null && planned_sl == null)) {
    return { ok: false, error: "Geçersiz TP/SL değeri" };
  }

  return {
    ok: true,
    data: {
      symbol,
      asset_class,
      side,
      quantity,
      position_id,
      intent_tag: sanitizeNullableText(raw.intent_tag, 50),
      intent_note: sanitizeNullableText(raw.intent_note, 500),
      planned_tp,
      planned_sl,
    },
  };
}

async function executeOne(admin: Admin, userId: string, body: TradeRequest, opts: { fanOut: boolean }) {
  const { symbol, asset_class, side, quantity, position_id, executor = "demo", copied_from, leader_user_id, intent_tag, intent_note, planned_tp, planned_sl } = body;

  // ========== GERÇEK FİYAT - price_cache ==========
  const { data: priceRow, error: priceErr } = await admin
    .from("price_cache")
    .select("price, updated_at")
    .eq("symbol", symbol)
    .single();

  if (priceErr || !priceRow) {
    return { ok: false as const, error: "Fiyat verisi bulunamadı, lütfen birkaç saniye sonra tekrar deneyin." };
  }
  const priceAge = Date.now() - new Date(priceRow.updated_at).getTime();
  if (priceAge > STALE_MS) {
    return { ok: false as const, error: `Fiyat verisi güncel değil (${Math.round(priceAge / 1000)}s eski).` };
  }
  const price = Number(priceRow.price);
  if (!isFinite(price) || price <= 0) return { ok: false as const, error: "Geçersiz fiyat verisi" };

  const total = Number((quantity * price).toFixed(2));

  const { data: profile, error: profileErr } = await admin.from("profiles")
    .select("demo_balance").eq("id", userId).single();
  if (profileErr || !profile) return { ok: false as const, error: "Profil bulunamadı" };

  let pnl: number | null = null;
  let action: "open" | "close" = "open";
  let newBalance = Number(profile.demo_balance);
  let planAdherence: number | null = null;
  let openTrade: OpenTrade | null = null;

  if (position_id) {
    const { data: pos } = await admin.from("positions").select("*").eq("id", position_id).eq("user_id", userId).single();
    if (!pos) return { ok: false as const, error: "Pozisyon bulunamadı" };
    if (pos.closed_at !== null) return { ok: false as const, error: "Pozisyon zaten kapatılmış" };

    // Race condition fix: atomik optimistic lock via closed_at
    // Birden fazla eş zamanlı istek.closed_at'i aynı anda set edemez —
    // sadece biri başarılı olur, diğerleri 0 satır etkilenir.
    const { error: lockErr } = await admin.from("positions")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", position_id)
      .eq("user_id", userId)
      .is("closed_at", null);
    if (lockErr) return { ok: false as const, error: "Pozisyon kapatılamadı (race condition)" };

    action = "close";
    const entry = Number(pos.entry_price);
    const qty = Number(pos.quantity);
    pnl = pos.side === "long" ? (price - entry) * qty : (entry - price) * qty;
    pnl = Number(pnl.toFixed(2));
    newBalance = Number((newBalance + Number((entry * qty).toFixed(2)) + pnl).toFixed(2));

    // Plan uyumu: bu pozisyonun OPEN trade'inde planned_tp/sl varsa skor üret
    const { data: opens } = await admin.from("trades")
      .select("planned_tp, planned_sl, intent_tag, executed_at")
      .eq("user_id", userId).eq("symbol", symbol).eq("action", "open")
      .order("executed_at", { ascending: false }).limit(1);
    openTrade = opens?.[0] ?? null;
    if (openTrade && (openTrade.planned_tp || openTrade.planned_sl)) {
      const tp = openTrade.planned_tp ? Number(openTrade.planned_tp) : null;
      const sl = openTrade.planned_sl ? Number(openTrade.planned_sl) : null;
      const isLong = pos.side === "long";
      // Hedef vurulmuş mu?
      const scoreParts: number[] = [];
      if (tp != null) {
        const reachedTP = isLong ? price >= tp : price <= tp;
        if (reachedTP) {
          scoreParts.push(100);
        } else {
          // Hedefe yakınlık: 0 -> entry, 100 -> tp
          const moved = Math.abs(price - entry);
          const distance = Math.abs(tp - entry);
          scoreParts.push(distance > 0 ? Math.max(0, Math.min(100, Math.round((moved / distance) * 100))) : 0);
        }
      }
      if (sl != null) {
        const breachedSL = isLong ? price <= sl : price >= sl;
        // SL'e gelmeden çıkmak iyi (100), SL'i geçmek kötü
        scoreParts.push(breachedSL ? 0 : 100);
      }
      planAdherence = scoreParts.length
        ? Math.round(scoreParts.reduce((a, b) => a + b, 0) / scoreParts.length)
        : null;
    }
    await admin.from("positions").delete().eq("id", position_id);
  } else {
    if (newBalance < total) return { ok: false as const, error: "Yetersiz bakiye" };
    newBalance = Number((newBalance - total).toFixed(2));
    await admin.from("positions").insert({
      user_id: userId, symbol, asset_class,
      side: side === "buy" ? "long" : "short",
      quantity, entry_price: price, current_price: price,
    });
  }

  await admin.from("profiles").update({ demo_balance: newBalance }).eq("id", userId);

  const { data: tradeRow } = await admin.from("trades").insert({
    user_id: userId, symbol, asset_class, side, action, quantity, price, total, pnl, executor,
    copied_from: copied_from ?? null,
    leader_user_id: leader_user_id ?? null,
    intent_tag: intent_tag ?? (action === "close" ? openTrade?.intent_tag ?? null : null),
    intent_note: intent_note ?? null,
    planned_tp: action === "open" ? (planned_tp ?? null) : null,
    planned_sl: action === "open" ? (planned_sl ?? null) : null,
    plan_adherence: action === "close" ? planAdherence : null,
  }).select("id").single();

  // Notification (close için plan uyum mesajı eklenir)
  let closeBody = `${quantity} @ $${price.toFixed(price < 5 ? 4 : 2)} • Toplam $${total.toFixed(2)}${copied_from ? " (Copy-Trade)" : ""}`;
  if (action === "close" && planAdherence !== null) {
    closeBody += ` • 📐 Plana uyum: %${planAdherence}`;
  }
  await admin.from("notifications").insert({
    user_id: userId,
    type: "trade_executed",
    title: action === "open"
      ? `${side === "buy" ? "🟢" : "🔴"} ${side.toUpperCase()} ${symbol}${copied_from ? " 🔁" : ""}`
      : `✖ ${symbol} kapatıldı${pnl !== null ? ` (${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)})` : ""}`,
    body: closeBody,
    link: `/portfolio`,
    metadata: { symbol, side, action, qty: quantity, price, pnl, copied_from, plan_adherence: planAdherence },
  });

  // Gamification (sadece kullanıcının kendi trade'i için, copy-trade'ler de sayılır)
  const grantedAchievements: string[] = [];
  try {
    await admin.rpc("touch_streak", { _user_id: userId });
    await admin.rpc("award_xp", { _user_id: userId, _amount: 25 });

    const { data: stats } = await admin.from("user_stats").select("*").eq("user_id", userId).single();
    if (stats) {
      const newTotalTrades = (stats.total_trades ?? 0) + 1;
      const newProfitable = (stats.profitable_trades ?? 0) + (pnl !== null && pnl > 0 ? 1 : 0);
      const newTotalPnl = Number(stats.total_pnl ?? 0) + (pnl ?? 0);
      const newBest = Math.max(Number(stats.best_trade_pnl ?? 0), pnl ?? 0);
      const ac = new Set<string>(stats.asset_classes_traded ?? []);
      ac.add(asset_class);
      await admin.from("user_stats").update({
        total_trades: newTotalTrades,
        profitable_trades: newProfitable,
        total_pnl: +newTotalPnl.toFixed(2),
        best_trade_pnl: +newBest.toFixed(2),
        asset_classes_traded: Array.from(ac),
      }).eq("user_id", userId);

      const tryGrant = async (code: string) => {
        const { data } = await admin.rpc("grant_achievement", { _user_id: userId, _code: code });
        if (data === true) grantedAchievements.push(code);
      };

      if (newTotalTrades === 1) await tryGrant("first_trade");
      if (pnl !== null && pnl > 0 && newProfitable === 1) await tryGrant("first_profit");
      if (newProfitable >= 10) await tryGrant("ten_profits");
      if (ac.size >= 5) await tryGrant("diversified");
      if (pnl !== null && pnl >= 1000) await tryGrant("big_winner");
      if (total >= 50000) await tryGrant("whale");
      const hour = new Date().getUTCHours();
      if (hour >= 2 && hour < 5) await tryGrant("night_owl");
    }

    for (const code of grantedAchievements) {
      await admin.from("notifications").insert({
        user_id: userId, type: "achievement",
        title: `🏆 Yeni rozet kazandın!`, body: code,
        link: `/achievements`, metadata: { code },
      });
    }
  } catch (gErr) {
    console.error("gamification error", gErr);
  }

  // ===== AI MIRROR - kapanan trade'ler için davranış aynası =====
  // Sadece kullanıcının kendi trade'i (copy değil) ve close action için
  if (action === "close" && !copied_from && tradeRow?.id) {
    // fire-and-forget - response beklemiyoruz, kullanıcı akışını bloklamasın
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/trade-mirror`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ user_id: userId, trade_id: tradeRow.id }),
    }).catch((e) => console.warn("mirror invoke failed", e));
  }

  // ===== COPY-TRADE FAN-OUT =====
  // Sadece üst seviye trade'ler (kendi trade'i, copy değil) için fan-out
  if (opts.fanOut && !copied_from && tradeRow?.id) {
    try {
      const { data: followers } = await admin
        .from("copy_settings")
        .select("follower_id, ratio, max_position_usd, asset_classes")
        .eq("leader_id", userId)
        .eq("enabled", true);

      for (const f of followers ?? []) {
        if (!(f.asset_classes as string[]).includes(asset_class)) continue;
        const followerQty = Math.max(0, +(quantity * Number(f.ratio)).toFixed(8));
        if (followerQty <= 0) continue;
        const followerNotional = followerQty * price;
        const cappedQty = followerNotional > Number(f.max_position_usd)
          ? +(Number(f.max_position_usd) / price).toFixed(8)
          : followerQty;
        if (cappedQty <= 0) continue;

        // Açık pozisyonu kapatma copy'si: takipçide eşleşen pozisyon var mı?
        let copyPositionId: string | undefined;
        if (action === "close") {
          const { data: matchPos } = await admin.from("positions")
            .select("id").eq("user_id", f.follower_id).eq("symbol", symbol)
            .eq("side", side === "buy" ? "short" : "long").maybeSingle();
          if (!matchPos) continue;
          copyPositionId = matchPos.id;
        }

        await executeOne(admin, f.follower_id, {
          symbol, asset_class, side, quantity: cappedQty,
          position_id: copyPositionId, executor: "demo",
          copied_from: tradeRow.id, leader_user_id: userId,
        }, { fanOut: false });
      }
    } catch (cErr) {
      console.error("copy-trade fan-out error", cErr);
    }
  }

  return { ok: true as const, balance: newBalance, pnl, price, achievements: grantedAchievements, trade_id: tradeRow?.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rlResponse = await rateLimit(user.id, "execute-trade");
    if (rlResponse) return rlResponse;

    const parsedBody = parsePublicTradeRequest(await req.json().catch(() => null));
    if (!parsedBody.ok) {
      return new Response(JSON.stringify({ error: parsedBody.error }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body: TradeRequest = parsedBody.data;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const result = await executeOne(admin, user.id, body, { fanOut: true });
    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("execute-trade error", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
