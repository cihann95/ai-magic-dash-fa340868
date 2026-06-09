
-- Fix Blitz cron jobs: use x-cron-secret from vault and sub-minute scheduling

SELECT cron.unschedule('blitz-settler');
SELECT cron.unschedule('blitz-settler-30s');

SELECT cron.schedule(
  'blitz-settler-10s',
  '10 seconds',
  $$
  SELECT net.http_post(
    url := 'https://wufhbvshqhiiwjrvfzey.supabase.co/functions/v1/blitz-settle-room',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
