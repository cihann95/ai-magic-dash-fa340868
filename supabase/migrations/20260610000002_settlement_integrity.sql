-- Settlement Ledger: immutable, append-only record of all settlement attempts
-- Uses idempotency_key to prevent duplicate processing of the same settlement.

-- Drop existing objects for idempotent re-runs
DROP FUNCTION IF EXISTS public.settlement_already_processed(text);
DROP FUNCTION IF EXISTS public.make_settlement_idempotency_key(uuid, text);

CREATE TABLE IF NOT EXISTS public.settlement_ledger (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id           uuid REFERENCES public.blitz_rooms(id) ON DELETE SET NULL,
  idempotency_key   text NOT NULL UNIQUE,
  settlement_type   text NOT NULL CHECK (settlement_type IN ('edge_function', 'db_trigger', 'cron')),
  winner_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prize_amount      numeric NOT NULL CHECK (prize_amount >= 0),
  fee_collected     numeric NOT NULL CHECK (fee_collected >= 0),
  pot_total         numeric NOT NULL CHECK (pot_total >= 0),
  participant_count  int NOT NULL CHECK (participant_count > 0),
  status            text NOT NULL CHECK (status IN ('completed', 'failed', 'rolled_back')),
  error_message     text,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Helper: deterministic idempotency key from room + type
CREATE OR REPLACE FUNCTION public.make_settlement_idempotency_key(
  p_room_id uuid,
  p_settlement_type text
) RETURNS text
  LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_room_id::text || ':' || p_settlement_type;
$$;

-- Helper: check whether a settlement with the given key has already completed
CREATE OR REPLACE FUNCTION public.settlement_already_processed(
  p_idempotency_key text
) RETURNS boolean
  LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.settlement_ledger
    WHERE idempotency_key = p_idempotency_key
      AND status = 'completed'
  );
$$;

-- Grants: only service_role can write; authenticated can read (admin-only via RLS)
GRANT SELECT ON public.settlement_ledger TO authenticated;
GRANT ALL ON public.settlement_ledger TO service_role;

-- Enable Row Level Security
ALTER TABLE public.settlement_ledger ENABLE ROW LEVEL SECURITY;

-- Admin SELECT policy
CREATE POLICY "Admins can view settlement ledger"
  ON public.settlement_ledger FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT policy for authenticated — only service_role bypasses RLS
-- No UPDATE or DELETE policies — table is append-only by design

-- Indexes
CREATE INDEX IF NOT EXISTS idx_settlement_ledger_room_id
  ON public.settlement_ledger (room_id);

