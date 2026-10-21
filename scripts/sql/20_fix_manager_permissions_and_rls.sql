-- ============================================================
-- Migration 20: Fix Manager Permissions and RLS for Supervisors, Customers, and Products
-- Project: Mydan / ywdlrrdkjbtpfgacuuoy
-- Purpose:
--   1. Allow authenticated role to update is_active, role, branch_id on supervisors
--   2. Add supervisors_admin_update policy for admins and branch_managers
--   3. Allow branch_manager and manager roles in customer and product update policies
-- ============================================================

BEGIN;

-- 1. Grant column update permissions on supervisors to authenticated role
GRANT UPDATE (full_name, phone, device_id, is_active, role, branch_id) ON public.supervisors TO authenticated;

-- 2. Allow Admins and Managers to update supervisors in their company
DROP POLICY IF EXISTS "supervisors_admin_update" ON public.supervisors;
CREATE POLICY "supervisors_admin_update" ON public.supervisors FOR UPDATE TO authenticated
USING (
  company_id = get_my_company_id()
  AND get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
)
WITH CHECK (
  company_id = get_my_company_id()
  AND get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
);

-- 3. Allow branch_manager and manager to update customers
DROP POLICY IF EXISTS "customers_supervisor_update" ON public.customers;
CREATE POLICY "customers_supervisor_update" ON public.customers FOR UPDATE TO authenticated
USING (
  company_id = get_my_company_id()
  AND (
    supervisor_id = get_my_supervisor_id()
    OR get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
  )
)
WITH CHECK (company_id = get_my_company_id());

-- 4. Allow branch_manager and manager to insert and update products
DROP POLICY IF EXISTS "products_admin_write" ON public.products;
CREATE POLICY "products_admin_write" ON public.products FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_my_company_id() 
  AND get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
);

DROP POLICY IF EXISTS "products_admin_update" ON public.products;
CREATE POLICY "products_admin_update" ON public.products FOR UPDATE TO authenticated
USING (
  company_id = get_my_company_id() 
  AND get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
)
WITH CHECK (
  company_id = get_my_company_id() 
  AND get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
);

COMMIT;
