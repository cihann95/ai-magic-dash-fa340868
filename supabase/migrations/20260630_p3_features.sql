-- P3: 2FA, audit_log, share cards infrastructure
-- 1. user_2fa table
CREATE TABLE IF NOT EXISTS public.user_2fa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  totp_enabled boolean NOT NULL DEFAULT false,
  totp_secret text,
  backup_codes text[] DEFAULT ARRAY[]::text[],
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.user_2fa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_2fa_own" ON public.user_2fa FOR ALL USING (user_id = auth.uid());
CREATE POLICY "user_2fa_admin" ON public.user_2fa FOR SELECT USING (
  (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) = 'admin'
);

-- 2. audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_admin_all" ON public.audit_logs FOR ALL USING (
  (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) = 'admin'
);
-- Users can see own logs
CREATE POLICY "audit_logs_own" ON public.audit_logs FOR SELECT USING (user_id = auth.uid());
