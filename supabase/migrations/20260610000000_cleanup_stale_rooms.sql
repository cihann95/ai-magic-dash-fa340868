
-- Cleanup stale blitz rooms stuck in 'waiting' status
-- Rooms that never receive a second player are cancelled after 30 minutes
-- to prevent indefinite waiting state from consuming resources.

-- ============================================================
-- 1) cleanup_stale_rooms() — SECURITY DEFINER function
--    Cancels rooms waiting > 30 minutes with no second player
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_stale_rooms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.blitz_rooms
  SET status = 'cancelled', updated_at = now()
  WHERE status = 'waiting'
    AND created_at < now() - interval '30 minutes';
END;
$$;

-- ============================================================
-- 2) Cron job — runs every 5 minutes
--    Idempotent: unschedule first, then schedule
-- ============================================================
DO $$
BEGIN
  PERFORM cron.unschedule('blitz-cleanup-stale')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'blitz-cleanup-stale');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'blitz-cleanup-stale',
  '*/5 * * * *',
  $$SELECT public.cleanup_stale_rooms()$$
);
