-- Phase 0 follow-up: supervisor isolation for visits / visit_tasks.
-- Run in Supabase SQL Editor (project ywdlrrdkjbtpfgacuuoy). Take a backup first.
-- After running: get_advisors(type="security") and re-test the app as a plain supervisor.

BEGIN;

-- 1) visits: visits_read / visits_update let ANY supervisor read and modify every visit in
--    the company. visits_own already grants: own visits + admin/branch_manager/super_admin
--    company-wide. Dropping the two permissive policies leaves visits_own in charge.
DROP POLICY IF EXISTS "visits_read" ON public.visits;
DROP POLICY IF EXISTS "visits_update" ON public.visits;

-- Inserts must be for the caller (managers may still create on behalf of their company).
DROP POLICY IF EXISTS "visits_insert" ON public.visits;
CREATE POLICY "visits_insert" ON public.visits FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_my_company_id()
  AND (
    supervisor_id = get_my_supervisor_id()
    OR get_my_role() IN ('admin', 'branch_manager', 'super_admin')
  )
);

-- 2) visit_tasks: visit_tasks_own allowed ALL on any task in the company.
--    The EXISTS on visits is itself filtered by visits RLS, so a task is reachable
--    only when its parent visit is.
DROP POLICY IF EXISTS "visit_tasks_own" ON public.visit_tasks;
CREATE POLICY "visit_tasks_own" ON public.visit_tasks FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.visits v
          WHERE v.id = visit_tasks.visit_id AND v.company_id = visit_tasks.company_id)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.visits v
          WHERE v.id = visit_tasks.visit_id AND v.company_id = visit_tasks.company_id)
);

-- 3) Leftover from the removed orders feature: no client should call it.
REVOKE EXECUTE ON FUNCTION public.manager_set_order_status(uuid, text) FROM authenticated, anon, public;

-- 4) shelf_audit: same company-wide read/update leak as visits. Own rows for
--    supervisors, whole company for managers. analyze-shelf writes with
--    service_role and is unaffected.
DROP POLICY IF EXISTS "shelf_audit_read" ON public.shelf_audit;
DROP POLICY IF EXISTS "shelf_audit_update" ON public.shelf_audit;
DROP POLICY IF EXISTS "shelf_audit_insert" ON public.shelf_audit;
DROP POLICY IF EXISTS "shelf_audit_own" ON public.shelf_audit;
CREATE POLICY "shelf_audit_own" ON public.shelf_audit FOR ALL TO authenticated
USING (
  company_id = get_my_company_id()
  AND (supervisor_id = get_my_supervisor_id()
       OR get_my_role() IN ('admin', 'branch_manager', 'super_admin'))
)
WITH CHECK (
  company_id = get_my_company_id()
  AND (supervisor_id = get_my_supervisor_id()
       OR get_my_role() IN ('admin', 'super_admin'))
);

-- 5) supervisors: only supervisor_read_own exists, so the admin panel's
--    supervisor list / target form / invite flow see nobody but the admin.
DROP POLICY IF EXISTS "supervisors_admin_read" ON public.supervisors;
CREATE POLICY "supervisors_admin_read" ON public.supervisors FOR SELECT TO authenticated
USING (
  company_id = get_my_company_id()
  AND get_my_role() IN ('admin', 'branch_manager', 'super_admin')
);

COMMIT;

-- Verify (expect: visits_insert, visits_own on visits; visit_tasks_own on visit_tasks):
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename IN ('visits', 'visit_tasks');

-- Manual (Dashboard): Authentication -> Providers -> Email -> enable "Leaked password protection".
