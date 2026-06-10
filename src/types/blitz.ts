// Production Blitz domain types — single source of truth.
// Edge functions mirror these in supabase/functions/_shared/blitz-types.ts
// (Deno can't import from src/).

export type BlitzStatus =
  | "waiting"
  | "active"
  | "settling"
  | "finished"
  | "cancelled";

export type BlitzMode = "public" | "private";
export type BlitzSide = "long" | "short";

export interface BlitzRoom {
  id: string;
  symbol: string;
  entry_fee: number;
  status: BlitzStatus;
  mode: BlitzMode;
  invite_code: string | null;
  max_players: number;
  starts_at: string | null;
  ends_at: string | null;
  start_price: number | null;
  winner_id: string | null;
  pot: number;
  fee_collected: number;
  created_by: string | null;
}

export interface BlitzParticipant {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  final_pnl: number | null;
  rank: number | null;
}

export interface BlitzOrder {
  id: string;
  room_id: string;
  user_id: string;
  side: BlitzSide;
  amount: number;
  entry_price: number;
  exit_price: number | null;
  pnl: number | null;
  opened_at: string;
  closed_at: string | null;
  idempotency_key?: string | null;
}

export interface MatchmakeRequest {
  mode: "quick" | "create_private" | "cancel";
  symbol: string;
  entry_fee: number;
}

export interface TickOrderOpenRequest {
  room_id: string;
  action: "open";
  side: BlitzSide;
  amount: number;
}

export interface TickOrderCloseRequest {
  room_id: string;
  action: "close";
  order_id?: string;
}

export type TickOrderRequest = TickOrderOpenRequest | TickOrderCloseRequest;

export interface SettleResult {
  ok: boolean;
  reason?: string;
  error?: string;
}
