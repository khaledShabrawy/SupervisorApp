-- ==============================================================================
-- Migration 27: Fix vw_branch_performance View (Add company_id & fix CTE joins)
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_branch_performance CASCADE;

CREATE OR REPLACE VIEW public.vw_branch_performance
WITH (security_invoker = true) AS
WITH visit_counts AS (
  SELECT
    s.company_id,
    s.branch_id,
    COUNT(v.id) AS total_visits,
    COUNT(v.id) FILTER (WHERE v.status = 'completed') AS completed_visits,
    COUNT(v.id) FILTER (WHERE v.on_beat = false) AS oor_visits
  FROM public.supervisors s
  LEFT JOIN public.visits v ON v.supervisor_id = s.id
  GROUP BY s.company_id, s.branch_id
),
order_counts AS (
  SELECT
    s.company_id,
    s.branch_id,
    COUNT(o.id) AS total_orders,
    COALESCE(SUM(o.total_amount), 0) AS total_order_amount
  FROM public.supervisors s
  LEFT JOIN public.orders o ON o.supervisor_id = s.id
  GROUP BY s.company_id, s.branch_id
)
SELECT
  b.company_id,
  b.id AS branch_id,
  b.name AS branch_name,
  COALESCE(vc.total_visits, 0) AS total_visits,
  COALESCE(vc.completed_visits, 0) AS completed_visits,
  COALESCE(vc.oor_visits, 0) AS oor_visits,
  COALESCE(oc.total_orders, 0) AS total_orders,
  COALESCE(oc.total_order_amount, 0) AS total_order_amount
FROM public.branches b
LEFT JOIN visit_counts vc ON vc.branch_id = b.id AND vc.company_id = b.company_id
LEFT JOIN order_counts oc ON oc.branch_id = b.id AND oc.company_id = b.company_id;

REVOKE ALL ON public.vw_branch_performance FROM anon;
GRANT SELECT ON public.vw_branch_performance TO authenticated;
GRANT SELECT ON public.vw_branch_performance TO service_role;
