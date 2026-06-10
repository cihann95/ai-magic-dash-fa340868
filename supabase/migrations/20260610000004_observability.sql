-- ============================================================
-- OBSERVABILITY: structured logging for Blitz operations
-- ============================================================

CREATE TABLE IF NOT EXISTS public.observability_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service     text NOT NULL,
  event       text NOT NULL,
  level       text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error', 'critical')),
  room_id     uuid REFERENCES public.blitz_rooms(id) ON DELETE SET NULL,
  user_id     uuid,
  metadata    jsonb DEFAULT '{}'::jsonb,
  duration_ms int,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.observability_log ENABLE ROW LEVEL SECURITY;

-- service_role can write and read
CREATE POLICY "observability_log_service_all" ON public.observability_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- admins can read
CREATE POLICY "observability_log_admin_select" ON public.observability_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_observability_log_service_created
  ON public.observability_log (service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_observability_log_level_created
  ON public.observability_log (level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_observability_log_room
  ON public.observability_log (room_id);

-- Log writer RPC (service_role only via RLS + SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.log_observability(
  p_service    text,
  p_event      text,
  p_level      text DEFAULT 'info',
  p_room_id    uuid DEFAULT NULL,
  p_user_id    uuid DEFAULT NULL,
  p_metadata   jsonb DEFAULT '{}'::jsonb,
  p_duration_ms int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.observability_log (service, event, level, room_id, user_id, metadata, duration_ms)
  VALUES (p_service, p_event, p_level, p_room_id, p_user_id, p_metadata, p_duration_ms);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_observability(text, text, text, uuid, uuid, jsonb, int) TO service_role;

-- ============================================================
-- ALERT QUERIES
-- ============================================================

-- Failed settlements in the last hour
CREATE OR REPLACE FUNCTION public.alert_settlement_failures()
RETURNS TABLE(room_id uuid, error_message text, failed_at timestamptz)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT room_id, error_message, created_at
  FROM public.settlement_ledger
  WHERE status = 'failed'
    AND created_at > now() - interval '1 hour'
  ORDER BY created_at DESC;
$$;

-- Rooms with more than one settlement_ledger entry (possible duplicate payout)
CREATE OR REPLACE FUNCTION public.alert_duplicate_payout_attempts()
RETURNS TABLE(room_id uuid, attempt_count bigint, last_attempt timestamptz)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT room_id, COUNT(*)::bigint, MAX(created_at)
  FROM public.settlement_ledger
  WHERE status = 'completed'
  GROUP BY room_id
  HAVING COUNT(*) > 1
  ORDER BY attempt_count DESC;
$$;

-- Broadcast anomalies (placeholder — extend when Realtime error metrics available)
CREATE OR REPLACE FUNCTION public.alert_broadcast_anomalies()
RETURNS TABLE(event text, occurrences bigint, last_seen timestamptz)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT event, COUNT(*)::bigint, MAX(created_at)
  FROM public.observability_log
  WHERE service = 'broadcast'
    AND level IN ('error', 'critical')
    AND created_at > now() - interval '15 minutes'
  GROUP BY event
  ORDER BY occurrences DESC;
$$;

-- ============================================================
-- AUDIT: track who updates blitz_rooms
-- ============================================================

ALTER TABLE public.blitz_rooms ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.track_blitz_rooms_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_blitz_rooms_update_trg ON public.blitz_rooms;
CREATE TRIGGER track_blitz_rooms_update_trg
  BEFORE UPDATE ON public.blitz_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.track_blitz_rooms_update();
