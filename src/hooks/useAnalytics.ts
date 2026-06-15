import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The `insert_analytics_event` RPC exists in the database but is not included
 * in the auto-generated Supabase types. We declare a narrow type that captures
 * the contract we need, avoiding `as any`.
 */
interface AnalyticsRpcClient {
  rpc(
    fn: string,
    params?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
}

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
      // Cast once to the narrow analytics RPC client type (insert_analytics_event
      // is not in generated Supabase types).
      const analyticsClient = supabase as unknown as AnalyticsRpcClient;
      await analyticsClient.rpc("insert_analytics_event", {
        _event_type: eventType,
        _payload: payload ?? {},
      });
    } catch {
      console.warn("analytics: failed to track", eventType);
    }
  }, []);

  return { track };
}
