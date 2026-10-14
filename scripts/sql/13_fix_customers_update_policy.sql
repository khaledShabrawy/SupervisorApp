-- Proposed migration: remove legacy company-wide customer update access.
-- Review and test in staging before applying to production.
-- Prerequisites: get_my_company_id(), get_my_supervisor_id(), and get_my_role()
-- are installed by the reviewed tenant/security migrations.
-- This file is a draft only; it has not been executed against Supabase.

BEGIN;

-- This permissive legacy policy grants every authenticated company member
-- UPDATE access to every customer in that company, including other supervisors' rows.
DROP POLICY IF EXISTS "customers_update" ON public.customers;

-- Recreate the intended policy with ownership checks for both the old and new row.
DROP POLICY IF EXISTS "customers_supervisor_update" ON public.customers;
CREATE POLICY "customers_supervisor_update" ON public.customers
  FOR UPDATE TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      supervisor_id = get_my_supervisor_id()
      OR get_my_role() IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND (
      supervisor_id = get_my_supervisor_id()
      OR get_my_role() IN ('admin', 'super_admin')
    )
  );

COMMIT;
