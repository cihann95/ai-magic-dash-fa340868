// Mirror of src/types/blitz.ts for Deno edge functions.
// Keep in sync manually — Deno cannot import from src/.
export type BlitzStatus =
  | "waiting"
  | "active"
  | "settling"
  | "finished"
  | "cancelled";

export type BlitzMode = "public" | "private";
export type BlitzSide = "long" | "short";

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