CREATE INDEX IF NOT EXISTS idx_settlement_ledger_created_at
  ON public.settlement_ledger (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_settlement_ledger_idempotency_key
  ON public.settlement_ledger (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_settlement_ledger_status_created
  ON public.settlement_ledger (status, created_at DESC);

-- ──────────────────────────────────────────────────────────────────
-- SEC-003: tick_order_atomic() — server-authoritative order validation
-- Acquires SELECT ... FOR UPDATE on the room row to serialize
-- concurrent order attempts.  Returns room metadata on success or
-- an error JSONB on any validation failure.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tick_order_atomic(
  _room_id uuid,
  _user_id uuid,
  _side    public.blitz_side,
  _amount  numeric
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  _room public.blitz_rooms;
BEGIN
  -- 1. Row-lock the room to serialize concurrent order attempts
  SELECT * INTO _room
    FROM public.blitz_rooms
   WHERE id = _room_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Room not found');
  END IF;

  -- 2. Room must be active
  IF _room.status != 'active' THEN
    RETURN jsonb_build_object('error', 'Room not active');
  END IF;

  -- 3. Room must not be expired (server clock)
  IF _room.ends_at IS NOT NULL AND _room.ends_at <= now() THEN
    RETURN jsonb_build_object('error', 'Room expired');
  END IF;

  -- 4. Caller must be a participant
  IF NOT EXISTS (
    SELECT 1 FROM public.blitz_participants
     WHERE room_id = _room_id AND user_id = _user_id
  ) THEN
    RETURN jsonb_build_object('error', 'Not a participant');
  END IF;

  -- 5. No existing open position for this user in this room
  IF EXISTS (
    SELECT 1 FROM public.blitz_orders
     WHERE room_id = _room_id
       AND user_id = _user_id
       AND closed_at IS NULL
  ) THEN
    RETURN jsonb_build_object('error', 'Already have an open position. Close it first.');
  END IF;

  -- All validations passed — return room metadata for downstream use
  RETURN jsonb_build_object(
    'room_id',     _room.id,
    'symbol',      _room.symbol,
    'start_price', _room.start_price,
    'status',      _room.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.tick_order_atomic(uuid, uuid, public.blitz_side, numeric) TO service_role;

-- ──────────────────────────────────────────────────────────────────
-- SEC-003b: close_order_atomic() — server-authoritative order close
-- Acquires SELECT ... FOR UPDATE on the specific order row to
-- serialise concurrent close attempts on the same order.
-- Returns the order row on success or an error JSONB.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_order_atomic(
  _room_id  uuid,
  _user_id  uuid,
  _order_id uuid DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  _order public.blitz_orders;
  _room  public.blitz_rooms;
BEGIN
  -- 1. Row-lock the room to ensure it's still active
  SELECT * INTO _room
    FROM public.blitz_rooms
   WHERE id = _room_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Room not found');
  END IF;

  IF _room.status != 'active' THEN
    RETURN jsonb_build_object('error', 'Room not active');
  END IF;

  -- 2. Row-lock the order to serialise concurrent close attempts
  IF _order_id IS NOT NULL THEN
    SELECT * INTO _order
      FROM public.blitz_orders
     WHERE id = _order_id
       AND room_id = _room_id
       AND user_id = _user_id
       AND closed_at IS NULL
       FOR UPDATE;
  ELSE
    SELECT * INTO _order
      FROM public.blitz_orders
     WHERE room_id = _room_id
       AND user_id = _user_id
       AND closed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1
       FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No open order');
  END IF;

  RETURN jsonb_build_object(
    'order_id',    _order.id,
    'side',        _order.side,
    'amount',      _order.amount,
    'entry_price', _order.entry_price,
    'room_id',     _room.id,
    'symbol',      _room.symbol,
    'start_price', _room.start_price
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_order_atomic(uuid, uuid, uuid) TO service_role;

-- ──────────────────────────────────────────────────────────────────
-- SET-001: try_advisory_lock(int) — non-blocking advisory lock RPC
-- Wraps pg_try_advisory_xact_lock so Edge Functions can acquire a
-- transaction-scoped advisory lock via RPC without blocking.
-- The lock is auto-released at transaction end.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.try_advisory_lock(p_key int)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT pg_try_advisory_xact_lock(p_key) $$;

GRANT EXECUTE ON FUNCTION public.try_advisory_lock(int) TO service_role;

-- ──────────────────────────────────────────────────────────────────
-- SEC-004: lock_and_validate_room() — row-level lock for settlement
-- Acquires SELECT ... FOR UPDATE on the room row to serialize
-- concurrent settlement attempts.  Checks idempotency first,
-- transitions status to 'settling', and returns room metadata.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lock_and_validate_room(
  p_room_id uuid,
  p_idempotency_key text
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  _room public.blitz_rooms;
BEGIN
  -- Fast path: already settled?
  IF public.settlement_already_processed(p_idempotency_key) THEN
    RETURN jsonb_build_object('already_settled', true);
  END IF;

  -- Row lock
  SELECT * INTO _room FROM public.blitz_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Room not found');
  END IF;

  -- Must be active to settle
  IF _room.status != 'active' THEN
    RETURN jsonb_build_object('already_settled', true, 'status', _room.status);
  END IF;

  -- Transition to settling atomically
  UPDATE public.blitz_rooms SET status = 'settling', updated_at = now()
  WHERE id = p_room_id AND status = 'active';

  RETURN jsonb_build_object(
    'locked', true, 'symbol', _room.symbol,
    'start_price', _room.start_price, 'entry_fee', _room.entry_fee,
    'starts_at', _room.starts_at, 'ends_at', _room.ends_at,
    'pot', _room.pot, 'entry_fee', _room.entry_fee
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_and_validate_room(uuid, text) TO service_role;
