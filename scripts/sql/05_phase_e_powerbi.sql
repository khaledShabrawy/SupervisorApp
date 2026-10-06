-- Phase E (Power BI). Run after 01–04.
-- Existing views (verified 2026-10-06, all security_invoker=true):
--   vw_daily_kpi_supervisor, vw_perfect_store_index, vw_branch_performance,
--   vw_competitor_heatmap, vw_oor_analysis
-- They have no company_id column: fine while there is one company, but add it
-- before onboarding a second tenant (a BYPASSRLS reader sees every company).

BEGIN;

-- 1) Asset fleet view (6th dashboard). Fixes vs. the plan draft:
--    status values are 'active' / 'under_maintenance' (not 'maintenance'),
--    ticket counts use DISTINCT so the ticket join cannot inflate asset counts,
--    "open" covers open/dispatched/in_progress, company_id included for slicing.
CREATE OR REPLACE VIEW public.vw_asset_fleet_health
WITH (security_invoker = true) AS
SELECT
  a.company_id,
  at2.name_ar                                            AS asset_type,
  COALESCE(b.name, c.branch, 'غير محدد')                 AS branch,
  COUNT(DISTINCT a.id)                                   AS total_assets,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'active')            AS active_count,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'under_maintenance') AS in_maintenance,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'defective')         AS defective_count,
  COUNT(DISTINCT atk.id) FILTER (WHERE atk.status IN ('open', 'dispatched', 'in_progress')) AS open_tickets,
  ROUND((AVG(EXTRACT(EPOCH FROM (atk.resolved_at - atk.created_at)) / 3600)
         FILTER (WHERE atk.resolved_at IS NOT NULL))::numeric, 1) AS avg_resolution_hours
FROM public.assets a
JOIN public.asset_types at2 ON at2.id = a.asset_type_id
LEFT JOIN public.customers c  ON c.id = a.customer_id
LEFT JOIN public.supervisors s ON s.id = c.supervisor_id
LEFT JOIN public.branches b   ON b.id = s.branch_id
LEFT JOIN public.asset_tickets atk ON atk.asset_id = a.id
WHERE a.is_active
GROUP BY a.company_id, at2.name_ar, COALESCE(b.name, c.branch, 'غير محدد');

REVOKE ALL ON public.vw_asset_fleet_health FROM anon;
GRANT SELECT ON public.vw_asset_fleet_health TO authenticated;

COMMIT;

-- 2) Read-only login for Power BI (least privilege instead of the postgres user).
--    Replace the password, run separately, then connect Power BI with:
--      Server   aws-0-eu-west-2.pooler.supabase.com   Port 5432 (session) / 6543 (transaction)
--      Database postgres
--      User     powerbi_reader.ywdlrrdkjbtpfgacuuoy
--      SSL      required · Mode: DirectQuery
--    BYPASSRLS is needed because the views are security_invoker and this role
--    has no supervisors row; it can still only SELECT the six views below.
--
-- CREATE ROLE powerbi_reader LOGIN PASSWORD '<STRONG-PASSWORD-HERE>' BYPASSRLS;
-- GRANT USAGE ON SCHEMA public TO powerbi_reader;
-- GRANT SELECT ON public.vw_daily_kpi_supervisor, public.vw_perfect_store_index,
--   public.vw_branch_performance, public.vw_competitor_heatmap, public.vw_oor_analysis,
--   public.vw_asset_fleet_health TO powerbi_reader;
-- -- security_invoker views read the base tables as the caller:
-- GRANT SELECT ON public.visits, public.supervisors, public.customers, public.shelf_audit,
--   public.competitor_products, public.orders, public.assets, public.asset_types,
--   public.asset_tickets, public.branches TO powerbi_reader;
