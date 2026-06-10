-- ============================================================
-- Blitz Monitoring Queries
-- Run periodically (every 5 min) or on-demand via run-monitoring.sh
-- ============================================================

-- 1. Stale active rooms: active but should have ended
SELECT 'stale_rooms' AS alert_type, COUNT(*)::int AS count
FROM public.blitz_rooms
WHERE status = 'active'
  AND ends_at IS NOT NULL
  AND ends_at < now() - interval '1 hour';

-- 2. Failed settlements in last hour (wraps alert function)
SELECT 'settlement_failures' AS alert_type, COALESCE(
  (SELECT jsonb_agg(row_to_json(t)) FROM public.alert_settlement_failures() t), '[]'::jsonb
)::text AS details;

-- 3. Duplicate payout attempts (wraps alert function)
SELECT 'duplicate_payouts' AS alert_type, COALESCE(
  (SELECT jsonb_agg(row_to_json(t)) FROM public.alert_duplicate_payout_attempts() t), '[]'::jsonb
)::text AS details;

-- 4. Orphaned rooms: active but no participants for > 30 min
SELECT 'orphaned_rooms' AS alert_type, COUNT(*)::int AS count
FROM public.blitz_rooms r
WHERE r.status = 'active'
  AND r.created_at < now() - interval '30 minutes'
  AND NOT EXISTS (SELECT 1 FROM public.blitz_participants p WHERE p.room_id = r.id);

-- 5. Unflushed analytics events
SELECT 'unflushed_analytics' AS alert_type, COUNT(*)::int AS count
FROM public.analytics_events_staging
WHERE flushed = false;
