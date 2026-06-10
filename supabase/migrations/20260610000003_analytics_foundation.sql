
-- Analytics events schema: main store (90-day retention) + low-latency staging table
-- Events are written via insert_analytics_event() RPC only — no direct client INSERTs.

-- ============================================================
-- 1) analytics_events — main event store, 90-day retention
-- ============================================================
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  room_id uuid,
  user_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  server_timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2) analytics_events_staging — low-latency write target, batch-flushed
-- ============================================================
CREATE TABLE IF NOT EXISTS public.analytics_events_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  room_id uuid,
  user_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  server_timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  flushed boolean NOT NULL DEFAULT false
);

-- ============================================================
-- 3) Indexes
-- ============================================================
-- Main table: common query patterns
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type_server_ts
  ON public.analytics_events (event_type, server_timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_events_room_id_server_ts
  ON public.analytics_events (room_id, server_timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id_server_ts
  ON public.analytics_events (user_id, server_timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON public.analytics_events (created_at);

-- Staging table: unflushed filter for batch flush jobs
CREATE INDEX IF NOT EXISTS idx_analytics_events_staging_flushed
  ON public.analytics_events_staging (flushed)
  WHERE flushed = false;

-- ============================================================
-- 4) Grants — no direct client writes; service_role only
-- ============================================================
GRANT ALL ON public.analytics_events TO service_role;
GRANT ALL ON public.analytics_events_staging TO service_role;

-- ============================================================
-- 5) RLS — analytics_events
-- ============================================================
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- service_role: full access
CREATE POLICY "service_role_all_analytics_events"
  ON public.analytics_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- authenticated: can SELECT own events only
CREATE POLICY "authenticated_select_own_analytics_events"
  ON public.analytics_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- admin: can SELECT all events
CREATE POLICY "admin_select_all_analytics_events"
  ON public.analytics_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ============================================================
-- 6) RLS — analytics_events_staging (service_role ONLY, no self-select)
-- ============================================================
ALTER TABLE public.analytics_events_staging ENABLE ROW LEVEL SECURITY;

-- service_role: full access
CREATE POLICY "service_role_all_analytics_events_staging"
  ON public.analytics_events_staging FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No policies for authenticated or anon — staging is service_role only

-- ============================================================
-- 7) insert_analytics_event() — SECURITY DEFINER RPC for client-safe inserts
-- ============================================================
CREATE OR REPLACE FUNCTION public.insert_analytics_event(
  _event_type text,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.analytics_events_staging (event_type, user_id, payload, server_timestamp)
  VALUES (_event_type, auth.uid(), _payload, now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_analytics_event(text, jsonb) TO authenticated;

-- ============================================================
-- 8) cleanup_analytics_events() — deletes events older than 90 days
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_analytics_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.analytics_events
  WHERE created_at < now() - interval '90 days';

  DELETE FROM public.analytics_events_staging
  WHERE created_at < now() - interval '90 days'
    AND flushed = true;
END;
$$;

-- ============================================================
-- 9) Cron job — analytics-cleanup-daily at 03:00
-- ============================================================
DO $$
BEGIN
  PERFORM cron.unschedule('analytics-cleanup-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analytics-cleanup-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'analytics-cleanup-daily',
  '0 3 * * *',
  $$SELECT public.cleanup_analytics_events()$$
);
