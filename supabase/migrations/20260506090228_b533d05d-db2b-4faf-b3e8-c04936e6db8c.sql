DROP VIEW IF EXISTS public.activity_feed;

CREATE VIEW public.activity_feed
WITH (security_invoker = true) AS
SELECT
  'trade'::text AS event_type,
  t.id AS event_id,
  t.user_id,
  t.symbol,
  t.asset_class,
  t.side,
  t.action,
  t.pnl,
  NULL::text AS achievement_code,
  t.executed_at AS event_at
FROM public.trades t
JOIN public.public_profiles pp ON pp.user_id = t.user_id
WHERE pp.is_active = true AND pp.show_trades = true
UNION ALL
SELECT
  'achievement'::text AS event_type,
  ua.id AS event_id,
  ua.user_id,
  NULL::text AS symbol,
  NULL::text AS asset_class,
  NULL::text AS side,
  NULL::text AS action,
  NULL::numeric AS pnl,
  ua.achievement_code,
  ua.earned_at AS event_at
FROM public.user_achievements ua
JOIN public.public_profiles pp ON pp.user_id = ua.user_id
WHERE pp.is_active = true AND pp.show_portfolio = true;