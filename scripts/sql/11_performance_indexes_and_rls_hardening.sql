-- ==============================================================================
-- MYDAN MIGRATION 11: Production Performance Indexes & Strict RLS Tenant Isolation
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run
-- ==============================================================================

BEGIN;

-- ── 1. COMPOSITE PERFORMANCE INDEXES ──────────────────────────────────────────
-- Eliminates full-table sequential scans across high-frequency screens and queries

-- 1.1 Visits (Dashboard, History, Live Map, Range queries)
CREATE INDEX IF NOT EXISTS idx_visits_company_date
  ON public.visits (company_id, visit_date DESC);

CREATE INDEX IF NOT EXISTS idx_visits_supervisor_date
  ON public.visits (supervisor_id, visit_date DESC);

CREATE INDEX IF NOT EXISTS idx_visits_company_status
  ON public.visits (company_id, status);

-- 1.2 Shelf Audits (Dashboard PSS, KPIs, Audits list)
CREATE INDEX IF NOT EXISTS idx_shelf_audit_company_date
  ON public.shelf_audit (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shelf_audit_supervisor_date
  ON public.shelf_audit (supervisor_id, created_at DESC);

-- 1.3 Customers & Supervisors (Active lookups and cards)
CREATE INDEX IF NOT EXISTS idx_customers_company_active
  ON public.customers (company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_supervisors_company_active
  ON public.supervisors (company_id, is_active);

-- 1.4 Orders (Sales opportunities KPI and sorting)
CREATE INDEX IF NOT EXISTS idx_orders_company_date
  ON public.orders (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_company_status_date
  ON public.orders (company_id, status, created_at DESC);


-- ── 2. STRICT ROW-LEVEL SECURITY (RLS) MULTITENANT ISOLATION ───────────────────
-- Closes the 'company_id IS NULL' fallback gap in orders and field_surveys,
-- guaranteeing zero cross-tenant visibility or leakage.

-- 2.1 Backfill any orphaned rows before enforcing strict policies
UPDATE public.field_surveys fs
SET company_id = s.company_id
FROM public.supervisors s
WHERE (fs.supervisor_id = s.id OR fs.supervisor_id = s.user_id)
  AND fs.company_id IS NULL;

UPDATE public.orders o
SET company_id = s.company_id
FROM public.supervisors s
WHERE (o.supervisor_id = s.id OR o.supervisor_id = s.user_id)
  AND o.company_id IS NULL;

-- 2.2 Harden Field Surveys RLS
DROP POLICY IF EXISTS "field_surveys_tenant" ON public.field_surveys;
DROP POLICY IF EXISTS "field_surveys_company_strict" ON public.field_surveys;

CREATE POLICY "field_surveys_company_strict" ON public.field_surveys
  FOR ALL TO authenticated
  USING (
    company_id = get_my_company_id()
    OR get_my_role() = 'super_admin'
  )
  WITH CHECK (
    company_id = get_my_company_id()
    OR get_my_role() = 'super_admin'
  );

-- 2.3 Harden Orders RLS
DROP POLICY IF EXISTS "orders_company_all" ON public.orders;
DROP POLICY IF EXISTS "orders_company_strict" ON public.orders;

CREATE POLICY "orders_company_strict" ON public.orders
  FOR ALL TO authenticated
  USING (
    company_id = get_my_company_id()
    OR get_my_role() = 'super_admin'
  )
  WITH CHECK (
    company_id = get_my_company_id()
    OR get_my_role() = 'super_admin'
  );

COMMIT;

-- ==============================================================================
-- Verification queries (optional):
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('visits', 'shelf_audit', 'orders');
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename IN ('orders', 'field_surveys');
-- ==============================================================================
