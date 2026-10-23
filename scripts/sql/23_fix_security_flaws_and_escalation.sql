-- ==============================================================================
-- Migration 23: Complete Hardened Multi-Tenancy, Robust RPC-Guarded Administration,
--               Legacy Policy Purge, Branch Isolation, and Zero-Loss Quarantine
-- Project: Mydan / ywdlrrdkjbtpfgacuuoy
-- Purpose:
--   1. Drop ALL legacy permissive policies (including app_settings & price_list)
--   2. Strict Row Ownership with branch-manager isolation for orders & surveys
--   3. Safe Backfill (supporting id & user_id) with permanent quarantine archive
--   4. Revoke broad column grants (company_id, user_id, role, is_active, branch_id)
--   5. Bulletproof SECURITY DEFINER admin_update_supervisor RPC (fail-closed, no super_admin escalation)
--   6. Hardened delete_supervisor_cascade RPC with explicit PUBLIC/anon revocation
--   7. Secure Reporting Views with company_id and non-multiplying CTE aggregates
-- ==============================================================================

BEGIN;

-- ── 1. DROP ALL LEGACY PERMISSIVE POLICIES ─────────────────────────────────────
-- Drop all older policies on field_surveys
DROP POLICY IF EXISTS "field_surveys_tenant" ON public.field_surveys;
DROP POLICY IF EXISTS "field_surveys_company_strict" ON public.field_surveys;
DROP POLICY IF EXISTS "field_surveys_company_access" ON public.field_surveys;
DROP POLICY IF EXISTS "field_surveys_company_all" ON public.field_surveys;
DROP POLICY IF EXISTS "field_surveys_strict_ownership" ON public.field_surveys;

-- Drop all older policies on orders
DROP POLICY IF EXISTS "orders_company_strict" ON public.orders;
DROP POLICY IF EXISTS "orders_company_all" ON public.orders;
DROP POLICY IF EXISTS "orders_company_access" ON public.orders;
DROP POLICY IF EXISTS "orders_strict_ownership" ON public.orders;
DROP POLICY IF EXISTS "orders_tenant" ON public.orders;

-- Drop all older policies on supervisors
DROP POLICY IF EXISTS "supervisor_update_own" ON public.supervisors;
DROP POLICY IF EXISTS "supervisors_update_self" ON public.supervisors;
DROP POLICY IF EXISTS "supervisors_self_update" ON public.supervisors;
DROP POLICY IF EXISTS "supervisors_admin_update" ON public.supervisors;
DROP POLICY IF EXISTS "supervisors_admin_delete" ON public.supervisors;

-- Drop all older permissive policies on app_settings and price_list
DROP POLICY IF EXISTS "app_settings_admin" ON public.app_settings;
DROP POLICY IF EXISTS "price_list_admin" ON public.price_list;
DROP POLICY IF EXISTS "app_settings_company_all" ON public.app_settings;
DROP POLICY IF EXISTS "price_list_company_all" ON public.price_list;
DROP POLICY IF EXISTS "app_settings_all" ON public.app_settings;
DROP POLICY IF EXISTS "price_list_all" ON public.price_list;
DROP POLICY IF EXISTS "app_settings_admin_write" ON public.app_settings;
DROP POLICY IF EXISTS "price_list_admin_write" ON public.price_list;
DROP POLICY IF EXISTS "app_settings_tenant_isolation" ON public.app_settings;
DROP POLICY IF EXISTS "price_list_tenant_isolation" ON public.price_list;


-- ── 2. SAFE BACKFILL & ZERO-LOSS QUARANTINE ARCHIVE ────────────────────────────
-- Safe backfill: Match both UUID id and auth user_id across legacy schema variants
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

-- Quarantine Table: Retain full record data for any unresolvable rows before removal
CREATE TABLE IF NOT EXISTS public._orphaned_records_archive (
  archive_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  record_data jsonb NOT NULL,
  archived_at timestamptz DEFAULT now()
);

REVOKE ALL ON public._orphaned_records_archive FROM PUBLIC, anon, authenticated;

