DROP POLICY IF EXISTS copy_insert_own ON public.copy_settings;
DROP POLICY IF EXISTS copy_update_own ON public.copy_settings;

CREATE POLICY copy_insert_own ON public.copy_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = follower_id
    AND EXISTS (
      SELECT 1 FROM public.followers f
      WHERE f.follower_id = auth.uid() AND f.following_id = copy_settings.leader_id
    )
  );

CREATE POLICY copy_update_own ON public.copy_settings
  FOR UPDATE TO authenticated
  USING (auth.uid() = follower_id)
  WITH CHECK (
    auth.uid() = follower_id
    AND EXISTS (
      SELECT 1 FROM public.followers f
      WHERE f.follower_id = auth.uid() AND f.following_id = copy_settings.leader_id
    )
  );