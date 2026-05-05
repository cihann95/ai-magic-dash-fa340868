-- 1) Lock down gamification SECURITY DEFINER functions: only service_role may call them.
REVOKE EXECUTE ON FUNCTION public.award_xp(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_streak(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_achievement(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_xp(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_streak(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_achievement(uuid, text) TO service_role;

-- 2) Tighten followers SELECT: only see rows you participate in,
--    or rows where the other party has an active public_profile.
DROP POLICY IF EXISTS "followers_read_all_authenticated" ON public.followers;
CREATE POLICY "followers_read_scoped"
ON public.followers
FOR SELECT
TO authenticated
USING (
  auth.uid() = follower_id
  OR auth.uid() = following_id
  OR EXISTS (
    SELECT 1 FROM public.public_profiles pp
    WHERE pp.user_id = followers.following_id AND pp.is_active = true
  )
  OR EXISTS (
    SELECT 1 FROM public.public_profiles pp
    WHERE pp.user_id = followers.follower_id AND pp.is_active = true
  )
);

-- 3) Tighten user_stats public read: require explicit show_portfolio opt-in.
DROP POLICY IF EXISTS "stats_select_public" ON public.user_stats;
CREATE POLICY "stats_select_public"
ON public.user_stats
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.public_profiles pp
    WHERE pp.user_id = user_stats.user_id
      AND pp.is_active = true
      AND pp.show_portfolio = true
  )
);

-- 4) Realtime channel authorization: prevent users from subscribing to other users' topics.
--    Topics for private user data must be prefixed with the user's UUID, e.g. "<uid>:notifications".
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "realtime_user_topic_read" ON realtime.messages;
CREATE POLICY "realtime_user_topic_read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE (auth.uid()::text || ':%')
  OR realtime.topic() = auth.uid()::text
);

DROP POLICY IF EXISTS "realtime_user_topic_write" ON realtime.messages;
CREATE POLICY "realtime_user_topic_write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE (auth.uid()::text || ':%')
  OR realtime.topic() = auth.uid()::text
);
