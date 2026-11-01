-- Fix S-09: Pin search_path on SECURITY DEFINER helper functions used in RLS policies.
-- Without pg_temp, a malicious user could shadow public functions via temp schema objects.
-- These functions query public.supervisors and are called by supervisors RLS policies.

ALTER FUNCTION public.get_my_company_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_role()       SET search_path = public, pg_temp;
