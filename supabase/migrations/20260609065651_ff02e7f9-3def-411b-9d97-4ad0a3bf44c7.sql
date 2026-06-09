
DROP VIEW IF EXISTS public.platform_revenue_daily;

CREATE VIEW public.platform_revenue_daily
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', created_at)::date AS day,
  source,
  COUNT(*)::int AS tx_count,
  SUM(amount)::numeric AS total_amount
FROM public.platform_revenue
GROUP BY 1, 2
ORDER BY 1 DESC;

GRANT SELECT ON public.platform_revenue_daily TO authenticated;
