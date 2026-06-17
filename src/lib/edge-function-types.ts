// Edge Function Response Types — T3.2
// Bu dosya, supabase.functions.invoke() çağrılarından dönen
// response tiplerini tanımlar. Tip güvensizliğini ortadan kaldırır.

import type { Tables } from "../integrations/supabase/types";

// ─── AI Edge Functions (AccountAIPanel) ───

export interface AiAnalyzeResponse {
  analysis: string;
  error?: string;
}

export interface AiStrategyResponse {
  suggestion: string;
  error?: string;
}

export interface DailyBriefResponse {
  content: string;
  error?: string;
}

export interface NewsFeedResponse {
  items: Array<{
    title: string;
    source: string;
    url: string;
    published_at: string;
    summary?: string;
    sentiment?: "bullish" | "bearish" | "neutral";
  }>;
  error?: string;
}

// ─── Execute Trade (ChartPanel + OpenPositionsPanel) ───

export interface ExecuteTradeResponse {
  price: number;
  balance?: number;
  pnl?: number;
  achievements?: string[];
  error?: string;
}

// ─── Position Types (align custom with generated) ───

export type DbPosition = Tables<'positions'>;

export interface PositionDisplay extends DbPosition {
  pending?: boolean;
}
