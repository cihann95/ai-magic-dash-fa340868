-- Fix: ana_sahne_view SECURITY DEFINER -> SECURITY INVOKER
-- Previously applied migration (20260609234136) created the view without security_invoker,
-- defaulting to SECURITY DEFINER. This migration drops and recreates it with
-- SECURITY INVOKER + adds RLS policies and base-table grants.

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

GRANT SELECT ON public.ana_sahne_view TO anon;
GRANT SELECT ON public.ana_sahne_view TO authenticated;

GRANT SELECT ON public.blitz_rooms TO anon, authenticated;
GRANT SELECT ON public.blitz_participants TO anon, authenticated;
GRANT SELECT ON public.blitz_orders TO anon, authenticated;

DROP POLICY IF EXISTS "featured_room_select" ON public.blitz_rooms;
CREATE POLICY "featured_room_select"
  ON public.blitz_rooms
  FOR SELECT
  TO anon, authenticated
  USING (is_featured = true);

DROP POLICY IF EXISTS "featured_room_participants_select" ON public.blitz_participants;
CREATE POLICY "featured_room_participants_select"
  ON public.blitz_participants
  FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.blitz_rooms
    WHERE id = blitz_participants.room_id AND is_featured = true
  ));

DROP POLICY IF EXISTS "featured_room_orders_select" ON public.blitz_orders;
CREATE POLICY "featured_room_orders_select"
  ON public.blitz_orders
  FOR SELECT
  TO anon, authenticated
  USING (closed_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.blitz_rooms
    WHERE id = blitz_orders.room_id AND is_featured = true
  ));

DROP POLICY IF EXISTS "featured_room_profiles_select" ON public.profiles;
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
