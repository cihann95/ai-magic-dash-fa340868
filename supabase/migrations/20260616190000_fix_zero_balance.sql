-- =============================================================================
-- Fix: 2026-06-16 — Zero balance fix
-- =============================================================================
-- 1. Set demo_balance=100000 for users where it's 0 or NULL
-- 2. Set initial_balance=100000 for users where it's 0 or NULL
-- 3. Ensure all auth.users have a profile row
-- 4. Ensure all auth.users have a user_stats row
-- =============================================================================

-- 1) Fix zero or null balances for EXISTING profiles
UPDATE public.profiles
SET demo_balance = 100000.00,
    initial_balance = 100000.00
WHERE demo_balance IS NULL
   OR demo_balance = 0
   OR initial_balance IS NULL
   OR initial_balance = 0;

-- 2) Backfill missing profiles again (for users who signed up very recently)
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

-- 3) Backfill missing user_stats again
INSERT INTO public.user_stats (user_id, onboarding_completed)
SELECT u.id, false
FROM auth.users u
LEFT JOIN public.user_stats s ON s.user_id = u.id
WHERE s.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- 4) Backfill missing user_roles again
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 5) Invalidate PostgREST schema cache
NOTIFY pgrst, 'reload schema';
