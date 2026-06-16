
-- Fix Blitz cron jobs: use x-cron-secret from vault and sub-minute scheduling

DO $$ BEGIN
  PERFORM cron.unschedule('blitz-settler') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'blitz-settler');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('blitz-settler-30s') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'blitz-settler-30s');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('blitz-settler-5s') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'blitz-settler-5s');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'blitz-settler-10s',
  '10 seconds',
  $$
  SELECT net.http_post(
    url := 'https://xynpcusbbjfoyphtfcgz.supabase.co/functions/v1/blitz-settle-room',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
