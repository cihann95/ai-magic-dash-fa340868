-- AI Signal History: tracks every AI signal for accuracy verification
-- Used by ai-signal-verify cron + SignalCard accuracy display
CREATE TABLE IF NOT EXISTS public.ai_signal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  signal_type text NOT NULL CHECK (signal_type IN ('BUY', 'SELL', 'HOLD', 'AL', 'SAT', 'BEKLE')),
  predicted_direction text NOT NULL CHECK (predicted_direction IN ('up', 'down', 'neutral')),
  price_at_signal numeric(20,8) NOT NULL,
  confidence smallint NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  analysis_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  price_after_24h numeric(20,8),
  was_correct boolean
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_signal_history_user_created
  ON public.ai_signal_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_signal_history_user_symbol_signal
  ON public.ai_signal_history (user_id, symbol, signal_type);
CREATE INDEX IF NOT EXISTS idx_ai_signal_history_unverified
  ON public.ai_signal_history (verified) WHERE verified = false;

-- RLS
ALTER TABLE public.ai_signal_history ENABLE ROW LEVEL SECURITY;

-- Users can view own signals only
CREATE POLICY "Users view own signal history"
  ON public.ai_signal_history FOR SELECT
  USING (auth.uid() = user_id);

-- Service role full access (edge functions)
CREATE POLICY "Service role all access ai_signal_history"
  ON public.ai_signal_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can insert their own signals
CREATE POLICY "Users insert own signals"
  ON public.ai_signal_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
