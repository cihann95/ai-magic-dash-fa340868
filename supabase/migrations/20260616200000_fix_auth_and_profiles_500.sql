-- =============================================================================
-- Fix: 2026-06-16 — Auth login issues + profiles 500 errors + handle_new_user
-- =============================================================================
-- 1. Fix profiles 500 errors: Drop problematic featured_room_profiles_select policy
--    that causes recursive RLS via blitz_participants
-- 2. Fix blitz_participants recursive RLS policy
-- 3. Strengthen handle_new_user trigger with all required inserts
-- 4. Backfill missing data for existing users
-- 5. Invalidate PostgREST schema cache
-- =============================================================================

-- 1) Drop the problematic policy that causes profiles 500 errors
--    This policy joins to blitz_participants which has recursive RLS
DROP POLICY IF EXISTS "featured_room_profiles_select" ON public.profiles;

-- 2) Fix blitz_participants recursive RLS policy
--    The old policy caused infinite recursion by querying the same table
DROP POLICY IF EXISTS "Members can see room participants" ON public.blitz_participants;

CREATE POLICY "Users see own blitz_participants"
  ON public.blitz_participants FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Members can see room participants"
  ON public.blitz_participants FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.blitz_participants p2
    WHERE p2.room_id = blitz_participants.room_id
      AND p2.user_id = auth.uid()
  ));

-- 3) Strengthen handle_new_user trigger - final version
--    Creates profile with explicit balances, user_roles, user_stats
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, demo_balance, initial_balance)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    100000.00,
    100000.00
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.user_stats (user_id, onboarding_completed)
  VALUES (NEW.id, false)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END; $$;

-- 4) Backfill missing profiles with demo balance
INSERT INTO public.profiles (id, display_name, demo_balance, initial_balance)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)),
  100000.00,
  100000.00
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 5) Backfill missing user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 6) Backfill missing user_stats
INSERT INTO public.user_stats (user_id, onboarding_completed)
SELECT u.id, false
FROM auth.users u
LEFT JOIN public.user_stats s ON s.user_id = u.id
WHERE s.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- 7) Fix zero/null balances for existing profiles
UPDATE public.profiles
SET demo_balance = 100000.00,
    initial_balance = 100000.00
WHERE demo_balance IS NULL
   OR demo_balance = 0
   OR initial_balance IS NULL
   OR initial_balance = 0;

-- 8) Invalidate PostgREST schema cache
NOTIFY pgrst, 'reload schema';