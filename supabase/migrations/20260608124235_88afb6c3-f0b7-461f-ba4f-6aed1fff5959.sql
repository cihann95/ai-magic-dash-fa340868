
-- 1) profiles: real_balance alanları
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS real_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS real_balance_locked numeric NOT NULL DEFAULT 0;

-- profiles guard trigger'ını yenile (real_balance da koru)
CREATE OR REPLACE FUNCTION public.guard_profiles_financial_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF caller_role IS DISTINCT FROM 'service_role' THEN
    IF NEW.demo_balance IS DISTINCT FROM OLD.demo_balance
      OR NEW.initial_balance IS DISTINCT FROM OLD.initial_balance
      OR NEW.real_balance IS DISTINCT FROM OLD.real_balance
      OR NEW.real_balance_locked IS DISTINCT FROM OLD.real_balance_locked
    THEN
      RAISE EXCEPTION 'profiles: balance fields can only be modified by the backend';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Enum'lar
DO $$ BEGIN
  CREATE TYPE public.blitz_status AS ENUM ('waiting','active','settling','finished','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.blitz_mode AS ENUM ('public','private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.blitz_side AS ENUM ('long','short');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) blitz_rooms
CREATE TABLE IF NOT EXISTS public.blitz_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  entry_fee numeric NOT NULL CHECK (entry_fee > 0),
  status public.blitz_status NOT NULL DEFAULT 'waiting',
  mode public.blitz_mode NOT NULL DEFAULT 'public',
  invite_code text UNIQUE,
  max_players int NOT NULL DEFAULT 2 CHECK (max_players BETWEEN 2 AND 8),
  starts_at timestamptz,
  ends_at timestamptz,
  start_price numeric,
  winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pot numeric NOT NULL DEFAULT 0,
  fee_collected numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.blitz_rooms TO authenticated;
GRANT ALL ON public.blitz_rooms TO service_role;

ALTER TABLE public.blitz_rooms ENABLE ROW LEVEL SECURITY;

-- Authenticated kullanıcılar tüm odaları listeleyebilir (lobi)
CREATE POLICY "Authenticated can read rooms"
  ON public.blitz_rooms FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER blitz_rooms_updated_at
  BEFORE UPDATE ON public.blitz_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_blitz_rooms_status_symbol_fee
  ON public.blitz_rooms (status, symbol, entry_fee);
CREATE INDEX IF NOT EXISTS idx_blitz_rooms_ends_at
  ON public.blitz_rooms (ends_at) WHERE status = 'active';

-- 4) blitz_participants
CREATE TABLE IF NOT EXISTS public.blitz_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.blitz_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  final_pnl numeric,
  final_balance numeric,
  rank int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

GRANT SELECT ON public.blitz_participants TO authenticated;
GRANT ALL ON public.blitz_participants TO service_role;

ALTER TABLE public.blitz_participants ENABLE ROW LEVEL SECURITY;

-- Kullanıcı, üyesi olduğu herhangi bir odanın tüm katılımcılarını görebilir
CREATE POLICY "Members can see room participants"
  ON public.blitz_participants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.blitz_participants p2
      WHERE p2.room_id = blitz_participants.room_id
        AND p2.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_blitz_participants_room ON public.blitz_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_blitz_participants_user ON public.blitz_participants(user_id);

-- 5) blitz_orders
CREATE TABLE IF NOT EXISTS public.blitz_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.blitz_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  side public.blitz_side NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  entry_price numeric NOT NULL,
  exit_price numeric,
  pnl numeric,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.blitz_orders TO authenticated;
GRANT ALL ON public.blitz_orders TO service_role;

ALTER TABLE public.blitz_orders ENABLE ROW LEVEL SECURITY;

-- Kullanıcı yalnızca üyesi olduğu odanın emirlerini görebilir
CREATE POLICY "Members can see room orders"
  ON public.blitz_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.blitz_participants p
      WHERE p.room_id = blitz_orders.room_id
        AND p.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_blitz_orders_room ON public.blitz_orders(room_id);
CREATE INDEX IF NOT EXISTS idx_blitz_orders_user ON public.blitz_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_blitz_orders_open
  ON public.blitz_orders(room_id) WHERE closed_at IS NULL;

-- 6) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.blitz_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.blitz_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.blitz_orders;

ALTER TABLE public.blitz_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.blitz_participants REPLICA IDENTITY FULL;
ALTER TABLE public.blitz_orders REPLICA IDENTITY FULL;
