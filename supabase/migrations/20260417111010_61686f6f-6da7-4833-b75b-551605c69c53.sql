-- ============= PUBLIC PROFILES (önce, çünkü diğer policy'ler buna bakıyor) =============
CREATE TABLE public.public_profiles (
  user_id UUID NOT NULL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  bio TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  show_portfolio BOOLEAN NOT NULL DEFAULT false,
  show_trades BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp_select_active" ON public.public_profiles FOR SELECT USING (is_active = true OR auth.uid() = user_id);
CREATE POLICY "pp_insert_own" ON public.public_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pp_update_own" ON public.public_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "pp_delete_own" ON public.public_profiles FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_pp_updated BEFORE UPDATE ON public.public_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= ORDERS =============
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('limit','stop','take_profit','stop_loss')),
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  trigger_price NUMERIC NOT NULL CHECK (trigger_price > 0),
  limit_price NUMERIC,
  position_id UUID,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','cancelled','expired')),
  filled_at TIMESTAMPTZ,
  fill_price NUMERIC,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_select_own" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "orders_insert_own" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "orders_update_own" ON public.orders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "orders_delete_own" ON public.orders FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_orders_user_status ON public.orders(user_id, status);
CREATE INDEX idx_orders_open_symbol ON public.orders(symbol) WHERE status = 'open';
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= PRICE ALERTS =============
CREATE TABLE public.price_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above','below')),
  target_price NUMERIC NOT NULL CHECK (target_price > 0),
  triggered BOOLEAN NOT NULL DEFAULT false,
  triggered_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_select_own" ON public.price_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "alerts_insert_own" ON public.price_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alerts_update_own" ON public.price_alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "alerts_delete_own" ON public.price_alerts FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_alerts_active ON public.price_alerts(symbol) WHERE triggered = false;

-- ============= PRICE CACHE =============
CREATE TABLE public.price_cache (
  symbol TEXT NOT NULL PRIMARY KEY,
  asset_class TEXT NOT NULL,
  price NUMERIC NOT NULL,
  change_24h NUMERIC,
  change_pct_24h NUMERIC,
  volume_24h NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.price_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "price_cache_read_authenticated" ON public.price_cache FOR SELECT TO authenticated USING (true);

-- ============= ACHIEVEMENTS =============
CREATE TABLE public.achievements (
  code TEXT NOT NULL PRIMARY KEY,
  name_tr TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_tr TEXT NOT NULL,
  description_en TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'trophy',
  xp_reward INTEGER NOT NULL DEFAULT 100,
  rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','rare','epic','legendary')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements_read_all" ON public.achievements FOR SELECT USING (true);

INSERT INTO public.achievements (code, name_tr, name_en, description_tr, description_en, icon, xp_reward, rarity) VALUES
  ('first_trade','İlk İşlem','First Trade','İlk demo işleminizi gerçekleştirdiniz','You executed your first demo trade','rocket',100,'common'),
  ('first_profit','İlk Kâr','First Profit','İlk kârlı pozisyonunuzu kapattınız','You closed your first profitable position','trending-up',150,'common'),
  ('streak_7','7 Günlük Seri','7-Day Streak','7 gün üst üste platformu kullandınız','7 consecutive days of activity','flame',300,'rare'),
  ('streak_30','30 Günlük Seri','30-Day Streak','30 gün üst üste aktif kaldınız','30 consecutive days of activity','flame',1500,'epic'),
  ('ten_profits','10 Kârlı İşlem','10 Profitable Trades','10 kârlı pozisyon kapattınız','Closed 10 profitable positions','medal',500,'rare'),
  ('diversified','Çeşitlendirme Ustası','Diversification Master','5 farklı varlık sınıfında pozisyon açtınız','Opened positions in 5 asset classes','layers',400,'rare'),
  ('big_winner','Büyük Kazanan','Big Winner','Tek işlemde +$1000 kâr ettiniz','Made +$1000 profit in a single trade','crown',800,'epic'),
  ('night_owl','Gece Kuşu','Night Owl','Gece 02:00-05:00 arası işlem yaptınız','Traded between 2-5 AM','moon',150,'common'),
  ('whale','Balina','Whale','Tek işlemde $50,000 üzeri hacim','$50k+ volume in a single trade','anchor',1000,'epic'),
  ('comeback','Geri Dönüş','Comeback Kid','Bakiyenizi düşüşten sonra %20 toparladınız','Recovered 20% after a drawdown','undo',600,'rare'),
  ('ai_user','AI Dostu','AI Friend','AI asistanı 50 kez kullandınız','Used AI assistant 50 times','sparkles',300,'common'),
  ('legend','Efsane','Legend','Seviye 50 ulaştınız','Reached level 50','star',5000,'legendary');

-- ============= USER STATS =============
CREATE TABLE public.user_stats (
  user_id UUID NOT NULL PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,
  total_trades INTEGER NOT NULL DEFAULT 0,
  profitable_trades INTEGER NOT NULL DEFAULT 0,
  total_pnl NUMERIC NOT NULL DEFAULT 0,
  best_trade_pnl NUMERIC NOT NULL DEFAULT 0,
  ai_uses INTEGER NOT NULL DEFAULT 0,
  asset_classes_traded TEXT[] NOT NULL DEFAULT '{}',
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stats_select_own" ON public.user_stats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "stats_select_public" ON public.user_stats FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.public_profiles pp WHERE pp.user_id = user_stats.user_id AND pp.is_active = true)
);
CREATE POLICY "stats_update_own" ON public.user_stats FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "stats_insert_own" ON public.user_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_stats_updated BEFORE UPDATE ON public.user_stats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= USER ACHIEVEMENTS =============
CREATE TABLE public.user_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  achievement_code TEXT NOT NULL REFERENCES public.achievements(code) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_code)
);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ua_select_own" ON public.user_achievements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ua_select_public" ON public.user_achievements FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.public_profiles pp WHERE pp.user_id = user_achievements.user_id AND pp.is_active = true)
);

