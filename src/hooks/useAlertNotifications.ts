// Realtime fiyat alarmı dinleyicisi - tetiklenen alarmları toast ile gösterir
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useApp } from "@/contexts/AppContext";

export function useAlertNotifications() {
  const { user, lang } = useApp();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("price_alerts_user")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "price_alerts", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const row = payload.new;
          if (row?.triggered) {
            // Browser notification
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(
                lang === "tr" ? "Fiyat Alarmı" : "Price Alert",
                {
                  body: `${row.symbol} ${row.direction === "above" ? "≥" : "≤"} ${row.target_price}`,
                  icon: "/favicon.ico",
                }
              );
            }
            toast({
              title: lang === "tr" ? "🔔 Fiyat Alarmı" : "🔔 Price Alert",
              description: `${row.symbol} ${row.direction === "above" ? "≥" : "≤"} ${row.target_price}`,
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, lang]);
}
