
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
-- 3) ana_sahne_view — SECURITY DEFINER, no PII columns
-- ============================================================
DROP VIEW IF EXISTS public.ana_sahne_view CASCADE;
CREATE OR REPLACE VIEW public.ana_sahne_view WITH (security_barrier) AS
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

-- Accessible by everyone (view is SECURITY DEFINER, bypasses base-table RLS)
GRANT SELECT ON public.ana_sahne_view TO anon;
GRANT SELECT ON public.ana_sahne_view TO authenticated;

-- ============================================================
-- 4) FAZ 4: blitz_payout_trigger — records revenue, pays winner
-- ============================================================
CREATE OR REPLACE FUNCTION public.blitz_payout_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when status changes TO 'finished'
  IF NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished' THEN
    -- Record platform revenue (fee_collected)
    INSERT INTO public.platform_revenue (source, room_id, amount, currency, metadata)
    VALUES ('blitz', NEW.id, NEW.fee_collected, 'USD', json_build_object('type', 'blitz_fee', 'room_id', NEW.id));

    -- Pay winner if exists (pot - fee_collected is the prize pool)
    IF NEW.winner_id IS NOT NULL THEN
      UPDATE public.profiles
      SET real_balance = real_balance + (NEW.pot - NEW.fee_collected)
      WHERE id = NEW.winner_id;
    END IF;
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
