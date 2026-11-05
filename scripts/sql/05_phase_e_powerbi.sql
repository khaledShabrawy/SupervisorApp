-- Historical script only. Never replay after the audited security contract.
DO $$ BEGIN IF to_regprocedure('public.mdn_security_contract_version_v1()') IS NOT NULL THEN RAISE EXCEPTION 'Legacy SQL replay blocked: use versioned migrations.'; END IF; END $$;
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

-- BI access is deliberately not provisioned here.
-- Never create a shared BYPASSRLS reporting reader for multiple companies.
-- Review tenant-specific identities, grants and view definitions before enabling reporting access.
