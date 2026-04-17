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
  price: number;
  position_id?: string; // when closing
  executor?: "demo" | "alpaca";
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

    const body: TradeRequest = await req.json();
    const { symbol, asset_class, side, quantity, price, position_id, executor = "demo" } = body;

    if (!symbol || !quantity || quantity <= 0 || !price || price <= 0) {
      return new Response(JSON.stringify({ error: "Geçersiz işlem parametreleri" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const total = Number((quantity * price).toFixed(2));

    // Use service role for atomic ops
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile, error: profileErr } = await admin
      .from("profiles").select("demo_balance").eq("id", user.id).single();
    if (profileErr || !profile) throw new Error("Profil bulunamadı");

    let pnl: number | null = null;
    let action: "open" | "close" = "open";
    let newBalance = Number(profile.demo_balance);

    if (position_id) {
      // Closing a position
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
      // Opening
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

    return new Response(JSON.stringify({ success: true, balance: newBalance, pnl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("execute-trade error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
