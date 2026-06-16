-- Enable pgcrypto (required for gen_random_bytes)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable Vault for secure secret storage
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Generate a strong cron shared secret if absent
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret', 'Shared secret for pg_cron -> edge function calls');
  END IF;
END $$;

-- Drop previous (broken-auth) schedules
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'price-feed-every-minute') THEN
    PERFORM cron.unschedule('price-feed-every-minute');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-risk-monitor-15min') THEN
    PERFORM cron.unschedule('ai-risk-monitor-15min');
  END IF;
END $$;

-- Re-schedule price-feed every minute, sending CRON secret in custom header
SELECT cron.schedule(
  'price-feed-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xynpcusbbjfoyphtfcgz.supabase.co/functions/v1/price-feed',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Re-schedule ai-risk-monitor every 15 minutes
SELECT cron.schedule(
  'ai-risk-monitor-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xynpcusbbjfoyphtfcgz.supabase.co/functions/v1/ai-risk-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);