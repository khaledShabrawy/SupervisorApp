-- REVIEW REQUIRED. This file is deliberately outside supabase/migrations.
-- Based on the read-only production catalog audit of 2026-11-05.
-- It changes authorization and auth triggers. Test on a restored staging schema first.
BEGIN;

-- Keep ordinary profile edits available; route privileged changes through a checked RPC.
REVOKE UPDATE ON public.supervisors FROM authenticated, anon;
REVOKE UPDATE (id,user_id,full_name,phone,branch,role,is_active,created_at,updated_at,
  branch_id,company_id,device_id,force_password_change,password_changed_at,supervisor_code)
  ON public.supervisors FROM authenticated, anon;
GRANT UPDATE (full_name,phone) ON public.supervisors TO authenticated;

CREATE OR REPLACE FUNCTION public.mdn_bind_device_v1(p_supervisor_id uuid, p_device_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 OR length(p_device_id) > 200 THEN
    RAISE EXCEPTION 'Invalid device identifier' USING ERRCODE = '22023';
  END IF;
  UPDATE public.supervisors SET device_id = p_device_id
  WHERE id = p_supervisor_id AND user_id = auth.uid() AND is_active IS TRUE AND device_id IS NULL;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.mdn_bind_device_v1(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mdn_bind_device_v1(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_supervisor(
  p_supervisor_id uuid,
  p_role text DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_clear_branch boolean DEFAULT false,
  p_supervisor_code text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_reset_device boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor public.supervisors%ROWTYPE; target public.supervisors%ROWTYPE;
BEGIN
  BEGIN
    SELECT * INTO STRICT actor FROM public.supervisors WHERE user_id = auth.uid() AND is_active IS TRUE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'Exactly one active administrator profile is required' USING ERRCODE = '42501';
  END;
  IF actor.role NOT IN ('admin','super_admin','branch_manager') THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM public.supervisors WHERE id = p_supervisor_id FOR UPDATE;
  IF NOT FOUND OR target.company_id IS DISTINCT FROM actor.company_id OR actor.company_id IS NULL
    OR target.role = 'super_admin' THEN
    RAISE EXCEPTION 'Target is outside permitted scope' USING ERRCODE = '42501';
  END IF;
  IF p_role IS NOT NULL AND p_role NOT IN ('supervisor','senior_supervisor','branch_manager','admin') THEN
    RAISE EXCEPTION 'Role is not permitted' USING ERRCODE = '42501';
  END IF;
  IF actor.role = 'branch_manager' AND (
    actor.branch_id IS NULL OR target.branch_id IS DISTINCT FROM actor.branch_id
    OR target.role NOT IN ('supervisor','senior_supervisor')
    OR (p_role IS NOT NULL AND p_role NOT IN ('supervisor','senior_supervisor'))
    OR p_clear_branch OR (p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM actor.branch_id)
  ) THEN
    RAISE EXCEPTION 'Target is outside the managed branch' USING ERRCODE = '42501';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND company_id = actor.company_id
  ) THEN
    RAISE EXCEPTION 'Branch belongs to another company' USING ERRCODE = '42501';
  END IF;
  IF p_full_name IS NOT NULL AND btrim(p_full_name) = '' THEN
    RAISE EXCEPTION 'Name is required' USING ERRCODE = '22023';
  END IF;
  IF target.id = actor.id AND (
    p_role IS NOT NULL AND p_role IS DISTINCT FROM target.role
    OR p_is_active IS NOT NULL AND p_is_active IS DISTINCT FROM target.is_active
    OR p_clear_branch OR p_reset_device
    OR p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM target.branch_id
  ) THEN
    RAISE EXCEPTION 'Privileged self modification is forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.supervisors SET
    full_name = CASE WHEN p_full_name IS NULL THEN full_name ELSE btrim(p_full_name) END,
    phone = CASE WHEN p_phone IS NULL THEN phone ELSE nullif(btrim(p_phone),'') END,
    supervisor_code = CASE WHEN p_supervisor_code IS NULL THEN supervisor_code ELSE nullif(btrim(p_supervisor_code),'') END,
    role = coalesce(p_role,role), is_active = coalesce(p_is_active,is_active),
    branch_id = CASE WHEN p_clear_branch THEN NULL ELSE coalesce(p_branch_id,branch_id) END,
    device_id = CASE WHEN p_reset_device THEN NULL ELSE device_id END
  WHERE id = target.id;
  RETURN target.id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_supervisor(uuid,text,uuid,text,text,boolean,text,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_supervisor(uuid,text,uuid,text,text,boolean,text,boolean,boolean) TO authenticated;

-- A trusted Auth password update clears the flag. Clients cannot clear it merely by editing metadata.
CREATE OR REPLACE FUNCTION public.mdn_password_changed_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    UPDATE public.supervisors SET force_password_change = false, password_changed_at = now()
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mdn_password_changed_v1() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS mydan_password_changed ON auth.users;
CREATE TRIGGER mydan_password_changed AFTER UPDATE OF encrypted_password ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.mdn_password_changed_v1();

-- Permissive policies combine with OR. This legacy ALL policy bypasses newer scoped restrictions.
DROP POLICY IF EXISTS orders_company_all ON public.orders;
DROP POLICY IF EXISTS orders_admin_manage_scoped ON public.orders;
CREATE POLICY orders_admin_manage_scoped ON public.orders FOR ALL TO authenticated
USING (company_id = public.get_my_company_id() AND public.get_my_role() IN ('admin','super_admin'))
WITH CHECK (company_id = public.get_my_company_id() AND public.get_my_role() IN ('admin','super_admin'));

-- Revalidate foreign links and quantity-only fields on UPDATE as well as INSERT.
DROP POLICY IF EXISTS orders_update_self_pending ON public.orders;
CREATE POLICY orders_update_self_pending ON public.orders FOR UPDATE TO authenticated
USING (supervisor_id = private_rls.current_supervisor_id()
  AND company_id = public.get_my_company_id() AND public.get_my_role() = 'supervisor'
  AND status = 'pending')
WITH CHECK (supervisor_id = private_rls.current_supervisor_id()
  AND company_id = public.get_my_company_id() AND public.get_my_role() = 'supervisor'
  AND status IN ('pending','cancelled') AND quantity > 0
  AND unit_price IS NULL AND total_price IS NULL
  AND EXISTS (SELECT 1 FROM public.visits v WHERE v.id = orders.visit_id
    AND v.company_id = orders.company_id AND v.supervisor_id = orders.supervisor_id
    AND v.customer_id = orders.customer_id)
  AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = orders.customer_id
    AND c.company_id = orders.company_id AND c.is_active IS TRUE)
  AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = orders.product_id
    AND p.company_id = orders.company_id AND p.is_active IS TRUE));

-- Legacy price-bearing UI is not made compatible by weakening RLS.
COMMIT;
