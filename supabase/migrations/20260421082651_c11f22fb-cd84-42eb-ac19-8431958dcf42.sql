
-- 1) copy_settings: kim kimi kopyalıyor + oran
CREATE TABLE IF NOT EXISTS public.copy_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID NOT NULL,
  leader_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  ratio NUMERIC NOT NULL DEFAULT 1.0 CHECK (ratio > 0 AND ratio <= 10),
  max_position_usd NUMERIC NOT NULL DEFAULT 5000 CHECK (max_position_usd > 0),
  asset_classes TEXT[] NOT NULL DEFAULT '{crypto,stocks,forex,commodities,indices,etf}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(follower_id, leader_id)
);
ALTER TABLE public.copy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copy_select_own" ON public.copy_settings FOR SELECT USING (auth.uid() = follower_id);
CREATE POLICY "copy_insert_own" ON public.copy_settings FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "copy_update_own" ON public.copy_settings FOR UPDATE USING (auth.uid() = follower_id);
CREATE POLICY "copy_delete_own" ON public.copy_settings FOR DELETE USING (auth.uid() = follower_id);

CREATE TRIGGER copy_settings_touch BEFORE UPDATE ON public.copy_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_copy_leader ON public.copy_settings(leader_id) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_copy_follower ON public.copy_settings(follower_id);

-- 2) coach_insights: AI davranış analizi çıktıları
CREATE TABLE IF NOT EXISTS public.coach_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.coach_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_select_own" ON public.coach_insights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "coach_update_own" ON public.coach_insights FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "coach_delete_own" ON public.coach_insights FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_coach_user_created ON public.coach_insights(user_id, created_at DESC);

-- 3) push_subscriptions: web push abonelikleri
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_select_own" ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "push_insert_own" ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_delete_own" ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- 4) trades.copied_from: copy-trade izleme
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS copied_from UUID;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS leader_user_id UUID;
CREATE INDEX IF NOT EXISTS idx_trades_copied_from ON public.trades(copied_from) WHERE copied_from IS NOT NULL;

-- 5) public_profiles.copyable
ALTER TABLE public.public_profiles ADD COLUMN IF NOT EXISTS copyable BOOLEAN NOT NULL DEFAULT false;

-- 6) Realtime publication ekleme
ALTER PUBLICATION supabase_realtime ADD TABLE public.coach_insights;
ALTER PUBLICATION supabase_realtime ADD TABLE public.copy_settings;
ALTER TABLE public.coach_insights REPLICA IDENTITY FULL;
ALTER TABLE public.copy_settings REPLICA IDENTITY FULL;

-- 7) Aktivite akışı view: takip ettiklerimin trade + achievement aktivitesi
CREATE OR REPLACE VIEW public.activity_feed AS
SELECT
  t.id AS event_id,
  'trade' AS event_type,
  t.user_id,
  pp.username,
  t.symbol,
  t.asset_class,
  t.side,
  t.action,
  t.quantity,
  t.price,
  t.pnl,
  t.executed_at AS event_at
FROM public.trades t
JOIN public.public_profiles pp ON pp.user_id = t.user_id
WHERE pp.is_active = true AND pp.show_trades = true
UNION ALL
SELECT
  ua.id AS event_id,
  'achievement' AS event_type,
  ua.user_id,
  pp.username,
  NULL::text AS symbol,
  NULL::text AS asset_class,
  NULL::text AS side,
  ua.achievement_code AS action,
  NULL::numeric AS quantity,
  NULL::numeric AS price,
  NULL::numeric AS pnl,
  ua.earned_at AS event_at
FROM public.user_achievements ua
JOIN public.public_profiles pp ON pp.user_id = ua.user_id
WHERE pp.is_active = true;

GRANT SELECT ON public.activity_feed TO authenticated;
