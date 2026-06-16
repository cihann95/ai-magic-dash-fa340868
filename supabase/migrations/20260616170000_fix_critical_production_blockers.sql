-- =============================================================================
-- Production Critical Blockers Fix
-- Created: 2026-06-16
--
-- Sorunlar:
-- 1. has_role RPC 403 → Migration 20260505063712 authenticated'tan EXECUTE'u
--    REVOKE etmişti. Frontend doğrudan çağırıyor → 403. Tekrar GRANT ediyoruz.
-- 2. profiles 500 → PostgREST schema cache eski. NOTIFY pgrst ile yenileniyor.
-- 3. Yeni kullanıcıların profile satırı oluşmamış olabilir
--    (handle_new_user tetiklenmemişse) → backfill ekleniyor.
-- 4. handle_new_user trigger'ı daha dayanıklı hale getiriliyor
--    (ON CONFLICT DO NOTHING ile duplicate'e karşı koruma).
-- =============================================================================

-- 1) has_role RPC'sini authenticated ve anon'a geri aç.
--    Fonksiyon SECURITY DEFINER ama sadece user_id + role alıp boolean
--    dönüyor. Yan etkisi yok, veri sızdırmaz.
--    Frontend (CommandPalette, AdminBlitz) doğrudan çağırıyor.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)
  TO authenticated, anon;

-- 2) Eksik profilleri backfill et (signup sırasında handle_new_user
--    tetiklenmemiş kullanıcılar için). admintest123 gibi hesaplar için
--    gerekli — execute-trade "Profil bulunamadı" 400 dönüyordu.
INSERT INTO public.profiles (id, display_name, demo_balance, initial_balance)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)),
  100000.00,
  100000.00
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 3) Eksik user_roles kayıtlarını da backfill et
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 4) handle_new_user trigger'ını dayanıklı hale getir
--    ON CONFLICT ekleyerek duplicate INSERT hatalarını yut
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $$;

-- 5) PostgREST schema cache'ini invalidate et
--    (yeni kolonları ve policy'leri PostgREST'in tanıması için)
NOTIFY pgrst, 'reload schema';