INSERT INTO public._orphaned_records_archive (table_name, record_id, record_data)
SELECT 'field_surveys', id, to_jsonb(fs.*)
FROM public.field_surveys fs WHERE company_id IS NULL;

INSERT INTO public._orphaned_records_archive (table_name, record_id, record_data)
SELECT 'orders', id, to_jsonb(o.*)
FROM public.orders o WHERE company_id IS NULL;

-- Remove only the archived orphan records
DELETE FROM public.field_surveys WHERE company_id IS NULL;
DELETE FROM public.orders WHERE company_id IS NULL;

-- Enforce NOT NULL on company_id for strict multi-tenancy
ALTER TABLE IF EXISTS public.field_surveys ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE IF EXISTS public.orders ALTER COLUMN company_id SET NOT NULL;


-- ── 3. STRICT ROW OWNERSHIP & BRANCH MANAGER ISOLATION ─────────────────────────
-- Field Surveys: Supervisors own their rows; Admins see company; Branch managers see their branch only
CREATE POLICY "field_surveys_strict_ownership" ON public.field_surveys
  FOR ALL TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      supervisor_id = get_my_supervisor_id()
      OR get_my_role() IN ('admin', 'super_admin')
      OR (
        get_my_role() IN ('branch_manager', 'manager')
        AND supervisor_id IN (
          SELECT s.id FROM public.supervisors s
          WHERE s.branch_id IS NOT NULL AND s.branch_id = (
            SELECT self.branch_id FROM public.supervisors self WHERE self.user_id = auth.uid()
          )
        )
      )
    )
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND (
      supervisor_id = get_my_supervisor_id()
      OR get_my_role() IN ('admin', 'super_admin')
      OR (
        get_my_role() IN ('branch_manager', 'manager')
        AND supervisor_id IN (
          SELECT s.id FROM public.supervisors s
          WHERE s.branch_id IS NOT NULL AND s.branch_id = (
            SELECT self.branch_id FROM public.supervisors self WHERE self.user_id = auth.uid()
          )
        )
      )
    )
  );

-- Orders: Supervisors own their rows; Admins see company; Branch managers see their branch only
CREATE POLICY "orders_strict_ownership" ON public.orders
  FOR ALL TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      supervisor_id = get_my_supervisor_id()
      OR get_my_role() IN ('admin', 'super_admin')
      OR (
        get_my_role() IN ('branch_manager', 'manager')
        AND supervisor_id IN (
          SELECT s.id FROM public.supervisors s
          WHERE s.branch_id IS NOT NULL AND s.branch_id = (
            SELECT self.branch_id FROM public.supervisors self WHERE self.user_id = auth.uid()
          )
        )
      )
    )
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND (
      supervisor_id = get_my_supervisor_id()
      OR get_my_role() IN ('admin', 'super_admin')
      OR (
        get_my_role() IN ('branch_manager', 'manager')
        AND supervisor_id IN (
          SELECT s.id FROM public.supervisors s
          WHERE s.branch_id IS NOT NULL AND s.branch_id = (
            SELECT self.branch_id FROM public.supervisors self WHERE self.user_id = auth.uid()
          )
        )
      )
    )
  );

-- App Settings & Price List: Strict company scoping for SELECT and admin-only mutation
CREATE POLICY "app_settings_tenant_isolation" ON public.app_settings
  FOR ALL TO authenticated
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() IN ('admin', 'super_admin'));

CREATE POLICY "price_list_tenant_isolation" ON public.price_list
  FOR ALL TO authenticated
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() IN ('admin', 'super_admin'));


-- ── 4. REVOKE PRIVILEGED COLUMN GRANTS & SECURE SELF-UPDATE ────────────────────
-- Revoke all direct updates and sensitive column grants from authenticated
REVOKE UPDATE ON public.supervisors FROM authenticated;
REVOKE UPDATE (company_id, user_id, role, is_active, branch_id) ON public.supervisors FROM authenticated;
REVOKE DELETE ON public.supervisors FROM authenticated;

