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
  success?: boolean;
  price: number;
  balance?: number;
  pnl?: number;
  achievements?: string[];
  error?: string;
  trade_id?: string;
}

// ─── Position Types (align custom with generated) ───

export type DbPosition = Tables<'positions'>;

export interface PositionDisplay extends DbPosition {
  pending?: boolean;
}

// ─── Admin Edge Functions (Task 7) ───

export interface AdminUser {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  demo_balance: number;
  real_balance: number;
  real_balance_locked: number;
  created_at: string;
  role: "admin" | "user" | null;
  username: string | null;
  is_active: boolean | null;
}

export interface AdminListUsersResponse {
  users: AdminUser[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminSetUserRoleRequest {
  user_id: string;
  role: "admin" | "user";
}

export interface AdminSetUserRoleResponse {
  success: boolean;
  user_id: string;
  role: "admin" | "user";
}

export interface AdminBanUserRequest {
  user_id: string;
  banned: boolean;
  reason?: string;
}

export interface AdminBanUserResponse {
  success: boolean;
  user_id: string;
  banned: boolean;
  refunded_rooms: number;
}

// ─── Admin Edge Functions Batch B (Task 8) ───

export interface AdminCancelRoomRequest {
  room_id: string;
  reason?: string;
}

export interface AdminCancelRoomResponse {
  success: boolean;
  room_id: string;
  refund_count: number;
}

export interface AdminSettleRoomRequest {
  room_id: string;
}

export interface AdminSettleRoomResponse {
  success: boolean;
  already_settled?: boolean;
  room_id?: string;
  winner_id?: string | null;
  prize?: number;
  fee?: number;
  participant_count?: number;
}

export interface AdminSlippageConfigRequest {
  symbol: string;
  max_slippage_pct: number;
  mode: "fixed" | "dynamic";
}

export interface AdminSlippageConfigResponse {
  success: boolean;
  config: {
    symbol: string;
    max_slippage_pct: number;
    mode: string;
    updated_at: string;
  };
}
