// Demo işlem yürütücü - Client'tan gelen fiyata GÜVENMEZ.
// Her zaman price_cache'ten anlık fiyatı okur ve stale/eksik veriyi reddeder.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
}

const STALE_MS = 5 * 60 * 1000; // 5 minutes

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

    const body: TradeRequest = await req.json();
    const { symbol, asset_class, side, quantity, position_id, executor = "demo" } = body;

    if (!symbol || !quantity || quantity <= 0) {
      return new Response(JSON.stringify({ error: "Geçersiz işlem parametreleri" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ========== GERÇEK FİYAT - price_cache ==========
    const { data: priceRow, error: priceErr } = await admin
      .from("price_cache")
      .select("price, updated_at")
      .eq("symbol", symbol)
      .single();

    if (priceErr || !priceRow) {
      return new Response(JSON.stringify({
        error: "Fiyat verisi bulunamadı, lütfen birkaç saniye sonra tekrar deneyin.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const priceAge = Date.now() - new Date(priceRow.updated_at).getTime();
    if (priceAge > STALE_MS) {
      return new Response(JSON.stringify({
        error: `Fiyat verisi güncel değil (${Math.round(priceAge / 1000)}s eski). Lütfen tekrar deneyin.`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const price = Number(priceRow.price);
    if (!isFinite(price) || price <= 0) {
      return new Response(JSON.stringify({ error: "Geçersiz fiyat verisi" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const total = Number((quantity * price).toFixed(2));

    const { data: profile, error: profileErr } = await admin
      .from("profiles").select("demo_balance").eq("id", user.id).single();
    if (profileErr || !profile) throw new Error("Profil bulunamadı");

    let pnl: number | null = null;
    let action: "open" | "close" = "open";
    let newBalance = Number(profile.demo_balance);

    if (position_id) {
      const { data: pos, error: posErr } = await admin
        .from("positions").select("*").eq("id", position_id).eq("user_id", user.id).single();
      if (posErr || !pos) throw new Error("Pozisyon bulunamadı");
      action = "close";
      const entry = Number(pos.entry_price);
      const qty = Number(pos.quantity);
      pnl = pos.side === "long" ? (price - entry) * qty : (entry - price) * qty;
      pnl = Number(pnl.toFixed(2));
      newBalance = Number((newBalance + Number((entry * qty).toFixed(2)) + pnl).toFixed(2));
      await admin.from("positions").delete().eq("id", position_id);
    } else {
      if (newBalance < total) {
        return new Response(JSON.stringify({ error: "Yetersiz bakiye" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      newBalance = Number((newBalance - total).toFixed(2));
      await admin.from("positions").insert({
        user_id: user.id,
        symbol, asset_class,
        side: side === "buy" ? "long" : "short",
        quantity, entry_price: price, current_price: price,
      });
    }

    await admin.from("profiles").update({ demo_balance: newBalance }).eq("id", user.id);

    await admin.from("trades").insert({
      user_id: user.id, symbol, asset_class, side, action, quantity, price, total, pnl, executor,
    });

    // ===== Notification =====
    await admin.from("notifications").insert({
      user_id: user.id,
      type: "trade_executed",
      title: action === "open"
        ? `${side === "buy" ? "🟢" : "🔴"} ${side.toUpperCase()} ${symbol}`
        : `✖ ${symbol} kapatıldı${pnl !== null ? ` (${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)})` : ""}`,
      body: `${quantity} @ $${price.toFixed(price < 5 ? 4 : 2)} • Toplam $${total.toFixed(2)}`,
      link: `/portfolio`,
      metadata: { symbol, side, action, qty: quantity, price, pnl },
    });

    // ===== GAMIFICATION =====
    const grantedAchievements: string[] = [];
    try {
      await admin.rpc("touch_streak", { _user_id: user.id });
      await admin.rpc("award_xp", { _user_id: user.id, _amount: 25 });

      const { data: stats } = await admin.from("user_stats").select("*").eq("user_id", user.id).single();
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
        }).eq("user_id", user.id);

        const tryGrant = async (code: string) => {
          const { data } = await admin.rpc("grant_achievement", { _user_id: user.id, _code: code });
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

        const { data: trades } = await admin.from("trades").select("pnl,executed_at")
          .eq("user_id", user.id).order("executed_at", { ascending: false }).limit(20);
        if (trades && trades.length >= 5) {
          let peak = newBalance;
          for (const t of trades) { peak = Math.max(peak, peak + Number(t.pnl ?? 0)); }
          const drawdown = (peak - newBalance) / peak;
          const recent5 = trades.slice(0, 5).reduce((a, t) => a + Number(t.pnl ?? 0), 0);
          if (drawdown > 0.1 && recent5 > 0 && (recent5 / Math.abs(peak - newBalance + 1)) >= 0.2) {
            await tryGrant("comeback");
          }
        }

        const newLevel = Math.floor(Math.sqrt((stats.xp + 25) / 100)) + 1;
        if (newLevel >= 50) await tryGrant("legend");
      }

      // Achievement notifications
      for (const code of grantedAchievements) {
        await admin.from("notifications").insert({
          user_id: user.id,
          type: "achievement",
          title: `🏆 Yeni rozet kazandın!`,
          body: code,
          link: `/achievements`,
          metadata: { code },
        });
      }
    } catch (gErr) {
      console.error("gamification error (non-fatal)", gErr);
    }

    return new Response(JSON.stringify({
      success: true, balance: newBalance, pnl, price,
      achievements: grantedAchievements,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("execute-trade error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
