-- Enable required extensions for scheduled background jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove existing schedules (idempotent re-apply)
DO $$
BEGIN
  PERFORM cron.unschedule('price-feed-every-minute')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'price-feed-every-minute');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('ai-risk-monitor-15min')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-risk-monitor-15min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule price-feed every minute
SELECT cron.schedule(
  'price-feed-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://wufhbvshqhiiwjrvfzey.supabase.co/functions/v1/price-feed',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Schedule ai-risk-monitor every 15 minutes
SELECT cron.schedule(
  'ai-risk-monitor-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://wufhbvshqhiiwjrvfzey.supabase.co/functions/v1/ai-risk-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);