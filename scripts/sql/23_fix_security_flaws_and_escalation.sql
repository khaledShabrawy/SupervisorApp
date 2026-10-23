-- ==============================================================================
-- Migration 23: Fix Privilege Escalation, Orphaned Records, Strict Row Ownership,
--               and Robust RPC-Guarded Administration
-- Project: Mydan / ywdlrrdkjbtpfgacuuoy
-- Purpose:
--   1. Close Privilege Escalation: Revoke broad column grants (role, is_active, branch_id)
--      and channel all administrative changes through SECURITY DEFINER RPC.
--   2. Strict Multi-Tenancy: Backfill and ban company_id IS NULL across all tables.
--   3. Row Ownership: Restrict supervisor writes to their own records only.
--   4. Drop ALL legacy permissive policies that combine with OR.
--   5. Enforce single server-side deletion path for users via delete_supervisor_cascade.
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

-- Drop all older self-update and admin-update policies on supervisors
DROP POLICY IF EXISTS "supervisor_update_own" ON public.supervisors;
DROP POLICY IF EXISTS "supervisors_update_self" ON public.supervisors;
DROP POLICY IF EXISTS "supervisors_self_update" ON public.supervisors;
DROP POLICY IF EXISTS "supervisors_admin_update" ON public.supervisors;
DROP POLICY IF EXISTS "supervisors_admin_delete" ON public.supervisors;


-- ── 2. SAFE BACKFILL & BAN company_id IS NULL (MULTI-TENANCY) ──────────────────
-- Safe backfill: Associate orphaned records with their supervisor's company first
UPDATE public.field_surveys fs
SET company_id = s.company_id
FROM public.supervisors s
WHERE fs.supervisor_id = s.id AND fs.company_id IS NULL;

UPDATE public.orders o
SET company_id = s.company_id
FROM public.supervisors s
WHERE o.supervisor_id = s.id AND o.company_id IS NULL;

-- Only remove unresolvable orphan records that have no valid supervisor
DELETE FROM public.field_surveys WHERE company_id IS NULL;
DELETE FROM public.orders WHERE company_id IS NULL;

-- Enforce NOT NULL on company_id for multi-tenant integrity
ALTER TABLE IF EXISTS public.field_surveys ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE IF EXISTS public.orders ALTER COLUMN company_id SET NOT NULL;


-- ── 3. STRICT ROW OWNERSHIP FOR SURVEYS & ORDERS ──────────────────────────────
-- Supervisors can only write/modify their OWN surveys; Admins can manage all company surveys
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


-- ── 4. CLOSE PRIVILEGE ESCALATION ON SUPERVISORS TABLE ─────────────────────────
-- Revoke broad column grants and direct delete from authenticated role
REVOKE UPDATE (role, is_active, branch_id) ON public.supervisors FROM authenticated;
REVOKE DELETE ON public.supervisors FROM authenticated;

-- Only allow authenticated users to update safe profile info (full_name, phone, device_id)
GRANT UPDATE (full_name, phone, device_id) ON public.supervisors TO authenticated;

-- Tighten supervisors_self_update policy with strict WITH CHECK protection
CREATE POLICY "supervisors_self_update" ON public.supervisors
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND role = (SELECT s.role FROM public.supervisors s WHERE s.id = supervisors.id)
    AND is_active = (SELECT s.is_active FROM public.supervisors s WHERE s.id = supervisors.id)
    AND (branch_id IS NOT DISTINCT FROM (SELECT s.branch_id FROM public.supervisors s WHERE s.id = supervisors.id))
  );


-- ── 5. SECURE ADMIN UPDATE RPC (SECURITY DEFINER) ──────────────────────────────
-- Since authenticated cannot UPDATE (role, is_active, branch_id) directly,
-- all privileged supervisor modifications MUST pass through this server-side RPC.
CREATE OR REPLACE FUNCTION public.admin_update_supervisor(
  p_supervisor_id uuid,
  p_role text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL
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
  v_target_record public.supervisors%ROWTYPE;
  v_result jsonb;
BEGIN
  -- Authenticate caller
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get caller credentials
  SELECT role, company_id, branch_id INTO v_caller_role, v_caller_company_id, v_caller_branch_id
  FROM public.supervisors
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_caller_role NOT IN ('admin', 'super_admin', 'manager', 'branch_manager') THEN
    RAISE EXCEPTION 'Forbidden: Insufficient privileges';
  END IF;

  -- Fetch target supervisor
  SELECT * INTO v_target_record
  FROM public.supervisors
  WHERE id = p_supervisor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supervisor not found';
  END IF;

  -- Multi-tenant isolation: caller must belong to the same company (unless super_admin)
  IF v_caller_role <> 'super_admin' AND v_target_record.company_id <> v_caller_company_id THEN
    RAISE EXCEPTION 'Forbidden: Cannot manage supervisors outside your company';
  END IF;

  -- Branch manager isolation: can only manage supervisors within their branch
  IF v_caller_role IN ('branch_manager', 'manager') AND v_caller_branch_id IS NOT NULL THEN
    IF v_target_record.branch_id IS DISTINCT FROM v_caller_branch_id THEN
      RAISE EXCEPTION 'Forbidden: Cannot manage supervisors from another branch';
    END IF;
    IF p_role IS NOT NULL AND p_role IN ('admin', 'super_admin') THEN
      RAISE EXCEPTION 'Forbidden: Branch managers cannot grant admin privileges';
    END IF;
  END IF;

  -- Prevent non-super_admin from modifying super_admin accounts
  IF v_target_record.role = 'super_admin' AND v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Forbidden: Only super_admin can modify another super_admin';
  END IF;

  -- Prevent self-demotion or self-deactivation
  IF v_target_record.user_id = auth.uid() THEN
    IF p_role IS NOT NULL AND p_role <> v_target_record.role THEN
      RAISE EXCEPTION 'Forbidden: Cannot change your own role';
    END IF;
    IF p_is_active IS NOT NULL AND p_is_active = false THEN
      RAISE EXCEPTION 'Forbidden: Cannot deactivate your own account';
    END IF;
  END IF;

  -- Validate role values
  IF p_role IS NOT NULL AND p_role NOT IN ('admin', 'supervisor', 'branch_manager', 'manager', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role specified';
  END IF;

  -- Perform the update
  UPDATE public.supervisors
  SET
    role = COALESCE(p_role, role),
    is_active = COALESCE(p_is_active, is_active),
    branch_id = CASE WHEN p_branch_id IS NOT NULL THEN p_branch_id ELSE branch_id END,
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

GRANT EXECUTE ON FUNCTION public.admin_update_supervisor TO authenticated;

COMMIT;
