-- ==============================================================================
-- Migration 23: Fix Privilege Escalation, Orphaned Records, and Strict Row Ownership
-- Project: Mydan / ywdlrrdkjbtpfgacuuoy
-- Purpose:
--   1. Close Privilege Escalation: Prevent self-updating role, is_active, or branch_id
--   2. Strict Multi-Tenancy: Ban company_id IS NULL across all tables
--   3. Row Ownership: Restrict supervisor writes to their own records only
-- ==============================================================================

BEGIN;

-- ── 1. CLOSE PRIVILEGE ESCALATION ON SUPERVISORS TABLE ─────────────────────────
-- Revoke broad column grants from authenticated
REVOKE UPDATE (role, is_active, branch_id) ON public.supervisors FROM authenticated;

-- Only allow authenticated users to update their personal profile info (phone, full_name, device_id)
GRANT UPDATE (full_name, phone, device_id) ON public.supervisors TO authenticated;

-- Tighten supervisors_self_update policy with strict WITH CHECK protection
DROP POLICY IF EXISTS "supervisors_self_update" ON public.supervisors;
CREATE POLICY "supervisors_self_update" ON public.supervisors
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND role = (SELECT s.role FROM public.supervisors s WHERE s.id = supervisors.id)
    AND is_active = (SELECT s.is_active FROM public.supervisors s WHERE s.id = supervisors.id)
    AND (branch_id IS NOT DISTINCT FROM (SELECT s.branch_id FROM public.supervisors s WHERE s.id = supervisors.id))
  );

-- Admin updates (requires admin/manager role within the company)
DROP POLICY IF EXISTS "supervisors_admin_update" ON public.supervisors;
CREATE POLICY "supervisors_admin_update" ON public.supervisors
  FOR UPDATE TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
  );


-- ── 2. REMOVE ORPHANED ACCESS (company_id IS NULL VULNERABILITY) ───────────────
-- Delete or assign any orphaned field surveys or orders
DELETE FROM public.field_surveys WHERE company_id IS NULL;
DELETE FROM public.orders WHERE company_id IS NULL;

-- Enforce NOT NULL on company_id for multi-tenant integrity
ALTER TABLE IF EXISTS public.field_surveys ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE IF EXISTS public.orders ALTER COLUMN company_id SET NOT NULL;

-- Drop permissive company_id IS NULL policies from Migration 99
DROP POLICY IF EXISTS "field_surveys_company_access" ON public.field_surveys;
DROP POLICY IF EXISTS "orders_company_access" ON public.orders;

-- ── 3. STRICT ROW OWNERSHIP FOR SURVEYS & ORDERS ──────────────────────────────
-- Supervisors can only write/modify their OWN surveys; Admins can manage all company surveys
DROP POLICY IF EXISTS "field_surveys_strict_ownership" ON public.field_surveys;
CREATE POLICY "field_surveys_strict_ownership" ON public.field_surveys
  FOR ALL TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      supervisor_id = get_my_supervisor_id()
      OR get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
    )
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND (
      supervisor_id = get_my_supervisor_id()
      OR get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
    )
  );

-- Supervisors can only write/modify their OWN orders; Admins can manage all company orders
DROP POLICY IF EXISTS "orders_strict_ownership" ON public.orders;
CREATE POLICY "orders_strict_ownership" ON public.orders
  FOR ALL TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      supervisor_id = get_my_supervisor_id()
      OR get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
    )
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND (
      supervisor_id = get_my_supervisor_id()
      OR get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
    )
  );

COMMIT;
