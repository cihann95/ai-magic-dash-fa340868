// Weekly Digest — son 7 günün davranışsal özetini bir notification + coach_insight olarak yazar.
// Frontend client haftada en fazla 1 kere çağırır (profiles.last_weekly_digest_at kontrolü ile).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface DigestTrade {
  symbol: string;
  action: string;
  pnl: number | null;
  intent_tag: string | null;
  executed_at: string;
  plan_adherence: number | null;
}

interface EmotionalLog {
  mood: string;
  signal_type: string | null;
  created_at: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Throttle: haftada 1
    const { data: profile } = await admin.from("profiles")
      .select("last_weekly_digest_at, preferred_language, trader_persona")
      .eq("id", user.id).single();

    const lastAt = profile?.last_weekly_digest_at ? new Date(profile.last_weekly_digest_at) : null;
    if (lastAt && Date.now() - lastAt.getTime() < 6 * 24 * 60 * 60 * 1000) {
      return json({ skipped: true, reason: "already_sent_this_week", next_in_hours: Math.round((6 * 24 * 60 * 60 * 1000 - (Date.now() - lastAt.getTime())) / 3600000) });
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [tradesRes, emoRes] = await Promise.all([
      admin.from("trades").select("symbol, action, pnl, intent_tag, executed_at, plan_adherence")
        .eq("user_id", user.id).gte("executed_at", since).order("executed_at"),
      admin.from("emotional_logs").select("mood, signal_type, created_at")
        .eq("user_id", user.id).gte("created_at", since),
    ]);

    const trades = (tradesRes.data ?? []) as DigestTrade[];
    const closes = trades.filter((t) => t.action === "close");

    if (closes.length < 2) {
      return json({ skipped: true, reason: "not_enough_trades", count: closes.length });
    }

    const lang = (profile?.preferred_language ?? "tr") as "tr" | "en";

    // En iyi/en kötü
    const sorted = [...closes].sort((a, b) => Number(b.pnl ?? 0) - Number(a.pnl ?? 0));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    // Niyet bazlı
    const intentAgg: Record<string, { count: number; pnl: number }> = {};
    for (const t of closes) {
      const k = t.intent_tag ?? "untagged";
      const g = intentAgg[k] ?? { count: 0, pnl: 0 };
      g.count += 1; g.pnl += Number(t.pnl ?? 0);
      intentAgg[k] = g;
    }
    const bestIntent = Object.entries(intentAgg)
      .filter(([k]) => k !== "untagged")
      .sort((a, b) => (b[1].pnl / b[1].count) - (a[1].pnl / a[1].count))[0];

    // Mood
    const moods = (emoRes.data ?? []).filter((e: EmotionalLog) => e.mood);
    const moodCounts: Record<string, number> = {};
    for (const m of moods) moodCounts[m.mood] = (moodCounts[m.mood] ?? 0) + 1;
    const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];

    // Plan adherence ortalaması
    const planScores = closes.map((t) => Number(t.plan_adherence)).filter((n: number) => isFinite(n) && n > 0);
    const avgAdherence = planScores.length
      ? Math.round(planScores.reduce((a, b) => a + b, 0) / planScores.length)
      : null;

    const totalPnl = closes.reduce((a: number, t) => a + Number(t.pnl ?? 0), 0);
    const wins = closes.filter((t) => Number(t.pnl ?? 0) > 0).length;
    const winRate = Math.round((wins / closes.length) * 100);

    // Body
    const lines: string[] = [];
    if (lang === "tr") {
      lines.push(`📊 Bu hafta ${closes.length} işlem kapattın · ${winRate}% kazanç oranı · ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`);
      if (best && Number(best.pnl) > 0) lines.push(`🏆 En iyi: ${best.symbol} (+$${Number(best.pnl).toFixed(2)})`);
      if (worst && Number(worst.pnl) < 0) lines.push(`⚠️ En kötü: ${worst.symbol} ($${Number(worst.pnl).toFixed(2)})`);
      if (bestIntent) {
        const tagTr: Record<string, string> = { technical: "Teknik sinyal", news: "Haber", intuition: "Sezgi" };
        lines.push(`🎯 En kazandıran niyetin: "${tagTr[bestIntent[0]] ?? bestIntent[0]}" (ortalama ${(bestIntent[1].pnl / bestIntent[1].count >= 0 ? "+" : "")}$${(bestIntent[1].pnl / bestIntent[1].count).toFixed(2)})`);
      }
      if (dominantMood) {
        const mTr: Record<string, string> = { calm: "sakin 😌", focused: "odaklı 🎯", excited: "heyecanlı ⚡", angry: "kızgın 😤" };
        lines.push(`💭 Çoğunlukla ${mTr[dominantMood[0]] ?? dominantMood[0]} hissettin.`);
      }
      if (avgAdherence !== null) lines.push(`📐 Plan uyumu: %${avgAdherence}`);
    } else {
      lines.push(`📊 You closed ${closes.length} trades this week · ${winRate}% win rate · ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`);
      if (best && Number(best.pnl) > 0) lines.push(`🏆 Best: ${best.symbol} (+$${Number(best.pnl).toFixed(2)})`);
      if (worst && Number(worst.pnl) < 0) lines.push(`⚠️ Worst: ${worst.symbol} ($${Number(worst.pnl).toFixed(2)})`);
      if (bestIntent) lines.push(`🎯 Most profitable intent: "${bestIntent[0]}" (avg ${(bestIntent[1].pnl / bestIntent[1].count >= 0 ? "+" : "")}$${(bestIntent[1].pnl / bestIntent[1].count).toFixed(2)})`);
      if (dominantMood) lines.push(`💭 You felt mostly ${dominantMood[0]}.`);
      if (avgAdherence !== null) lines.push(`📐 Plan adherence: ${avgAdherence}%`);
    }

    const title = lang === "tr" ? "📅 Haftalık Ayna" : "📅 Weekly Mirror";
    const body = lines.join("\n");

    await admin.from("coach_insights").insert({
      user_id: user.id,
      category: "weekly_mirror",
      severity: "info",
      title,
      body,
      metadata: {
        period_days: 7,
        closes: closes.length,
        win_rate: winRate,
        total_pnl: +totalPnl.toFixed(2),
        avg_adherence: avgAdherence,
      },
    });

    await admin.from("notifications").insert({
      user_id: user.id,
      type: "weekly_mirror",
      title,
      body,
      link: "/coach",
      metadata: { closes: closes.length, total_pnl: +totalPnl.toFixed(2), win_rate: winRate },
    });

    await admin.from("profiles").update({ last_weekly_digest_at: new Date().toISOString() }).eq("id", user.id);

    return json({ success: true, closes: closes.length, total_pnl: +totalPnl.toFixed(2) });
  } catch (e) {
    console.error("weekly-digest error", e);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
