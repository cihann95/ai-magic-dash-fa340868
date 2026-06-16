
-- Ana Sahne: Featured room, public view, and payout trigger

-- ============================================================
-- 1) is_featured column on blitz_rooms
-- ============================================================
ALTER TABLE public.blitz_rooms
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_blitz_rooms_is_featured
  ON public.blitz_rooms(is_featured) WHERE is_featured = true;

-- ============================================================
-- 2) pick_featured_room() trigger function
--    Clears previous featured room, picks best active room
-- ============================================================
CREATE OR REPLACE FUNCTION public.pick_featured_room()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clear previous featured room
  UPDATE public.blitz_rooms SET is_featured = false WHERE is_featured = true;
  -- Pick the active room with highest entry fee, created within last 24h
  UPDATE public.blitz_rooms SET is_featured = true
    WHERE id = (
      SELECT id FROM public.blitz_rooms
      WHERE status = 'active' AND created_at > now() - interval '1 day'
      ORDER BY entry_fee DESC LIMIT 1
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pick_featured_room ON public.blitz_rooms;
CREATE TRIGGER trg_pick_featured_room
  AFTER INSERT OR UPDATE OF status ON public.blitz_rooms
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.pick_featured_room();

-- ============================================================
-- 3) ana_sahne_view — SECURITY INVOKER, no PII columns
-- ============================================================
-- SECURITY INVOKER: base-table RLS policies are enforced for the querying user.
-- The view is a curated read-only aggregation; RLS on the base tables
-- must allow SELECT on featured-room data (see policies below).
-- ============================================================
DROP VIEW IF EXISTS public.ana_sahne_view CASCADE;
CREATE OR REPLACE VIEW public.ana_sahne_view
  WITH (security_invoker, security_barrier) AS
SELECT
  r.id,
  r.symbol,
  r.entry_fee,
  r.status,
  r.mode,
  r.max_players,
  r.starts_at,
  r.ends_at,
  r.start_price,
  r.pot,
  r.fee_collected,
  r.created_at,
  r.updated_at,
  r.is_featured,
  -- Participants as JSON array (no user_id, no final_balance, no PII)
  COALESCE(
    json_agg(
      json_build_object(
        'username', p.display_name,
        'side', o.side,
        'pnl', o.pnl,
        'pnlPct', CASE WHEN o.entry_price > 0 THEN ((o.exit_price - o.entry_price) / o.entry_price * 100) ELSE 0 END
      )
      ORDER BY COALESCE(o.pnl, -999999) DESC
    ) FILTER (WHERE p.id IS NOT NULL),
    '[]'::json
  ) AS participants
FROM public.blitz_rooms r
LEFT JOIN public.blitz_participants bp ON bp.room_id = r.id
LEFT JOIN public.profiles p ON p.id = bp.user_id
LEFT JOIN public.blitz_orders o ON o.room_id = r.id AND o.user_id = bp.user_id AND o.closed_at IS NOT NULL
WHERE r.is_featured = true
GROUP BY r.id;

-- ── RLS on the view itself (PostgreSQL 15+) ────────────────────────────────
ALTER VIEW public.ana_sahne_view ENABLE ROW LEVEL SECURITY;

-- Everyone may SELECT the curated featured-room view
CREATE POLICY "ana_sahne_view_anon_select"
  ON public.ana_sahne_view
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "ana_sahne_view_authenticated_select"
  ON public.ana_sahne_view
  FOR SELECT
  TO authenticated
  USING (true);

-- ── Grants on the view ───────────────────────────────────────────────────
GRANT SELECT ON public.ana_sahne_view TO anon;
GRANT SELECT ON public.ana_sahne_view TO authenticated;

-- ── Grants on base tables (required for SECURITY INVOKER) ─────────────────
GRANT SELECT ON public.blitz_rooms TO anon, authenticated;
GRANT SELECT ON public.blitz_participants TO anon, authenticated;
GRANT SELECT ON public.blitz_orders TO anon, authenticated;

