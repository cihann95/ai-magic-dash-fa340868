-- Roles enum + table (separate from profiles for security)
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  demo_balance NUMERIC(20,2) NOT NULL DEFAULT 100000.00,
  initial_balance NUMERIC(20,2) NOT NULL DEFAULT 100000.00,
  preferred_language TEXT DEFAULT 'tr',
  preferred_theme TEXT DEFAULT 'dark',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Positions (open)
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long','short')),
  quantity NUMERIC(20,8) NOT NULL,
  entry_price NUMERIC(20,8) NOT NULL,
  current_price NUMERIC(20,8),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_positions_user ON public.positions(user_id);

CREATE POLICY "Users view own positions" ON public.positions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own positions" ON public.positions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own positions" ON public.positions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own positions" ON public.positions FOR DELETE USING (auth.uid() = user_id);

-- Trades (history)
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  action TEXT NOT NULL CHECK (action IN ('open','close')),
  quantity NUMERIC(20,8) NOT NULL,
  price NUMERIC(20,8) NOT NULL,
  total NUMERIC(20,2) NOT NULL,
  pnl NUMERIC(20,2),
  executor TEXT NOT NULL DEFAULT 'demo',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_trades_user ON public.trades(user_id, executed_at DESC);

CREATE POLICY "Users view own trades" ON public.trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own trades" ON public.trades FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Watchlist
CREATE TABLE public.watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own watchlist" ON public.watchlist FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own watchlist" ON public.watchlist FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own watchlist" ON public.watchlist FOR DELETE USING (auth.uid() = user_id);

-- AI conversations & messages
CREATE TABLE public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own conversations" ON public.ai_conversations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ai_messages_conv ON public.ai_messages(conversation_id, created_at);
CREATE POLICY "Users manage own ai messages" ON public.ai_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger fn
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_positions_updated BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ai_conv_updated BEFORE UPDATE ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile + role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();