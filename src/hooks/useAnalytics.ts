import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AnalyticsEventType =
  | "blitz_created"
  | "blitz_joined"
  | "blitz_started"
  | "blitz_finished"
  | "blitz_abandoned"
  | "payout_completed"
  | "payout_failed"
  | "ana_sahne_viewed"
  | "emoji_sent"
  | "spectator_chat_sent";

export function useAnalytics() {
  const track = useCallback(async (
    eventType: AnalyticsEventType,
    payload?: Record<string, unknown>,
  ) => {
    try {
      await supabase.rpc("insert_analytics_event", {
        _event_type: eventType,
        _payload: payload ?? {},
      });
    } catch {
      console.warn("analytics: failed to track", eventType);
    }
  }, []);

  return { track };
}
