
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS intent_tag text,
  ADD COLUMN IF NOT EXISTS intent_note text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_view text NOT NULL DEFAULT 'pnl';

CREATE TABLE IF NOT EXISTS public.emotional_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trade_id uuid,
  signal_type text NOT NULL,
  mood text,
  symbol text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.emotional_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emotional_select_own" ON public.emotional_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "emotional_insert_own" ON public.emotional_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "emotional_delete_own" ON public.emotional_logs
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_emotional_logs_user_created
  ON public.emotional_logs(user_id, created_at DESC);

-- coach_insights INSERT policy (currently no insert policy exists)
CREATE POLICY "coach_insert_own" ON public.coach_insights
  FOR INSERT WITH CHECK (auth.uid() = user_id);