-- ============= DAILY BRIEFS =============
CREATE TABLE public.daily_briefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  brief_date DATE NOT NULL,
  content TEXT NOT NULL,
  sentiment TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, brief_date)
);
ALTER TABLE public.daily_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "briefs_select_own" ON public.daily_briefs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "briefs_update_own" ON public.daily_briefs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "briefs_insert_own" ON public.daily_briefs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============= TRADE JOURNAL =============
CREATE TABLE public.trade_journal (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  trade_id UUID,
  position_id UUID,
  symbol TEXT NOT NULL,
  thesis TEXT,
  lessons TEXT,
  emotion TEXT CHECK (emotion IN ('confident','uncertain','fearful','greedy','calm','excited')),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trade_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journal_select_own" ON public.trade_journal FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "journal_insert_own" ON public.trade_journal FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "journal_update_own" ON public.trade_journal FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "journal_delete_own" ON public.trade_journal FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_journal_updated BEFORE UPDATE ON public.trade_journal FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= FOLLOWERS =============
CREATE TABLE public.followers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID NOT NULL,
  following_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id <> following_id)
);
ALTER TABLE public.followers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "followers_read_all_authenticated" ON public.followers FOR SELECT TO authenticated USING (true);
CREATE POLICY "followers_insert_self" ON public.followers FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "followers_delete_self" ON public.followers FOR DELETE USING (auth.uid() = follower_id);

-- ============= GAMIFICATION FUNCTIONS =============
CREATE OR REPLACE FUNCTION public.award_xp(_user_id UUID, _amount INTEGER)
RETURNS TABLE(new_xp INTEGER, new_level INTEGER, leveled_up BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE cur_xp INTEGER; cur_level INTEGER; next_level INTEGER;
BEGIN
  INSERT INTO public.user_stats (user_id) VALUES (_user_id) ON CONFLICT DO NOTHING;
  UPDATE public.user_stats SET xp = xp + _amount WHERE user_id = _user_id
    RETURNING xp, level INTO cur_xp, cur_level;
  next_level := GREATEST(1, FLOOR(SQRT(cur_xp::numeric / 100))::int + 1);
  IF next_level <> cur_level THEN
    UPDATE public.user_stats SET level = next_level WHERE user_id = _user_id;
  END IF;
  RETURN QUERY SELECT cur_xp, next_level, (next_level <> cur_level);
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_streak(_user_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE last_d DATE; cur_streak INTEGER; new_streak INTEGER;
BEGIN
  INSERT INTO public.user_stats (user_id) VALUES (_user_id) ON CONFLICT DO NOTHING;
  SELECT last_active_date, current_streak INTO last_d, cur_streak
    FROM public.user_stats WHERE user_id = _user_id;
  IF last_d = CURRENT_DATE THEN RETURN cur_streak;
  ELSIF last_d = CURRENT_DATE - 1 THEN new_streak := cur_streak + 1;
  ELSE new_streak := 1;
  END IF;
  UPDATE public.user_stats
    SET current_streak = new_streak,
        longest_streak = GREATEST(longest_streak, new_streak),
        last_active_date = CURRENT_DATE
    WHERE user_id = _user_id;
  RETURN new_streak;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_achievement(_user_id UUID, _code TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE reward INTEGER; inserted BOOLEAN := false;
BEGIN
  SELECT xp_reward INTO reward FROM public.achievements WHERE code = _code;
  IF reward IS NULL THEN RETURN false; END IF;
  INSERT INTO public.user_achievements (user_id, achievement_code)
    VALUES (_user_id, _code) ON CONFLICT DO NOTHING
    RETURNING true INTO inserted;
  IF inserted THEN PERFORM public.award_xp(_user_id, reward); END IF;
  RETURN COALESCE(inserted, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard(_limit INTEGER DEFAULT 50)
RETURNS TABLE(user_id UUID, username TEXT, level INTEGER, xp INTEGER,
  total_pnl NUMERIC, total_trades INTEGER, win_rate NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT pp.user_id, pp.username, us.level, us.xp, us.total_pnl, us.total_trades,
    CASE WHEN us.total_trades > 0
      THEN ROUND((us.profitable_trades::numeric / us.total_trades) * 100, 1)
      ELSE 0 END AS win_rate
  FROM public.public_profiles pp
  JOIN public.user_stats us ON us.user_id = pp.user_id
  WHERE pp.is_active = true
  ORDER BY us.total_pnl DESC NULLS LAST
  LIMIT _limit;
$$;

-- ============= NEW USER HOOK GÜNCELLEMESİ =============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  INSERT INTO public.user_stats (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.user_stats (user_id)
  SELECT id FROM auth.users ON CONFLICT DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;