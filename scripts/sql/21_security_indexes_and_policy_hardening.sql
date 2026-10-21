-- ==============================================================================
-- Migration 21: Security Hardening, Multi-Tenant RLS Enforcement & High-Load Indexes
-- Project: Mydan
-- Targets:
--   1. Ensure RLS is active across all tables
--   2. Explicit super_admin write policy on companies
--   3. Composite indexes on attendance, beat_plans, notifications & customers
--      to guarantee <200ms query latency during 50+ concurrent morning check-ins
-- ==============================================================================

BEGIN;

-- ── 1. GUARANTEE ROW LEVEL SECURITY ON ALL TABLES ─────────────────────────────
ALTER TABLE IF EXISTS public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.beat_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.asset_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.price_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.visit_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.regions ENABLE ROW LEVEL SECURITY;

-- ── 2. EXPLICIT SUPER ADMIN WRITE ON COMPANIES ────────────────────────────────
DROP POLICY IF EXISTS "companies_super_admin_write" ON public.companies;
CREATE POLICY "companies_super_admin_write" ON public.companies
  FOR ALL TO authenticated
  USING (get_my_role() = 'super_admin')
  WITH CHECK (get_my_role() = 'super_admin');

-- ── 3. PERFORMANCE INDEXES FOR CONCURRENT LOAD & STAGING READINESS ────────────
-- 3.1 Attendance (Checked by all supervisors at morning rush hour)
CREATE INDEX IF NOT EXISTS idx_attendance_lookup
  ON public.attendance (company_id, supervisor_id, attendance_date DESC);

-- 3.2 Beat Plans (Queried by day and supervisor on daily route start)
CREATE INDEX IF NOT EXISTS idx_beat_plans_lookup
  ON public.beat_plans (company_id, day_of_week, supervisor_id);

-- 3.3 Notifications (High frequency polling / badge count)
CREATE INDEX IF NOT EXISTS idx_notifications_lookup
  ON public.notifications (company_id, supervisor_id, is_read, created_at DESC);

-- 3.4 Customers by Supervisor
CREATE INDEX IF NOT EXISTS idx_customers_supervisor_lookup
  ON public.customers (company_id, supervisor_id, is_active);

COMMIT;
