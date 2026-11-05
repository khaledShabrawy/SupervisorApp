-- Historical script only. Never replay after the audited security contract.
DO $$ BEGIN IF to_regprocedure('public.mdn_security_contract_version_v1()') IS NOT NULL THEN RAISE EXCEPTION 'Legacy SQL replay blocked: use versioned migrations.'; END IF; END $$;
-- ==============================================================================
-- MYDAN MIGRATION 25: Operations Alerts & Admin Notification Policies
-- Safe to run multiple times (Idempotent).
-- ==============================================================================

BEGIN;

-- 1. Ensure supervisor can insert operational alerts (OOR visits & Critical OOS)
DROP POLICY IF EXISTS "notifications_supervisor_insert_alert" ON public.notifications;
CREATE POLICY "notifications_supervisor_insert_alert" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_my_company_id()
  AND supervisor_id = get_my_supervisor_id()
  AND type IN ('oor_visit', 'oos_critical')
);

-- 2. Allow Admins and Managers to read all notifications for their company
DROP POLICY IF EXISTS "notifications_admin_select" ON public.notifications;
CREATE POLICY "notifications_admin_select" ON public.notifications
FOR SELECT TO authenticated
USING (
  company_id = get_my_company_id()
  AND (
    supervisor_id = get_my_supervisor_id()
    OR get_my_role() IN ('admin', 'super_admin', 'manager', 'branch_manager')
  )
);

COMMIT;
