-- 1. trades: remove client INSERT
DROP POLICY IF EXISTS "Users insert own trades" ON public.trades;

-- 2. positions: remove client INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Users insert own positions" ON public.positions;
DROP POLICY IF EXISTS "Users update own positions" ON public.positions;
DROP POLICY IF EXISTS "Users delete own positions" ON public.positions;

-- 3. user_stats: remove client UPDATE
DROP POLICY IF EXISTS "stats_update_own" ON public.user_stats;

-- helper to allow user to mark their own onboarding complete
CREATE OR REPLACE FUNCTION public.mark_onboarding_complete()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  INSERT INTO public.user_stats (user_id, onboarding_completed)
    VALUES (auth.uid(), true)
    ON CONFLICT (user_id) DO UPDATE SET onboarding_completed = true, updated_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_onboarding_complete() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_onboarding_complete() TO authenticated;

-- 4. copy_settings: harden UPDATE so leader_id cannot change post-creation
DROP POLICY IF EXISTS "copy_update_own" ON public.copy_settings;
CREATE POLICY "copy_update_own" ON public.copy_settings
  FOR UPDATE TO authenticated
  USING (auth.uid() = follower_id)
  WITH CHECK (
    auth.uid() = follower_id
    AND EXISTS (
      SELECT 1 FROM public.followers f
      WHERE f.follower_id = auth.uid() AND f.following_id = copy_settings.leader_id
    )
  );

-- Trigger to forbid changing leader_id or follower_id on UPDATE
CREATE OR REPLACE FUNCTION public.guard_copy_settings_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.leader_id IS DISTINCT FROM OLD.leader_id
     OR NEW.follower_id IS DISTINCT FROM OLD.follower_id THEN
    RAISE EXCEPTION 'copy_settings: leader_id and follower_id are immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_copy_settings_update_trg ON public.copy_settings;
CREATE TRIGGER guard_copy_settings_update_trg
  BEFORE UPDATE ON public.copy_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_copy_settings_update();