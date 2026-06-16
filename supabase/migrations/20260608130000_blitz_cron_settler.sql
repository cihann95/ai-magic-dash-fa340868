-- Blitz settle pg_cron job: Her 5 saniyede süresi dolmuş active odaları bulup settle et
-- Bu job, client-side tetiklemenin yedek/güvencesidir.
-- blitz-settle-room fonksiyonu idempotent olduğu için çift çağrım güvenlidir.

-- Eski job varsa temizle
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'blitz-settler-5s') THEN
    PERFORM cron.unschedule('blitz-settler-5s');
  END IF;
END $$;

SELECT cron.schedule(
  'blitz-settler-5s',
  '*/5 * * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xynpcusbbjfoyphtfcgz.supabase.co/functions/v1/blitz-settle-room',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
