-- Critical Production Fixes: RLS Admin Policies + blitz_payout_trigger DROP + analytics_events Fix
-- Timestamp: 20260622133500

-- ============================================================
-- 1) Admin SELECT policies for core tables (additive, keep existing)
-- ============================================================

-- profiles: admin sees all
CREATE POLICY "admin_select_all_profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- trades: admin sees all
CREATE POLICY "admin_select_all_trades"
ON public.trades FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- positions: admin sees all
CREATE POLICY "admin_select_all_positions"
ON public.positions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- blitz_rooms: admin sees all
CREATE POLICY "admin_select_all_blitz_rooms"
ON public.blitz_rooms FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- blitz_participants: admin sees all
CREATE POLICY "admin_select_all_blitz_participants"
ON public.blitz_participants FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- blitz_orders: admin sees all
CREATE POLICY "admin_select_all_blitz_orders"
ON public.blitz_orders FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- notifications: admin sees all
CREATE POLICY "admin_select_all_notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- user_stats: admin sees all
CREATE POLICY "admin_select_all_user_stats"
ON public.user_stats FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- public_profiles: admin sees all
CREATE POLICY "admin_select_all_public_profiles"
ON public.public_profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 2) user_roles: admin INSERT/UPDATE (for admin-set-user-role edge function)
-- ============================================================

-- Admin can INSERT roles for other users
CREATE POLICY "admin_insert_user_roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin can UPDATE roles for other users
CREATE POLICY "admin_update_user_roles"
ON public.user_roles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 3) DROP blitz_payout_trigger (dual settlement risk)
-- ============================================================

DROP TRIGGER IF EXISTS trg_blitz_payout ON public.blitz_rooms;
DROP FUNCTION IF EXISTS public.blitz_payout_trigger();

-- ============================================================
-- 4) analytics_events: fix admin policy to use has_role() instead of raw_user_meta_data
-- ============================================================

-- Drop the old policy that uses raw_user_meta_data
DROP POLICY IF EXISTS "admin_select_all_analytics_events" ON public.analytics_events;

-- Create new policy using has_role()
CREATE POLICY "admin_select_all_analytics_events"
ON public.analytics_events FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
