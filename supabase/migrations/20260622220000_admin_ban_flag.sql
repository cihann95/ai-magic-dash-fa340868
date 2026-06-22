-- Add is_banned flag to profiles for admin user moderation
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_banned IS 'Set to true by admin to ban user; blocks login + blitz + trades';

-- RLS: Admin can UPDATE is_banned on any profile
DROP POLICY IF EXISTS "admin_update_banned_profiles" ON public.profiles;
CREATE POLICY "admin_update_banned_profiles" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