-- Only grant update on safe profile fields
GRANT UPDATE (full_name, phone, device_id) ON public.supervisors TO authenticated;

-- Tighten supervisors_self_update policy with strict WITH CHECK protection
CREATE POLICY "supervisors_self_update" ON public.supervisors
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND company_id = (SELECT s.company_id FROM public.supervisors s WHERE s.id = supervisors.id)
    AND role = (SELECT s.role FROM public.supervisors s WHERE s.id = supervisors.id)
    AND is_active = (SELECT s.is_active FROM public.supervisors s WHERE s.id = supervisors.id)
    AND (branch_id IS NOT DISTINCT FROM (SELECT s.branch_id FROM public.supervisors s WHERE s.id = supervisors.id))
  );


-- ── 5. BULLETPROOF admin_update_supervisor RPC (SECURITY DEFINER) ──────────────
CREATE OR REPLACE FUNCTION public.admin_update_supervisor(
  p_supervisor_id uuid,
  p_role text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_clear_branch boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role text;
  v_caller_company_id uuid;
  v_caller_branch_id uuid;
  v_caller_is_active boolean;
  v_target_record public.supervisors%ROWTYPE;
  v_result jsonb;
BEGIN
  -- 1. Explicit Fail-Closed Authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Fetch and Validate Caller Supervisor Record
  SELECT role, company_id, branch_id, is_active
  INTO v_caller_role, v_caller_company_id, v_caller_branch_id, v_caller_is_active
  FROM public.supervisors
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND OR v_caller_role IS NULL OR v_caller_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Forbidden: Caller supervisor record not found or inactive';
  END IF;

  IF v_caller_role NOT IN ('admin', 'super_admin', 'manager', 'branch_manager') THEN
    RAISE EXCEPTION 'Forbidden: Insufficient privileges';
  END IF;

  -- 3. Fetch Target Supervisor
  SELECT * INTO v_target_record
  FROM public.supervisors
  WHERE id = p_supervisor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supervisor not found';
  END IF;

  -- 4. Multi-Tenant Company Isolation (Using IS DISTINCT FROM to prevent NULL bypass)
  IF v_caller_role <> 'super_admin' AND v_target_record.company_id IS DISTINCT FROM v_caller_company_id THEN
    RAISE EXCEPTION 'Forbidden: Cannot manage supervisors outside your company';
  END IF;

  -- 5. Branch Manager Scope & Privilege Boundary
  IF v_caller_role IN ('branch_manager', 'manager') THEN
    IF v_caller_branch_id IS NULL THEN
      RAISE EXCEPTION 'Forbidden: Branch manager must have an assigned branch';
    END IF;
    IF v_target_record.branch_id IS DISTINCT FROM v_caller_branch_id THEN
      RAISE EXCEPTION 'Forbidden: Cannot manage supervisors outside your branch';
    END IF;
    IF p_role IS NOT NULL AND p_role NOT IN ('supervisor', 'senior_supervisor') THEN
      RAISE EXCEPTION 'Forbidden: Branch managers can only assign supervisor roles';
    END IF;
    IF p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM v_caller_branch_id THEN
      RAISE EXCEPTION 'Forbidden: Branch managers cannot reassign supervisors to other branches';
    END IF;
  END IF;

  -- 6. Super Admin Protection: Only super_admin can modify or create another super_admin
  IF v_target_record.role = 'super_admin' AND v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Forbidden: Only super_admin can modify another super_admin';
  END IF;

  IF p_role = 'super_admin' AND v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Forbidden: Only super_admin can grant the super_admin role';
  END IF;

  -- 7. Prevent Self-Demotion or Self-Deactivation
  IF v_target_record.user_id = auth.uid() THEN
    IF p_role IS NOT NULL AND p_role <> v_target_record.role THEN
      RAISE EXCEPTION 'Forbidden: Cannot change your own role';
    END IF;
    IF p_is_active IS NOT NULL AND p_is_active = false THEN
      RAISE EXCEPTION 'Forbidden: Cannot deactivate your own account';
    END IF;
  END IF;

  -- 8. Validate Specified Role against Allowed System Roles
  IF p_role IS NOT NULL AND p_role NOT IN ('admin', 'supervisor', 'senior_supervisor', 'branch_manager', 'manager', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role specified: %', p_role;
  END IF;

  -- 9. Validate Target Branch Existence & Company Ownership
  IF p_branch_id IS NOT NULL AND NOT p_clear_branch THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.branches
      WHERE id = p_branch_id AND company_id = v_target_record.company_id
    ) THEN
      RAISE EXCEPTION 'Invalid branch: Branch does not exist or does not belong to the company';
    END IF;
  END IF;

  -- 10. Perform the Update
  UPDATE public.supervisors
  SET
    role = COALESCE(p_role, role),
    is_active = COALESCE(p_is_active, is_active),
    branch_id = CASE
      WHEN p_clear_branch = true THEN NULL
      WHEN p_branch_id IS NOT NULL THEN p_branch_id
      ELSE branch_id
    END,
    full_name = CASE WHEN p_full_name IS NOT NULL AND trim(p_full_name) <> '' THEN trim(p_full_name) ELSE full_name END,
    phone = CASE WHEN p_phone IS NOT NULL THEN trim(p_phone) ELSE phone END,
    updated_at = NOW()
  WHERE id = p_supervisor_id;

  SELECT to_jsonb(s.*) INTO v_result
  FROM public.supervisors s
  WHERE s.id = p_supervisor_id;

  RETURN v_result;
END;
$$;

-- Secure Function Privileges (Revoke from PUBLIC/anon)
REVOKE EXECUTE ON FUNCTION public.admin_update_supervisor FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_supervisor TO authenticated;


-- ── 6. HARDENED delete_supervisor_cascade RPC ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_supervisor_cascade(p_supervisor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role text;
  v_caller_company_id uuid;
  v_caller_is_active boolean;
  v_target_record public.supervisors%ROWTYPE;
BEGIN
  -- 1. Explicit Fail-Closed Authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Fetch Caller Credentials
  SELECT role, company_id, is_active
  INTO v_caller_role, v_caller_company_id, v_caller_is_active
  FROM public.supervisors
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND OR v_caller_role IS NULL OR v_caller_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Forbidden: Caller supervisor record not found or inactive';
  END IF;

  IF v_caller_role NOT IN ('admin', 'super_admin', 'branch_manager', 'manager') THEN
    RAISE EXCEPTION 'Forbidden: Insufficient privileges';
  END IF;

  -- 3. Fetch Target Supervisor
  SELECT * INTO v_target_record
  FROM public.supervisors
  WHERE id = p_supervisor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supervisor not found';
  END IF;

  -- 4. Multi-Tenant Company Match
  IF v_caller_role <> 'super_admin' AND v_target_record.company_id IS DISTINCT FROM v_caller_company_id THEN
    RAISE EXCEPTION 'Forbidden: Cannot delete supervisors outside your company';
  END IF;

  -- 5. Super Admin and Self-Delete Protections
  IF v_target_record.role = 'super_admin' THEN
    RAISE EXCEPTION 'Forbidden: Cannot delete system super admin';
  END IF;

  IF v_target_record.user_id = auth.uid() THEN
    RAISE EXCEPTION 'Forbidden: Cannot delete your own account';
  END IF;

  -- 6. Cascading Cleanup of Dependent Records
  DELETE FROM public.supervisor_permissions WHERE supervisor_id = p_supervisor_id;
  DELETE FROM public.beat_plans WHERE supervisor_id = p_supervisor_id;
  DELETE FROM public.notifications WHERE supervisor_id = p_supervisor_id;
  DELETE FROM public.supervisors WHERE id = p_supervisor_id;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_supervisor_cascade FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_supervisor_cascade TO authenticated;


-- ── 7. ACCURATE REPORTING VIEWS WITH company_id & NO ROW MULTIPLICATION ───────
-- Fix vw_branch_performance: Separate CTE aggregates to prevent cartesian row explosion
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

COMMIT;
