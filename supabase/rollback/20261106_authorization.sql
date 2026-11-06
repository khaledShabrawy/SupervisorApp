-- Configuration rollback captured read-only from the target on 2026-11-06.
-- Restores original authorization, including known weaknesses; emergency rollback only.
BEGIN;
DROP TRIGGER IF EXISTS mydan_password_changed ON auth.users;
DROP FUNCTION IF EXISTS public.mdn_bind_device_v1(uuid,text);
DROP FUNCTION IF EXISTS public.admin_update_supervisor(uuid,text,uuid,text,text,boolean,text,boolean,boolean);
DROP FUNCTION IF EXISTS public.mdn_password_changed_v1();
CREATE OR REPLACE FUNCTION public.delete_supervisor_cascade(p_supervisor_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_company_id uuid;
  v_caller_branch_id uuid;
  v_caller_is_active boolean;
  v_target_record public.supervisors%ROWTYPE;
BEGIN
  -- 1. Explicit Fail-Closed Authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Fetch Caller Credentials
  SELECT role, company_id, branch_id, is_active
  INTO v_caller_role, v_caller_company_id, v_caller_branch_id, v_caller_is_active
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

  -- 4b. Branch-Scope for branch_manager (mirrors admin_update_supervisor guard)
  IF v_caller_role = 'branch_manager' THEN
    IF v_caller_branch_id IS NULL OR v_target_record.branch_id IS DISTINCT FROM v_caller_branch_id THEN
      RAISE EXCEPTION 'Forbidden: Branch manager can only delete supervisors within their own branch';
    END IF;
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
$function$
;
REVOKE ALL ON FUNCTION public."delete_supervisor_cascade"(p_supervisor_id uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.manager_set_order_status(p_order_id uuid, p_new_status text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_old public.orders; v_new public.orders; v_actor_id uuid; v_role text; BEGIN IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF; v_actor_id := private_rls.current_supervisor_id(); v_role := public.get_my_role(); IF v_actor_id IS NULL OR COALESCE(v_role, '') NOT IN ('branch_manager', 'admin', 'super_admin') THEN RAISE EXCEPTION 'Role not allowed to approve orders' USING ERRCODE = '42501'; END IF; IF COALESCE(p_new_status, '') NOT IN ('confirmed', 'cancelled') THEN RAISE EXCEPTION 'Only confirmed or cancelled is allowed' USING ERRCODE = '22023'; END IF; SELECT o.* INTO v_old FROM public.orders AS o WHERE o.id = p_order_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002'; END IF; IF NOT private_rls.can_access_supervisor(v_old.supervisor_id, v_old.company_id) THEN RAISE EXCEPTION 'Order is outside the manager scope' USING ERRCODE = '42501'; END IF; IF v_old.status <> 'pending' THEN RAISE EXCEPTION 'Only pending orders can be approved or rejected' USING ERRCODE = '22023'; END IF; IF p_new_status = 'confirmed' AND (v_old.unit_price IS NULL OR v_old.total_price IS NULL) THEN RAISE EXCEPTION 'Order prices must be calculated before confirmation' USING ERRCODE = '22023'; END IF; UPDATE public.orders AS o SET status = p_new_status WHERE o.id = p_order_id RETURNING o.* INTO v_new; INSERT INTO public.audit_logs (table_name, action, performed_by, old_data, new_data, company_id) VALUES ('orders', 'UPDATE', v_actor_id, to_jsonb(v_old), to_jsonb(v_new), v_new.company_id); RETURN v_new; END; $function$
;
REVOKE ALL ON FUNCTION public."manager_set_order_status"(p_order_id uuid, p_new_status text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."delete_supervisor_cascade"(p_supervisor_id uuid) TO "authenticated";
REVOKE ALL ON TABLE public."orders" FROM PUBLIC, anon, authenticated;
REVOKE SELECT ("id","visit_id","supervisor_id","customer_id","product_id","quantity","unit_price","total_price","status","notes","created_at","company_id","items","total_amount","order_date","delivered_at") ON public."orders" FROM PUBLIC, anon, authenticated;
REVOKE INSERT ("id","visit_id","supervisor_id","customer_id","product_id","quantity","unit_price","total_price","status","notes","created_at","company_id","items","total_amount","order_date","delivered_at") ON public."orders" FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ("id","visit_id","supervisor_id","customer_id","product_id","quantity","unit_price","total_price","status","notes","created_at","company_id","items","total_amount","order_date","delivered_at") ON public."orders" FROM PUBLIC, anon, authenticated;
REVOKE REFERENCES ("id","visit_id","supervisor_id","customer_id","product_id","quantity","unit_price","total_price","status","notes","created_at","company_id","items","total_amount","order_date","delivered_at") ON public."orders" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public."supervisors" FROM PUBLIC, anon, authenticated;
REVOKE SELECT ("id","user_id","full_name","phone","branch","role","is_active","created_at","updated_at","branch_id","company_id","device_id","force_password_change","password_changed_at","supervisor_code") ON public."supervisors" FROM PUBLIC, anon, authenticated;
REVOKE INSERT ("id","user_id","full_name","phone","branch","role","is_active","created_at","updated_at","branch_id","company_id","device_id","force_password_change","password_changed_at","supervisor_code") ON public."supervisors" FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ("id","user_id","full_name","phone","branch","role","is_active","created_at","updated_at","branch_id","company_id","device_id","force_password_change","password_changed_at","supervisor_code") ON public."supervisors" FROM PUBLIC, anon, authenticated;
REVOKE REFERENCES ("id","user_id","full_name","phone","branch","role","is_active","created_at","updated_at","branch_id","company_id","device_id","force_password_change","password_changed_at","supervisor_code") ON public."supervisors" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."orders" TO "authenticated";
GRANT INSERT ON TABLE public."supervisors" TO "anon";
GRANT SELECT ON TABLE public."supervisors" TO "anon";
GRANT DELETE ON TABLE public."supervisors" TO "anon";
GRANT REFERENCES ON TABLE public."supervisors" TO "anon";
GRANT TRIGGER ON TABLE public."supervisors" TO "anon";
GRANT MAINTAIN ON TABLE public."supervisors" TO "anon";
GRANT INSERT ON TABLE public."supervisors" TO "authenticated";
GRANT SELECT ON TABLE public."supervisors" TO "authenticated";
GRANT DELETE ON TABLE public."supervisors" TO "authenticated";
GRANT REFERENCES ON TABLE public."supervisors" TO "authenticated";
GRANT TRIGGER ON TABLE public."supervisors" TO "authenticated";
GRANT MAINTAIN ON TABLE public."supervisors" TO "authenticated";
GRANT INSERT ("visit_id") ON public."orders" TO "authenticated";
GRANT INSERT ("supervisor_id") ON public."orders" TO "authenticated";
GRANT INSERT ("customer_id") ON public."orders" TO "authenticated";
GRANT INSERT ("product_id") ON public."orders" TO "authenticated";
GRANT INSERT ("quantity") ON public."orders" TO "authenticated";
GRANT UPDATE ("quantity") ON public."orders" TO "authenticated";
GRANT INSERT ("status") ON public."orders" TO "authenticated";
GRANT UPDATE ("status") ON public."orders" TO "authenticated";
GRANT INSERT ("notes") ON public."orders" TO "authenticated";
GRANT UPDATE ("notes") ON public."orders" TO "authenticated";
GRANT INSERT ("company_id") ON public."orders" TO "authenticated";
GRANT UPDATE ("full_name") ON public."supervisors" TO "authenticated";
GRANT UPDATE ("phone") ON public."supervisors" TO "authenticated";
GRANT UPDATE ("role") ON public."supervisors" TO "authenticated";
GRANT UPDATE ("is_active") ON public."supervisors" TO "authenticated";
GRANT UPDATE ("branch_id") ON public."supervisors" TO "authenticated";
GRANT UPDATE ("device_id") ON public."supervisors" TO "authenticated";
DROP POLICY IF EXISTS "orders_company_all" ON public.orders;
CREATE POLICY "orders_company_all" ON public.orders FOR ALL TO "authenticated" USING (((company_id IS NULL) OR (company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE ((supervisors.user_id = auth.uid()) OR (supervisors.id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM supervisors
  WHERE (((supervisors.user_id = auth.uid()) OR (supervisors.id = auth.uid())) AND (supervisors.role = 'super_admin'::text)))))) WITH CHECK (((company_id IS NULL) OR (company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE ((supervisors.user_id = auth.uid()) OR (supervisors.id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM supervisors
  WHERE (((supervisors.user_id = auth.uid()) OR (supervisors.id = auth.uid())) AND (supervisors.role = 'super_admin'::text))))));
COMMIT;
