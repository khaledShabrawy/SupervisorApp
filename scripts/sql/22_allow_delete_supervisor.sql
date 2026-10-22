-- ==============================================================================
-- Migration 22: Allow Supervisor / User Deletion with Cascading Cleanup
-- Project: Mydan
-- ==============================================================================

BEGIN;

-- 1. Grant DELETE permission on supervisors to authenticated role
GRANT DELETE ON public.supervisors TO authenticated;
GRANT DELETE ON public.supervisor_permissions TO authenticated;
GRANT DELETE ON public.beat_plans TO authenticated;

-- 2. Create RLS DELETE policy for supervisors
DROP POLICY IF EXISTS "supervisors_admin_delete" ON public.supervisors;
CREATE POLICY "supervisors_admin_delete" ON public.supervisors FOR DELETE TO authenticated
USING (
  company_id = get_my_company_id()
  AND get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
  AND role != 'super_admin'
);

-- 3. Stored Procedure for Cascading User Deletion
CREATE OR REPLACE FUNCTION public.delete_supervisor_cascade(p_supervisor_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id UUID;
  v_role TEXT;
  v_target_role TEXT;
  v_target_company UUID;
BEGIN
  v_company_id := get_my_company_id();
  v_role := get_my_role();

  -- Verify caller permissions
  IF v_role NOT IN ('admin', 'super_admin', 'branch_manager', 'manager') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية حذف المستخدمين.';
  END IF;

  -- Verify target supervisor
  SELECT role, company_id INTO v_target_role, v_target_company
  FROM public.supervisors
  WHERE id = p_supervisor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستخدم غير موجود.';
  END IF;

  IF v_target_company != v_company_id THEN
    RAISE EXCEPTION 'لا يمكنك حذف مستخدم تابع لشركة أخرى.';
  END IF;

  IF v_target_role = 'super_admin' THEN
    RAISE EXCEPTION 'لا يمكن حذف المدير الأعلى للنظام.';
  END IF;

  IF p_supervisor_id = get_my_supervisor_id() THEN
    RAISE EXCEPTION 'لا يمكنك حذف حسابك الشخصي.';
  END IF;

  -- 1. Delete dependent permissions and beat plans
  DELETE FROM public.supervisor_permissions WHERE supervisor_id = p_supervisor_id;
  DELETE FROM public.beat_plans WHERE supervisor_id = p_supervisor_id;
  DELETE FROM public.notifications WHERE supervisor_id = p_supervisor_id;

  -- 2. Delete the supervisor record
  DELETE FROM public.supervisors WHERE id = p_supervisor_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_supervisor_cascade(UUID) TO authenticated;

COMMIT;
