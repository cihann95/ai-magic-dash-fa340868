-- Blitz Phase 2 — Post-audit fixes
-- 1. Deterministic advisory lock key function (aligns Edge Function + DB trigger)
-- 2. Analytics-writer cron schedule (every 60 seconds)

-- ============================================================
-- 1) Advisory lock key function: deterministic int from room_id
--    Uses hashtext() for consistency between Edge Function and DB trigger.
--    Both blitz-settle-room (Edge) and blitz_payout_trigger (DB) acquire
--    the same advisory lock key, ensuring they contend on the same lock.
-- ============================================================
CREATE OR REPLACE FUNCTION public.make_advisory_lock_key(p_room_id uuid)
RETURNS int
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hashtext(p_room_id::text)::int;
$$;

GRANT EXECUTE ON FUNCTION public.make_advisory_lock_key(uuid) TO service_role;

-- ============================================================
-- 2) Analytics-writer cron: flush staging → main every 60 seconds
--    Invokes blitz-analytics-writer Edge Function via HTTP POST.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analytics-writer-60s') THEN
    PERFORM cron.unschedule('analytics-writer-60s');
  END IF;
END $$;

SELECT cron.schedule(
  'analytics-writer-60s',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := format('https://%s/functions/v1/blitz-analytics-writer', current_setting('supabase_url')),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
