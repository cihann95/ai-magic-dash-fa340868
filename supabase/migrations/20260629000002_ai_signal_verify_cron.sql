-- AI Signal Verify cron: every 30 minutes, check unverified signals after 24h
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-signal-verify') THEN
    PERFORM cron.unschedule('ai-signal-verify');
  END IF;
END $$;

SELECT cron.schedule(
  'ai-signal-verify',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xynpcusbbjfoyphtfcgz.supabase.co/functions/v1/ai-signal-verify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
