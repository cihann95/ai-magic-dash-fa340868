
-- 1. Followers: restrict to participants only
DROP POLICY IF EXISTS followers_read_scoped ON public.followers;
CREATE POLICY followers_read_participants ON public.followers
  FOR SELECT TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- 2. user_achievements: require show_portfolio opt-in for public exposure
DROP POLICY IF EXISTS ua_select_public ON public.user_achievements;
CREATE POLICY ua_select_public ON public.user_achievements
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.public_profiles pp
    WHERE pp.user_id = user_achievements.user_id
      AND pp.is_active = true
      AND pp.show_portfolio = true
  ));

-- 3. user_stats: prevent client-side leaderboard manipulation
-- Replace broad UPDATE policy with trigger that blocks changes to sensitive columns from non-service callers.
CREATE OR REPLACE FUNCTION public.guard_user_stats_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF caller_role IS DISTINCT FROM 'service_role' THEN
    IF NEW.xp IS DISTINCT FROM OLD.xp
      OR NEW.level IS DISTINCT FROM OLD.level
      OR NEW.total_pnl IS DISTINCT FROM OLD.total_pnl
      OR NEW.total_trades IS DISTINCT FROM OLD.total_trades
      OR NEW.profitable_trades IS DISTINCT FROM OLD.profitable_trades
      OR NEW.best_trade_pnl IS DISTINCT FROM OLD.best_trade_pnl
      OR NEW.current_streak IS DISTINCT FROM OLD.current_streak
      OR NEW.longest_streak IS DISTINCT FROM OLD.longest_streak
      OR NEW.last_active_date IS DISTINCT FROM OLD.last_active_date
      OR NEW.ai_uses IS DISTINCT FROM OLD.ai_uses
      OR NEW.asset_classes_traded IS DISTINCT FROM OLD.asset_classes_traded
    THEN
      RAISE EXCEPTION 'user_stats: this column can only be modified by the backend';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_stats_update_trg ON public.user_stats;
CREATE TRIGGER guard_user_stats_update_trg
  BEFORE UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_stats_update();

-- 4. Lock down SECURITY DEFINER helper functions from direct client EXECUTE
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_leaderboard(integer) FROM anon, public;
-- keep authenticated execute for leaderboard page
GRANT EXECUTE ON FUNCTION public.get_leaderboard(integer) TO authenticated;
