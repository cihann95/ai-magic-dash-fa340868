-- Fix: Allow anon (public) reads on price_cache for execute-trade to work
-- The frontend uses anon key to read prices; RLS policy must permit this
CREATE POLICY "price_cache_read_public" ON public.price_cache FOR SELECT TO anon USING (true);

-- Also fix realtime subscription for anon users on price_cache
-- This allows the frontend to receive price updates without auth
ALTER TABLE public.price_cache REPLICA IDENTITY FULL;