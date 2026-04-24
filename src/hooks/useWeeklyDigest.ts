// Haftada en fazla bir kez weekly-digest edge function'ını tetikler.
// Pazartesi sabahı veya 7+ gün geçmişse çalışır. Sessiz çalışır, hata fırlatmaz.
import { useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "weekly_digest_checked_at";

export function useWeeklyDigest() {
  const { user } = useApp();

  useEffect(() => {
    if (!user) return;
    // Aynı sekme açıkken tekrar çağırma
    const lastCheck = sessionStorage.getItem(SESSION_KEY);
    if (lastCheck && Date.now() - Number(lastCheck) < 60 * 60 * 1000) return;

    let cancelled = false;
    (async () => {
      try {
        const { data: profile } = await supabase.from("profiles")
          .select("last_weekly_digest_at").eq("id", user.id).maybeSingle();
        if (cancelled) return;

        const lastAt = profile?.last_weekly_digest_at
          ? new Date(profile.last_weekly_digest_at).getTime()
          : 0;
        const elapsed = Date.now() - lastAt;
        // 6.5 gün geçtiyse tetikle (edge function da kontrol ediyor)
        if (elapsed < 6.5 * 24 * 60 * 60 * 1000) return;

        sessionStorage.setItem(SESSION_KEY, String(Date.now()));
        await supabase.functions.invoke("weekly-digest").catch(() => null);
      } catch {
        // sessizce yut
      }
    })();
    return () => { cancelled = true; };
  }, [user]);
}
