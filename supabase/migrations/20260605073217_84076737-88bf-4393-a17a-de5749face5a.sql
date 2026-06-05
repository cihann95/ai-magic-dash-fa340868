CREATE OR REPLACE FUNCTION public.verify_cron_secret(_token text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, vault, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'cron_secret' AND decrypted_secret = _token
  );
$$;

REVOKE EXECUTE ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_cron_secret(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_cron_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;