-- ── RLS on base tables: allow public read of featured-room data ───────────
-- blitz_rooms
CREATE POLICY "featured_room_select"
  ON public.blitz_rooms
  FOR SELECT
  TO anon, authenticated
  USING (is_featured = true);

-- blitz_participants (participants in featured rooms)
CREATE POLICY "featured_room_participants_select"
  ON public.blitz_participants
  FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.blitz_rooms
    WHERE id = blitz_participants.room_id AND is_featured = true
  ));

-- blitz_orders (completed orders in featured rooms)
CREATE POLICY "featured_room_orders_select"
  ON public.blitz_orders
  FOR SELECT
  TO anon, authenticated
  USING (closed_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.blitz_rooms
    WHERE id = blitz_orders.room_id AND is_featured = true
  ));

-- profiles (display_name of participants in featured rooms)
CREATE POLICY "featured_room_profiles_select"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.blitz_participants bp
    JOIN public.blitz_rooms br ON br.id = bp.room_id
    WHERE br.is_featured = true AND bp.user_id = profiles.id
  ));

-- ============================================================
-- 4) FAZ 4: blitz_payout_trigger — records revenue, pays winner
-- ============================================================
CREATE OR REPLACE FUNCTION public.blitz_payout_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _idempotency_key text;
  _lock_obtained boolean;
BEGIN
  -- Only act when status changes TO 'finished'
  IF NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished' THEN
    
    -- Advisory lock on room_id (non-blocking) — use consistent hash with Edge Function
    _lock_obtained := pg_try_advisory_xact_lock(hashtext(NEW.id::text));
    IF NOT _lock_obtained THEN
      RETURN NEW;  -- another session (likely edge function) is handling this
    END IF;
    
    -- Idempotency check
    _idempotency_key := NEW.id::text || ':db_trigger';
    IF public.settlement_already_processed(_idempotency_key) THEN
      RETURN NEW;
    END IF;
    
    -- Record platform revenue (existing logic)
    INSERT INTO public.platform_revenue (source, room_id, amount, currency, metadata)
    VALUES ('blitz', NEW.id, NEW.fee_collected, 'USD',
      jsonb_build_object('type', 'blitz_fee', 'room_id', NEW.id, 'settlement_type', 'db_trigger'));
    
    -- Pay winner if exists (existing logic)
    IF NEW.winner_id IS NOT NULL THEN
      UPDATE public.profiles
      SET real_balance = real_balance + (NEW.pot - NEW.fee_collected)
      WHERE id = NEW.winner_id;
    END IF;
    
    -- Write to settlement_ledger (idempotent via unique constraint)
    INSERT INTO public.settlement_ledger
      (room_id, idempotency_key, settlement_type, winner_id,
       prize_amount, fee_collected, pot_total, participant_count,
       status, metadata)
    VALUES (
      NEW.id, _idempotency_key, 'db_trigger',
      NEW.winner_id,
      NEW.pot - NEW.fee_collected, NEW.fee_collected, NEW.pot,
      (SELECT COUNT(*) FROM public.blitz_participants WHERE room_id = NEW.id),
      'completed',
      jsonb_build_object('source', 'blitz_payout_trigger')
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
    
    -- Write to observability_log
    INSERT INTO public.observability_log (service, event, level, room_id, metadata, duration_ms)
    VALUES ('blitz_settle', 'payout_completed', 'info', NEW.id,
      jsonb_build_object('settlement_type', 'db_trigger', 'idempotency_key', _idempotency_key, 'prize', NEW.pot - NEW.fee_collected),
      NULL);
    
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blitz_payout ON public.blitz_rooms;
CREATE TRIGGER trg_blitz_payout
  BEFORE UPDATE OF status ON public.blitz_rooms
  FOR EACH ROW
  WHEN (NEW.status = 'finished')
  EXECUTE FUNCTION public.blitz_payout_trigger();
