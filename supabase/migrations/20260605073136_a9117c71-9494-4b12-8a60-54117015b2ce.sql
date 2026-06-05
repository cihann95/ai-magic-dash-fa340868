DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'cron_secret' LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret('98ee5572d464a073a5b5ef998ba5fdad80fa946f892184d4f502c77d416626c3', 'cron_secret', 'Shared secret for pg_cron -> edge function calls');
  ELSE
    PERFORM vault.update_secret(v_id, '98ee5572d464a073a5b5ef998ba5fdad80fa946f892184d4f502c77d416626c3', 'cron_secret', 'Shared secret for pg_cron -> edge function calls');
  END IF;
END $$;