-- Mydan audit remediation. DRAFT: not applied to any external database.
-- Prerequisite: owner-reviewed current schema, backup/restore plan and the local policy suite.
-- This is an additive corrective migration, not a replacement for historical migrations.
BEGIN;

-- Fail early rather than guessing the production identity contract or deleting inconsistent data.
DO $$
DECLARE relation_name text; required_column text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['companies','branches','supervisors','app_settings','customers','visits','visit_tasks',
    'attendance','notifications','targets','shelf_audit','supervisor_permissions','beat_plans'] LOOP
    IF to_regclass('public.' || relation_name) IS NULL THEN RAISE EXCEPTION 'Missing prerequisite table: %', relation_name; END IF;
  END LOOP;
  FOREACH required_column IN ARRAY ARRAY['user_id','company_id','branch_id','role','is_active','force_password_change','device_id','password_changed_at','supervisor_code'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='supervisors' AND c.column_name=required_column) THEN
      RAISE EXCEPTION 'Missing prerequisite supervisors column: %', required_column;
    END IF;
  END LOOP;
  IF to_regclass('auth.sessions') IS NULL THEN RAISE EXCEPTION 'Missing prerequisite Auth session catalog'; END IF;
  IF EXISTS (SELECT user_id FROM public.supervisors GROUP BY user_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Multiple supervisor profiles for one Auth user. Resolve identity mapping explicitly first.';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS mdn_visits_company_owner_date ON public.visits(company_id,supervisor_id,visit_date);
CREATE INDEX IF NOT EXISTS mdn_audits_company_owner_time ON public.shelf_audit(company_id,supervisor_id,audited_at);
CREATE INDEX IF NOT EXISTS mdn_targets_company_date ON public.targets(company_id,target_date);
CREATE UNIQUE INDEX IF NOT EXISTS mdn_supervisors_auth_user_unique ON public.supervisors(user_id);

-- A stable audit actor is a supervisor profile ID (the admin UI joins this relation).
CREATE TABLE IF NOT EXISTS public.audit_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id),
  table_name text NOT NULL,action text NOT NULL,performed_by uuid REFERENCES public.supervisors(id),
  old_data jsonb,new_data jsonb,created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
    WHERE c.conrelid='public.audit_logs'::regclass AND c.contype='f' AND a.attname='performed_by'
      AND c.confrelid<>'public.supervisors'::regclass) THEN
    RAISE EXCEPTION 'Audit actor contract mismatch. Review schema before applying.';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.mdn_device_sessions (
  session_id uuid PRIMARY KEY, supervisor_id uuid NOT NULL REFERENCES public.supervisors(id) ON DELETE CASCADE,
  device_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mdn_device_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mdn_device_sessions FROM PUBLIC, anon, authenticated;

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS password_expiry_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS password_expiry_days integer NOT NULL DEFAULT 90;
CREATE OR REPLACE FUNCTION public.mdn_identity_ready_v1(p_user_id uuid,p_session_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supervisors s JOIN public.companies c ON c.id=s.company_id
    WHERE s.user_id=p_user_id AND s.is_active AND NOT s.force_password_change
      AND (s.role='super_admin' OR (c.is_active AND (c.expires_at IS NULL OR c.expires_at > now())))
      -- NULL is reserved for internal service-role provisioning checks; public wrappers require a session ID.
      AND (p_session_id IS NULL OR EXISTS(SELECT 1 FROM auth.sessions a WHERE a.id=p_session_id AND a.user_id=p_user_id
        AND ((to_jsonb(a)->>'not_after') IS NULL OR (to_jsonb(a)->>'not_after')::timestamptz>now())))
      AND NOT EXISTS(SELECT 1 FROM public.app_settings a WHERE a.company_id=s.company_id AND a.password_expiry_enabled AND
        (a.password_expiry_days<1 OR s.password_changed_at IS NULL OR s.password_changed_at<=now()-make_interval(days=>a.password_expiry_days)))
      AND (s.role IN ('admin','super_admin') OR EXISTS (
        SELECT 1 FROM public.mdn_device_sessions d WHERE d.supervisor_id=s.id AND d.device_id=s.device_id
          AND d.session_id=p_session_id
      ))
  )
$$;
CREATE OR REPLACE FUNCTION public.mdn_session_ready_v1() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND nullif(auth.jwt()->>'session_id','') IS NOT NULL
    AND public.mdn_identity_ready_v1(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)
$$;
CREATE OR REPLACE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT company_id FROM public.supervisors WHERE user_id=auth.uid() AND public.mdn_session_ready_v1()
$$;
CREATE OR REPLACE FUNCTION public.get_my_supervisor_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT id FROM public.supervisors WHERE user_id=auth.uid() AND public.mdn_session_ready_v1()
$$;
CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT role FROM public.supervisors WHERE user_id=auth.uid() AND public.mdn_session_ready_v1()
$$;
CREATE OR REPLACE FUNCTION public.mdn_can_access_owner_v1(p_owner uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT public.mdn_session_ready_v1() AND EXISTS (
    SELECT 1 FROM public.supervisors caller JOIN public.supervisors target ON target.id=p_owner
    WHERE caller.user_id=auth.uid() AND target.company_id=caller.company_id AND (
      target.id=caller.id OR caller.role IN ('admin','super_admin') OR (
        caller.role IN ('manager','branch_manager') AND caller.branch_id IS NOT NULL
        AND target.branch_id=caller.branch_id AND target.role IN ('supervisor','senior_supervisor')
      )
    )
  )
$$;
CREATE OR REPLACE FUNCTION public.mdn_can_manage_branch_v1(p_branch uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT public.mdn_session_ready_v1() AND EXISTS (
    SELECT 1 FROM public.supervisors s WHERE s.user_id=auth.uid() AND (
      s.role IN ('admin','super_admin') OR (s.role IN ('manager','branch_manager') AND s.branch_id IS NOT NULL AND s.branch_id=p_branch)
    )
  )
$$;
CREATE OR REPLACE FUNCTION public.mdn_has_screen_v1(p_screen text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT public.mdn_session_ready_v1() AND (public.get_my_role() IN ('admin','super_admin','manager','branch_manager') OR EXISTS (
    SELECT 1 FROM public.supervisor_permissions p WHERE p.company_id=public.get_my_company_id()
      AND p.supervisor_id=public.get_my_supervisor_id() AND p.screen_key=p_screen AND p.is_enabled
  ))
$$;

CREATE OR REPLACE FUNCTION public.mdn_bind_device_v1(p_supervisor_id uuid, p_device_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target public.supervisors%ROWTYPE; sid uuid;
BEGIN
  IF auth.uid() IS NULL OR length(coalesce(p_device_id,'')) NOT BETWEEN 16 AND 200 THEN RAISE EXCEPTION 'Invalid device registration'; END IF;
  SELECT * INTO target FROM public.supervisors WHERE id=p_supervisor_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR NOT target.is_active OR target.force_password_change THEN RAISE EXCEPTION 'Inactive or unavailable account'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id=target.company_id AND c.is_active AND (c.expires_at IS NULL OR c.expires_at>now())) THEN
    RAISE EXCEPTION 'Company unavailable';
  END IF;
  sid := nullif(auth.jwt()->>'session_id','')::uuid;
  IF sid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.sessions a WHERE a.id=sid AND a.user_id=auth.uid()
    AND ((to_jsonb(a)->>'not_after') IS NULL OR (to_jsonb(a)->>'not_after')::timestamptz>now())) THEN RAISE EXCEPTION 'Session identity missing or revoked'; END IF;
  IF target.device_id IS NOT NULL AND target.device_id<>p_device_id THEN RETURN false; END IF;
  UPDATE public.supervisors SET device_id=p_device_id WHERE id=target.id AND device_id IS NULL;
  INSERT INTO public.mdn_device_sessions(session_id, supervisor_id, device_id) VALUES(sid,target.id,p_device_id)
  ON CONFLICT(session_id) DO NOTHING;
  RETURN EXISTS (SELECT 1 FROM public.mdn_device_sessions WHERE session_id=sid AND supervisor_id=target.id AND device_id=p_device_id);
END $$;

CREATE OR REPLACE FUNCTION public.mdn_admin_update_supervisor_v1(p_supervisor_id uuid, p_patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE caller public.supervisors%ROWTYPE; target public.supervisors%ROWTYPE; desired_role text; desired_branch uuid;
BEGIN
  IF NOT public.mdn_session_ready_v1() THEN RAISE EXCEPTION 'Account/session unavailable'; END IF;
  SELECT * INTO caller FROM public.supervisors WHERE user_id=auth.uid();
  SELECT * INTO target FROM public.supervisors WHERE id=p_supervisor_id FOR UPDATE;
  IF NOT FOUND OR caller.role NOT IN ('admin','super_admin','manager','branch_manager') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF caller.role<>'super_admin' AND target.company_id IS DISTINCT FROM caller.company_id THEN RAISE EXCEPTION 'Outside company'; END IF;
  IF caller.role='admin' AND target.role='admin' AND caller.id<>target.id THEN RAISE EXCEPTION 'Protected peer administrator'; END IF;
  IF target.role='super_admin' AND caller.role<>'super_admin' THEN RAISE EXCEPTION 'Protected platform administrator'; END IF;
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('full_name','phone','supervisor_code','role','branch_id','is_active')) THEN
    RAISE EXCEPTION 'Unsupported profile fields';
  END IF;
  desired_role := coalesce(p_patch->>'role',target.role);
  desired_branch := CASE WHEN p_patch ? 'branch_id' THEN nullif(p_patch->>'branch_id','')::uuid ELSE target.branch_id END;
  IF desired_role NOT IN ('admin','super_admin','manager','branch_manager','supervisor','senior_supervisor') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  IF desired_role='super_admin' AND caller.role<>'super_admin' THEN RAISE EXCEPTION 'Cannot grant platform role'; END IF;
  IF caller.role IN ('manager','branch_manager') AND (
    caller.branch_id IS NULL OR target.branch_id IS DISTINCT FROM caller.branch_id OR desired_branch IS DISTINCT FROM caller.branch_id
    OR target.role NOT IN ('supervisor','senior_supervisor') OR desired_role NOT IN ('supervisor','senior_supervisor')
  ) THEN RAISE EXCEPTION 'Outside management boundary'; END IF;
  IF desired_branch IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches WHERE id=desired_branch AND company_id=target.company_id AND is_active) THEN
    RAISE EXCEPTION 'Invalid company branch';
  END IF;
  IF target.id=caller.id AND (desired_role<>target.role OR (p_patch ? 'is_active' AND (p_patch->>'is_active')::boolean IS NOT TRUE)) THEN
    RAISE EXCEPTION 'Cannot demote or deactivate yourself';
  END IF;
  IF NOT target.is_active AND p_patch->>'is_active'='true' THEN
    PERFORM 1 FROM public.companies WHERE id=target.company_id FOR UPDATE;
    IF (SELECT count(*) FROM public.supervisors WHERE company_id=target.company_id AND is_active)
       +(SELECT count(*) FROM public.mdn_invitation_reservations WHERE company_id=target.company_id AND expires_at>now())
       >=(SELECT max_supervisors FROM public.companies WHERE id=target.company_id) THEN RAISE EXCEPTION 'Seat limit reached'; END IF;
  END IF;
  IF p_patch ? 'full_name' AND length(trim(coalesce(p_patch->>'full_name',''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid name'; END IF;
  UPDATE public.supervisors SET
    full_name=CASE WHEN p_patch ? 'full_name' THEN trim(p_patch->>'full_name') ELSE full_name END,
    phone=CASE WHEN p_patch ? 'phone' THEN nullif(trim(p_patch->>'phone'),'') ELSE phone END,
    supervisor_code=CASE WHEN p_patch ? 'supervisor_code' THEN nullif(trim(p_patch->>'supervisor_code'),'') ELSE supervisor_code END,
    role=desired_role, branch_id=desired_branch,
    is_active=CASE WHEN p_patch ? 'is_active' THEN coalesce((p_patch->>'is_active')::boolean,false) ELSE is_active END
  WHERE id=target.id;
  IF p_patch ? 'is_active' AND (p_patch->>'is_active')::boolean IS NOT TRUE THEN DELETE FROM public.mdn_device_sessions WHERE supervisor_id=target.id; END IF;
  INSERT INTO public.audit_logs(company_id,table_name,action,performed_by,old_data,new_data)
    VALUES(target.company_id,'supervisors','UPDATE',caller.id,to_jsonb(target),p_patch);
  RETURN (SELECT to_jsonb(s) FROM public.supervisors s WHERE id=target.id);
END $$;

CREATE OR REPLACE FUNCTION public.mdn_reset_device_v1(p_supervisor_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target public.supervisors%ROWTYPE;
BEGIN
  -- Central authorization also protects target role/company/branch and serializes profile changes.
  PERFORM public.mdn_admin_update_supervisor_v1(p_supervisor_id,'{}'::jsonb);
  SELECT * INTO target FROM public.supervisors WHERE id=p_supervisor_id;
  UPDATE public.supervisors SET device_id=NULL WHERE id=p_supervisor_id;
  DELETE FROM public.mdn_device_sessions WHERE supervisor_id=p_supervisor_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_supervisor(p_supervisor_id uuid, p_role text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL, p_branch_id uuid DEFAULT NULL, p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL, p_clear_branch boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE patch jsonb;
BEGIN
  patch := jsonb_strip_nulls(jsonb_build_object('role',p_role,'is_active',p_is_active,'full_name',p_full_name,'phone',p_phone));
  IF p_clear_branch OR p_branch_id IS NOT NULL THEN patch := patch || jsonb_build_object('branch_id',CASE WHEN p_clear_branch THEN NULL ELSE p_branch_id END); END IF;
  RETURN public.mdn_admin_update_supervisor_v1(p_supervisor_id,patch);
END $$;
CREATE OR REPLACE FUNCTION public.delete_supervisor_cascade(p_supervisor_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.mdn_admin_update_supervisor_v1(p_supervisor_id,'{}'::jsonb);
  IF p_supervisor_id=public.get_my_supervisor_id() OR EXISTS(SELECT 1 FROM public.supervisors WHERE id=p_supervisor_id AND role='super_admin') THEN
    RAISE EXCEPTION 'Protected account';
  END IF;
  IF EXISTS(SELECT 1 FROM public.visits WHERE supervisor_id=p_supervisor_id)
     OR EXISTS(SELECT 1 FROM public.attendance WHERE supervisor_id=p_supervisor_id) THEN
    RAISE EXCEPTION 'Historical work exists. Deactivate the account instead.';
  END IF;
  DELETE FROM public.supervisor_permissions WHERE supervisor_id=p_supervisor_id;
  DELETE FROM public.beat_plans WHERE supervisor_id=p_supervisor_id;
  DELETE FROM public.notifications WHERE supervisor_id=p_supervisor_id;
  DELETE FROM public.supervisors WHERE id=p_supervisor_id;
  RETURN true;
END $$;

-- Clear forced-change state only when Supabase Auth actually changes the password hash.
CREATE OR REPLACE FUNCTION public.mdn_auth_password_changed_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    UPDATE public.supervisors SET force_password_change=coalesce((NEW.raw_app_meta_data->>'mdn_admin_password_reset')::boolean,false),password_changed_at=now() WHERE user_id=NEW.id;
    IF coalesce((NEW.raw_app_meta_data->>'mdn_admin_password_reset')::boolean,false) THEN
      DELETE FROM public.mdn_device_sessions WHERE supervisor_id IN(SELECT id FROM public.supervisors WHERE user_id=NEW.id);
      INSERT INTO public.audit_logs(company_id,table_name,action,performed_by,new_data)
        SELECT company_id,'supervisors','UPDATE',(SELECT actor.id FROM public.supervisors actor WHERE actor.user_id=(NEW.raw_app_meta_data->>'mdn_password_reset_actor')::uuid),
          jsonb_build_object('supervisor_id',id,'action','temporary_password_reset') FROM public.supervisors WHERE user_id=NEW.id;
      UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data-'mdn_admin_password_reset'-'mdn_password_reset_actor' WHERE id=NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mdn_password_changed ON auth.users;
CREATE TRIGGER mdn_password_changed AFTER UPDATE OF encrypted_password ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.mdn_auth_password_changed_v1();

-- Replace effective policies, including unknown legacy names, rather than relying on permissive OR composition.
DO $$ DECLARE p record; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['supervisors','app_settings','price_list','price_lists','customers','visits','visit_tasks','shelf_audit',
    'field_surveys','attendance','orders','competitor_products','surveys','survey_responses','supervisor_permissions','training_courses','training_lessons','supervisor_training_progress',
    'push_subscriptions','notifications','targets','products','regions','branches','beat_plans','assets','asset_types','asset_tickets','audit_logs','companies'] LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
    END LOOP;
  END LOOP;
END $$;

CREATE POLICY mdn_supervisors_read ON public.supervisors FOR SELECT TO authenticated
  USING(user_id=auth.uid() OR (company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(id)));
CREATE POLICY mdn_supervisors_self_profile ON public.supervisors FOR UPDATE TO authenticated
  USING(id=public.get_my_supervisor_id()) WITH CHECK(id=public.get_my_supervisor_id() AND user_id=auth.uid() AND company_id=public.get_my_company_id());
REVOKE UPDATE,DELETE ON public.supervisors FROM authenticated;
REVOKE UPDATE(company_id,user_id,role,is_active,branch_id,device_id,force_password_change,password_changed_at,supervisor_code) ON public.supervisors FROM authenticated;
GRANT UPDATE(full_name,phone) ON public.supervisors TO authenticated;

CREATE POLICY mdn_settings_read ON public.app_settings FOR SELECT TO authenticated USING(company_id IN (SELECT company_id FROM public.supervisors WHERE user_id=auth.uid() AND is_active));
CREATE POLICY mdn_settings_insert ON public.app_settings FOR INSERT TO authenticated WITH CHECK(company_id=public.get_my_company_id() AND public.get_my_role() IN ('admin','super_admin'));
CREATE POLICY mdn_settings_update ON public.app_settings FOR UPDATE TO authenticated USING(company_id=public.get_my_company_id() AND public.get_my_role() IN ('admin','super_admin')) WITH CHECK(company_id=public.get_my_company_id() AND public.get_my_role() IN ('admin','super_admin'));
CREATE POLICY mdn_settings_delete ON public.app_settings FOR DELETE TO authenticated USING(company_id=public.get_my_company_id() AND public.get_my_role() IN ('admin','super_admin'));
REVOKE ALL ON public.app_settings FROM anon;

-- Public branding is a projection, never public access to operational settings.
CREATE OR REPLACE FUNCTION public.mdn_public_branding_v1(p_company_id uuid)
RETURNS TABLE(company_id uuid, app_name text, logo_url text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.company_id,s.app_name,s.logo_url FROM public.app_settings s JOIN public.companies c ON c.id=s.company_id
  WHERE s.company_id=p_company_id AND c.is_active AND (c.expires_at IS NULL OR c.expires_at>now()) LIMIT 1
$$;

CREATE POLICY mdn_companies_read ON public.companies FOR SELECT TO authenticated
  USING((id IN(SELECT company_id FROM public.supervisors WHERE user_id=auth.uid() AND is_active)) OR public.get_my_role()='super_admin');
CREATE POLICY mdn_companies_write ON public.companies FOR ALL TO authenticated USING(public.get_my_role()='super_admin') WITH CHECK(public.get_my_role()='super_admin');
CREATE POLICY mdn_customers_read ON public.customers FOR SELECT TO authenticated USING(company_id=public.get_my_company_id());
CREATE POLICY mdn_customers_insert ON public.customers FOR INSERT TO authenticated WITH CHECK(company_id=public.get_my_company_id() AND (supervisor_id=public.get_my_supervisor_id() OR public.get_my_role() IN ('admin','super_admin')));
CREATE POLICY mdn_customers_update ON public.customers FOR UPDATE TO authenticated
  USING(company_id=public.get_my_company_id() AND (supervisor_id=public.get_my_supervisor_id() OR public.get_my_role() IN ('admin','super_admin') OR (public.get_my_role() IN('manager','branch_manager') AND public.mdn_can_access_owner_v1(supervisor_id))))
  WITH CHECK(company_id=public.get_my_company_id() AND (supervisor_id=public.get_my_supervisor_id() OR public.get_my_role() IN('admin','super_admin') OR (public.get_my_role() IN('manager','branch_manager') AND public.mdn_can_access_owner_v1(supervisor_id))));
CREATE POLICY mdn_customers_delete ON public.customers FOR DELETE TO authenticated
  USING(company_id=public.get_my_company_id() AND (public.get_my_role() IN('admin','super_admin') OR (public.get_my_role() IN('manager','branch_manager') AND public.mdn_can_access_owner_v1(supervisor_id))));

-- Execution is changed through atomic commands; clients may not forge server measurements/statuses.
CREATE POLICY mdn_visits_read ON public.visits FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(supervisor_id));
REVOKE INSERT,UPDATE,DELETE ON public.visits FROM authenticated;
CREATE POLICY mdn_attendance_read ON public.attendance FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(supervisor_id));
REVOKE INSERT,UPDATE,DELETE ON public.attendance FROM authenticated;
CREATE POLICY mdn_tasks_read ON public.visit_tasks FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.visits v WHERE v.id=visit_id AND v.company_id=visit_tasks.company_id));
CREATE POLICY mdn_tasks_update ON public.visit_tasks FOR UPDATE TO authenticated
  USING(EXISTS(SELECT 1 FROM public.visits v WHERE v.id=visit_id AND v.company_id=visit_tasks.company_id AND v.supervisor_id=public.get_my_supervisor_id() AND v.status='in_progress'))
  WITH CHECK(EXISTS(SELECT 1 FROM public.visits v WHERE v.id=visit_id AND v.company_id=visit_tasks.company_id AND v.supervisor_id=public.get_my_supervisor_id() AND v.status='in_progress'));
REVOKE INSERT,UPDATE,DELETE ON public.visit_tasks FROM authenticated;
GRANT UPDATE(is_completed,completed_at) ON public.visit_tasks TO authenticated;
ALTER TABLE public.shelf_audit ADD COLUMN IF NOT EXISTS analysis_job_id uuid;
CREATE POLICY mdn_audits_read ON public.shelf_audit FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(supervisor_id));
CREATE POLICY mdn_audits_insert ON public.shelf_audit FOR INSERT TO authenticated WITH CHECK(
  company_id=public.get_my_company_id() AND supervisor_id=public.get_my_supervisor_id() AND public.mdn_has_screen_v1('shelf_audit')
  AND status='pending' AND audit_score IS NULL AND ai_detailed_report IS NULL AND analysis_job_id IS NULL
  AND photo_url LIKE company_id::text||'/'||supervisor_id::text||'/%'
  AND EXISTS(SELECT 1 FROM public.visits v WHERE v.id=visit_id AND v.company_id=shelf_audit.company_id AND v.supervisor_id=shelf_audit.supervisor_id AND v.status='in_progress')
);
REVOKE UPDATE,DELETE ON public.shelf_audit FROM authenticated;

CREATE POLICY mdn_permissions_read ON public.supervisor_permissions FOR SELECT TO authenticated
  USING(company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(supervisor_id));
CREATE POLICY mdn_permissions_admin ON public.supervisor_permissions FOR ALL TO authenticated
  USING(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin') AND public.mdn_can_access_owner_v1(supervisor_id))
  WITH CHECK(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin') AND public.mdn_can_access_owner_v1(supervisor_id));
CREATE POLICY mdn_notifications_read ON public.notifications FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(supervisor_id));
CREATE POLICY mdn_notifications_update ON public.notifications FOR UPDATE TO authenticated USING(company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(supervisor_id)) WITH CHECK(company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(supervisor_id));
CREATE POLICY mdn_notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin') AND public.mdn_can_access_owner_v1(supervisor_id));
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE(is_read) ON public.notifications TO authenticated;

-- Readable catalogs/configuration; operation-specific role checks are shared consistently.
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['price_list','price_lists','products','regions','asset_types','assets','surveys'] LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('CREATE POLICY mdn_tenant_read ON public.%I FOR SELECT TO authenticated USING(company_id=public.get_my_company_id())',t);
    EXECUTE format('CREATE POLICY mdn_tenant_admin_write ON public.%I FOR ALL TO authenticated USING(company_id=public.get_my_company_id() AND public.get_my_role() IN (''admin'',''super_admin'')) WITH CHECK(company_id=public.get_my_company_id() AND public.get_my_role() IN (''admin'',''super_admin''))',t);
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regclass('public.training_courses') IS NOT NULL THEN
    CREATE POLICY mdn_courses_read ON public.training_courses FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND (is_published OR public.get_my_role() IN('admin','super_admin')));
    CREATE POLICY mdn_courses_write ON public.training_courses FOR ALL TO authenticated USING(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin')) WITH CHECK(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin'));
    CREATE POLICY mdn_lessons_read ON public.training_lessons FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND (public.get_my_role() IN('admin','super_admin') OR (is_published AND EXISTS(SELECT 1 FROM public.training_courses c WHERE c.id=course_id AND c.company_id=training_lessons.company_id AND c.is_published))));
    CREATE POLICY mdn_lessons_write ON public.training_lessons FOR ALL TO authenticated USING(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin')) WITH CHECK(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin'));
  END IF;
END $$;

CREATE POLICY mdn_branches_read ON public.branches FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND (public.get_my_role() NOT IN('manager','branch_manager') OR public.mdn_can_manage_branch_v1(id)));
CREATE POLICY mdn_branches_admin ON public.branches FOR ALL TO authenticated USING(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin')) WITH CHECK(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin'));
CREATE POLICY mdn_targets_read ON public.targets FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND (public.mdn_can_access_owner_v1(supervisor_id) OR (supervisor_id IS NULL AND (branch_id IS NULL OR public.mdn_can_manage_branch_v1(branch_id) OR branch_id=(SELECT s.branch_id FROM public.supervisors s WHERE s.user_id=auth.uid())))));
CREATE POLICY mdn_targets_admin ON public.targets FOR ALL TO authenticated USING(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin','manager','branch_manager') AND (public.mdn_can_access_owner_v1(supervisor_id) OR public.mdn_can_manage_branch_v1(branch_id))) WITH CHECK(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin','manager','branch_manager') AND (public.mdn_can_access_owner_v1(supervisor_id) OR public.mdn_can_manage_branch_v1(branch_id)));
CREATE POLICY mdn_beats_read ON public.beat_plans FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(supervisor_id));
CREATE POLICY mdn_beats_admin ON public.beat_plans FOR ALL TO authenticated USING(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin','manager','branch_manager') AND public.mdn_can_access_owner_v1(supervisor_id)) WITH CHECK(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin','manager','branch_manager') AND public.mdn_can_access_owner_v1(supervisor_id));

-- Optional modules are secured when present. Missing modules are not fabricated by this patch.
DO $$ BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    CREATE POLICY mdn_orders_read ON public.orders FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(supervisor_id));
    CREATE POLICY mdn_orders_update ON public.orders FOR UPDATE TO authenticated USING(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin','manager','branch_manager') AND public.mdn_can_access_owner_v1(supervisor_id)) WITH CHECK(company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(supervisor_id));
    REVOKE INSERT,DELETE ON public.orders FROM authenticated;
    REVOKE UPDATE ON public.orders FROM authenticated;
    GRANT UPDATE(status,delivered_at) ON public.orders TO authenticated;
  END IF;
  IF to_regclass('public.field_surveys') IS NOT NULL THEN
    CREATE POLICY mdn_surveys_read ON public.field_surveys FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(supervisor_id));
    CREATE POLICY mdn_surveys_insert ON public.field_surveys FOR INSERT TO authenticated WITH CHECK(company_id=public.get_my_company_id() AND supervisor_id=public.get_my_supervisor_id() AND public.mdn_has_screen_v1('field_survey') AND status='pending' AND ai_raw_result IS NULL AND coalesce(stores_found,0)=0 AND (to_jsonb(field_surveys)->>'analysis_job_id') IS NULL AND photo_url LIKE company_id::text||'/'||supervisor_id::text||'/%');
    REVOKE UPDATE,DELETE ON public.field_surveys FROM authenticated;
  END IF;
  IF to_regclass('public.supervisor_training_progress') IS NOT NULL THEN
    CREATE POLICY mdn_training_progress_read ON public.supervisor_training_progress FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(supervisor_id));
    CREATE POLICY mdn_training_progress_write ON public.supervisor_training_progress FOR ALL TO authenticated
    USING(company_id=public.get_my_company_id() AND supervisor_id=public.get_my_supervisor_id())
    WITH CHECK(company_id=public.get_my_company_id() AND supervisor_id=public.get_my_supervisor_id() AND EXISTS(
      SELECT 1 FROM public.training_lessons l JOIN public.training_courses c ON c.id=l.course_id AND c.company_id=l.company_id
      WHERE l.id=lesson_id AND l.company_id=supervisor_training_progress.company_id AND l.is_published AND c.is_published));
  END IF;
  IF to_regclass('public.push_subscriptions') IS NOT NULL THEN
    CREATE POLICY mdn_push_own ON public.push_subscriptions FOR ALL TO authenticated USING(company_id=public.get_my_company_id() AND supervisor_id=public.get_my_supervisor_id()) WITH CHECK(company_id=public.get_my_company_id() AND supervisor_id=public.get_my_supervisor_id());
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.push_subscriptions TO authenticated;
  END IF;
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    CREATE POLICY mdn_audit_logs_read ON public.audit_logs FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin'));
    REVOKE INSERT,UPDATE,DELETE ON public.audit_logs FROM authenticated;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.competitor_products') IS NOT NULL THEN
    CREATE POLICY mdn_competitors_read ON public.competitor_products FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND EXISTS(SELECT 1 FROM public.visits v WHERE v.id=visit_id AND v.company_id=competitor_products.company_id));
    CREATE POLICY mdn_competitors_write ON public.competitor_products FOR ALL TO authenticated USING(company_id=public.get_my_company_id() AND public.mdn_has_screen_v1('competitor_products') AND EXISTS(SELECT 1 FROM public.visits v WHERE v.id=visit_id AND v.supervisor_id=public.get_my_supervisor_id() AND v.company_id=competitor_products.company_id AND v.status='in_progress')) WITH CHECK(company_id=public.get_my_company_id() AND public.mdn_has_screen_v1('competitor_products') AND EXISTS(SELECT 1 FROM public.visits v WHERE v.id=visit_id AND v.supervisor_id=public.get_my_supervisor_id() AND v.company_id=competitor_products.company_id AND v.status='in_progress'));
  END IF;
  IF to_regclass('public.survey_responses') IS NOT NULL THEN
    CREATE POLICY mdn_responses_read ON public.survey_responses FOR SELECT TO authenticated USING(company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(supervisor_id));
    REVOKE INSERT,UPDATE,DELETE ON public.survey_responses FROM authenticated;
  END IF;
  IF to_regclass('public.asset_tickets') IS NOT NULL THEN
    CREATE POLICY mdn_tickets_read ON public.asset_tickets FOR SELECT TO authenticated USING(company_id=public.get_my_company_id());
    CREATE POLICY mdn_tickets_admin ON public.asset_tickets FOR ALL TO authenticated USING(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin')) WITH CHECK(company_id=public.get_my_company_id() AND public.get_my_role() IN('admin','super_admin'));
  END IF;
END $$;

-- Restrictive storage guard prevents any surviving permissive legacy policy from reopening these buckets.
CREATE OR REPLACE FUNCTION public.mdn_media_read_v1(p_bucket text,p_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_bucket='company-logos' THEN true
    WHEN p_bucket NOT IN('shelf-photos','survey-photos','training-materials') THEN true
    ELSE public.mdn_session_ready_v1() AND split_part(p_name,'/',1)=public.get_my_company_id()::text AND (
      (p_bucket='training-materials' AND (public.get_my_role() IN('admin','super_admin') OR EXISTS(
        SELECT 1 FROM public.training_lessons l JOIN public.training_courses c ON c.id=l.course_id AND c.company_id=l.company_id
        WHERE l.company_id=public.get_my_company_id() AND l.is_published AND c.is_published
          AND p_name IN(to_jsonb(l)->>'video_url',to_jsonb(l)->>'attachment_url')
      ))) OR (p_bucket<>'training-materials' AND split_part(p_name,'/',2)=public.get_my_supervisor_id()::text)
      OR public.get_my_role() IN('admin','super_admin')
      OR (p_bucket<>'training-materials' AND EXISTS(SELECT 1 FROM public.supervisors s WHERE s.id::text=split_part(p_name,'/',2) AND public.mdn_can_access_owner_v1(s.id)))
    ) END
$$;
CREATE OR REPLACE FUNCTION public.mdn_media_write_v1(p_bucket text,p_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT public.mdn_session_ready_v1() AND split_part(p_name,'/',1)=public.get_my_company_id()::text AND (
    (p_bucket IN('company-logos','training-materials') AND public.get_my_role() IN('admin','super_admin'))
    OR (p_bucket IN('shelf-photos','survey-photos') AND split_part(p_name,'/',2)=public.get_my_supervisor_id()::text AND (
      public.mdn_has_screen_v1(CASE WHEN p_bucket='survey-photos' THEN 'field_survey' ELSE 'shelf_audit' END)
      OR (p_bucket='shelf-photos' AND public.mdn_has_screen_v1('competitor_products'))
    ))
  )
$$;
DROP POLICY IF EXISTS mdn_private_media_read_guard ON storage.objects;
DROP POLICY IF EXISTS mdn_private_media_insert_guard ON storage.objects;
DROP POLICY IF EXISTS mdn_private_media_update_guard ON storage.objects;
DROP POLICY IF EXISTS mdn_private_media_delete_guard ON storage.objects;
DROP POLICY IF EXISTS mdn_media_read ON storage.objects;
DROP POLICY IF EXISTS mdn_media_insert ON storage.objects;
DROP POLICY IF EXISTS mdn_media_update ON storage.objects;
DROP POLICY IF EXISTS mdn_media_delete ON storage.objects;
CREATE POLICY mdn_private_media_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.mdn_media_read_v1(bucket_id,name));
CREATE POLICY mdn_private_media_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id NOT IN('shelf-photos','survey-photos','training-materials','company-logos') OR public.mdn_media_write_v1(bucket_id,name));
CREATE POLICY mdn_private_media_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id NOT IN('shelf-photos','survey-photos','training-materials','company-logos') OR public.mdn_media_write_v1(bucket_id,name)) WITH CHECK(bucket_id NOT IN('shelf-photos','survey-photos','training-materials','company-logos') OR public.mdn_media_write_v1(bucket_id,name));
CREATE POLICY mdn_private_media_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id NOT IN('shelf-photos','survey-photos','training-materials','company-logos') OR public.mdn_media_write_v1(bucket_id,name));
CREATE POLICY mdn_media_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id IN('shelf-photos','survey-photos','training-materials','company-logos') AND public.mdn_media_read_v1(bucket_id,name));
CREATE POLICY mdn_media_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(public.mdn_media_write_v1(bucket_id,name));
CREATE POLICY mdn_media_update ON storage.objects FOR UPDATE TO authenticated USING(public.mdn_media_write_v1(bucket_id,name)) WITH CHECK(public.mdn_media_write_v1(bucket_id,name));
CREATE POLICY mdn_media_delete ON storage.objects FOR DELETE TO authenticated USING(public.mdn_media_write_v1(bucket_id,name));
UPDATE storage.buckets SET public=false WHERE id IN('shelf-photos','survey-photos','training-materials');

ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS within_geofence boolean;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS on_route boolean;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS gps_accuracy_m double precision;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS gps_recorded_at timestamptz;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS exception_reason text;
CREATE TABLE IF NOT EXISTS public.mdn_action_receipts (
  action_id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES public.companies(id),
  supervisor_id uuid NOT NULL REFERENCES public.supervisors(id), user_id uuid NOT NULL,
  action_type text NOT NULL,payload_hash text NOT NULL,received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mdn_action_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mdn_action_receipts FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mdn_apply_offline_action_v1(p_action_id uuid,p_action_type text,p_payload jsonb,p_company_id uuid,p_supervisor_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE receipt public.mdn_action_receipts%ROWTYPE; entity_id uuid; parent_visit public.visits%ROWTYPE;
  outlet public.customers%ROWTYPE; actual_distance double precision; radius double precision; nearby boolean; planned boolean;
  stamp timestamptz; day date; outcome text; desired_status text; lat double precision; lng double precision; prior_id uuid;
BEGIN
  IF NOT public.mdn_session_ready_v1() OR p_company_id IS DISTINCT FROM public.get_my_company_id()
    OR p_supervisor_id IS DISTINCT FROM public.get_my_supervisor_id() THEN RAISE EXCEPTION 'Forbidden action identity'; END IF;
  IF p_action_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid action'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_action_id::text,0));
  SELECT * INTO receipt FROM public.mdn_action_receipts WHERE action_id=p_action_id;
  IF FOUND THEN
    IF receipt.user_id<>auth.uid() OR receipt.company_id<>p_company_id OR receipt.supervisor_id<>p_supervisor_id
      OR receipt.action_type<>p_action_type OR receipt.payload_hash<>md5(p_payload::text) THEN RAISE EXCEPTION 'Action identity/intent conflict'; END IF;
    RETURN true;
  END IF;
  IF p_action_type='create_visit' THEN
    IF NOT public.mdn_has_screen_v1('new_visit') THEN RAISE EXCEPTION 'Visit permission required'; END IF;
    entity_id := coalesce(nullif(p_payload->>'existingId','')::uuid,(p_payload->>'id')::uuid);
    SELECT * INTO outlet FROM public.customers WHERE id=(p_payload->>'customer_id')::uuid AND company_id=p_company_id AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Customer unavailable'; END IF;
    SELECT * INTO parent_visit FROM public.visits WHERE id=entity_id FOR UPDATE;
    IF FOUND AND (parent_visit.company_id<>p_company_id OR parent_visit.supervisor_id<>p_supervisor_id OR parent_visit.customer_id<>outlet.id) THEN RAISE EXCEPTION 'Visit identity conflict'; END IF;
    IF FOUND AND parent_visit.status<>'pending' THEN
      IF p_payload ? 'existingId' THEN RAISE EXCEPTION 'Pending visit already started or closed'; END IF;
      -- Same client entity ID may be retried after a lost response, even after later completion. Never reopen it.
    ELSE
      lat := (p_payload->>'latitude')::double precision; lng := (p_payload->>'longitude')::double precision;
      IF lat IS NULL OR lng IS NULL OR NOT(lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180) THEN RAISE EXCEPTION 'Valid GPS required'; END IF;
      stamp := (p_payload->>'check_in_time')::timestamptz; day := (p_payload->>'visit_date')::date;
      IF stamp IS NULL OR day IS NULL OR stamp>now()+interval '5 minutes' OR abs(stamp::date-day)>1 THEN RAISE EXCEPTION 'Invalid event time'; END IF;
      IF p_payload ? 'gps_accuracy_m' AND NOT ((p_payload->>'gps_accuracy_m')::double precision>0 AND (p_payload->>'gps_accuracy_m')::double precision<100000) THEN RAISE EXCEPTION 'Invalid GPS accuracy'; END IF;
      IF p_payload ? 'gps_recorded_at' AND abs(extract(epoch FROM stamp-(p_payload->>'gps_recorded_at')::timestamptz))>300 THEN RAISE EXCEPTION 'Stale GPS fix'; END IF;
      SELECT geofence_radius_m INTO radius FROM public.app_settings WHERE company_id=p_company_id;
      IF radius IS NULL OR radius<0 THEN RAISE EXCEPTION 'Company geofence configuration unavailable'; END IF;
      IF outlet.latitude IS NOT NULL AND outlet.longitude IS NOT NULL THEN
        actual_distance := 6371000*2*asin(least(1.0,sqrt(power(sin(radians(outlet.latitude-lat)/2),2)+cos(radians(lat))*cos(radians(outlet.latitude))*power(sin(radians(outlet.longitude-lng)/2),2))));
      END IF;
      nearby := actual_distance IS NOT NULL AND actual_distance<=radius;
      IF NOT nearby AND trim(coalesce(p_payload->>'notes','')) NOT LIKE '[OOR:%' THEN RAISE EXCEPTION 'Out-of-range reason required'; END IF;
      planned := EXISTS(SELECT 1 FROM public.beat_plans b WHERE b.company_id=p_company_id AND b.supervisor_id=p_supervisor_id
        AND b.plan_date=day AND (b.customer_id=outlet.id OR outlet.id=ANY(b.customer_ids_ordered)));
      INSERT INTO public.visits(id,company_id,supervisor_id,customer_id,visit_date,status,check_in_time,latitude,longitude,notes,
        geo_distance,on_beat,within_geofence,on_route,gps_accuracy_m,gps_recorded_at,exception_reason)
      VALUES(entity_id,p_company_id,p_supervisor_id,outlet.id,day,'in_progress',stamp,lat,lng,nullif(trim(p_payload->>'notes'),''),
        actual_distance,nearby,nearby,planned,(p_payload->>'gps_accuracy_m')::double precision,(p_payload->>'gps_recorded_at')::timestamptz,
        CASE WHEN nearby THEN NULL ELSE p_payload->>'notes' END)
      ON CONFLICT(id) DO UPDATE SET status='in_progress',check_in_time=EXCLUDED.check_in_time,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,
        notes=EXCLUDED.notes,geo_distance=EXCLUDED.geo_distance,on_beat=EXCLUDED.on_beat,within_geofence=EXCLUDED.within_geofence,on_route=EXCLUDED.on_route,
        gps_accuracy_m=EXCLUDED.gps_accuracy_m,gps_recorded_at=EXCLUDED.gps_recorded_at,exception_reason=EXCLUDED.exception_reason
      WHERE visits.status='pending' AND visits.company_id=p_company_id AND visits.supervisor_id=p_supervisor_id;
      IF NOT nearby THEN
        INSERT INTO public.notifications(company_id,supervisor_id,type,title_ar,body_ar,is_read)
        VALUES(p_company_id,p_supervisor_id,'oor_visit','زيارة خارج النطاق الجغرافي', 'تم تسجيل استثناء خارج النطاق. المسافة بالمتر: '||coalesce(round(actual_distance)::text,'غير محددة'),false);
      END IF;
    END IF;
  ELSIF p_action_type IN('update_visit_status','set_visit_outcome') THEN
    entity_id := (p_payload->>'id')::uuid;
    SELECT * INTO parent_visit FROM public.visits WHERE id=entity_id AND company_id=p_company_id AND supervisor_id=p_supervisor_id FOR UPDATE;
    IF NOT FOUND OR parent_visit.status<>'in_progress' THEN RAISE EXCEPTION 'Visit is not active or not owned'; END IF;
    IF p_action_type='set_visit_outcome' THEN
      outcome := p_payload->>'outcome';
      IF outcome NOT IN('متعامل','غير متعامل','غير موجود') OR outcome IS NULL THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
      UPDATE public.visits SET visit_outcome=outcome WHERE id=entity_id;
    ELSE
      desired_status:=p_payload->>'status';
      IF desired_status NOT IN('completed','skipped') OR desired_status IS NULL THEN RAISE EXCEPTION 'Invalid status'; END IF;
      IF desired_status='completed' AND parent_visit.visit_outcome IS NULL THEN RAISE EXCEPTION 'Visit outcome required'; END IF;
      IF desired_status='completed' AND parent_visit.visit_outcome='متعامل' AND EXISTS(SELECT 1 FROM public.visit_tasks WHERE visit_id=entity_id AND is_mandatory AND NOT is_completed) THEN RAISE EXCEPTION 'Mandatory tasks incomplete'; END IF;
      stamp:=coalesce((p_payload->>'check_out_time')::timestamptz,now());
      IF stamp<parent_visit.check_in_time OR stamp>now()+interval '5 minutes' THEN RAISE EXCEPTION 'Invalid checkout time'; END IF;
      UPDATE public.visits SET status=desired_status,check_out_time=CASE WHEN desired_status='completed' THEN stamp ELSE NULL END WHERE id=entity_id;
    END IF;
  ELSIF p_action_type='attendance_action' THEN
    day:=(p_payload->>'attendance_date')::date;
    stamp:=(CASE WHEN p_payload->>'kind'='in' THEN p_payload->>'check_in_time' ELSE p_payload->>'check_out_time' END)::timestamptz;
    IF day IS NULL OR stamp IS NULL OR stamp>now()+interval '5 minutes' OR abs(stamp::date-day)>1 THEN RAISE EXCEPTION 'Invalid attendance time'; END IF;
    IF p_payload->>'check_in_lat' IS NOT NULL AND NOT((p_payload->>'check_in_lat')::double precision BETWEEN -90 AND 90) THEN RAISE EXCEPTION 'Invalid attendance latitude'; END IF;
    IF p_payload->>'check_in_lng' IS NOT NULL AND NOT((p_payload->>'check_in_lng')::double precision BETWEEN -180 AND 180) THEN RAISE EXCEPTION 'Invalid attendance longitude'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_supervisor_id::text||day::text,0));
    SELECT id INTO prior_id FROM public.attendance WHERE company_id=p_company_id AND supervisor_id=p_supervisor_id AND attendance_date=day FOR UPDATE;
    IF p_payload->>'kind'='in' THEN
      IF prior_id IS NULL THEN
        INSERT INTO public.attendance(id,company_id,supervisor_id,attendance_date,check_in_time,check_in_lat,check_in_lng)
        VALUES(coalesce((p_payload->>'id')::uuid,gen_random_uuid()),p_company_id,p_supervisor_id,day,(p_payload->>'check_in_time')::timestamptz,
          (p_payload->>'check_in_lat')::double precision,(p_payload->>'check_in_lng')::double precision);
      END IF;
    ELSIF p_payload->>'kind'='out' AND prior_id IS NOT NULL THEN
      UPDATE public.attendance SET check_out_time=coalesce(check_out_time,(p_payload->>'check_out_time')::timestamptz) WHERE id=prior_id AND (p_payload->>'check_out_time')::timestamptz>=check_in_time;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid attendance checkout'; END IF;
    ELSE RAISE EXCEPTION 'Attendance action requires a check-in'; END IF;
  ELSIF p_action_type='save_order' THEN
    RAISE EXCEPTION 'Sales execution is disabled in the task-execution Mydan contract';
  ELSIF p_action_type='submit_survey' THEN
    IF NOT public.mdn_has_screen_v1('field_survey') THEN RAISE EXCEPTION 'Survey permission required'; END IF;
    entity_id:=(p_payload->>'visit_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.visits WHERE id=entity_id AND company_id=p_company_id AND supervisor_id=p_supervisor_id AND status='in_progress') THEN RAISE EXCEPTION 'Visit unavailable'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.surveys WHERE id=(p_payload->>'survey_id')::uuid AND company_id=p_company_id AND is_active) THEN RAISE EXCEPTION 'Survey unavailable'; END IF;
    INSERT INTO public.survey_responses(id,company_id,supervisor_id,survey_id,visit_id,answers,submitted_at)
    VALUES((p_payload->>'id')::uuid,p_company_id,p_supervisor_id,(p_payload->>'survey_id')::uuid,entity_id,p_payload->'answers',coalesce((p_payload->>'submitted_at')::timestamptz,now()));
  ELSE RAISE EXCEPTION 'Unsupported action'; END IF;
  INSERT INTO public.mdn_action_receipts(action_id,company_id,supervisor_id,user_id,action_type,payload_hash)
    VALUES(p_action_id,p_company_id,p_supervisor_id,auth.uid(),p_action_type,md5(p_payload::text));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.mdn_validate_task_evidence_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.is_completed AND NEW.task_type='shelf_audit' AND NOT EXISTS(SELECT 1 FROM public.shelf_audit a WHERE a.visit_id=NEW.visit_id AND a.company_id=NEW.company_id
    AND a.status='completed' AND coalesce(a.ai_detailed_report->>'engine','')<>'smart-vision-engine') THEN RAISE EXCEPTION 'Completed shelf evidence required'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mdn_task_evidence ON public.visit_tasks;
CREATE TRIGGER mdn_task_evidence BEFORE UPDATE OF is_completed ON public.visit_tasks FOR EACH ROW EXECUTE FUNCTION public.mdn_validate_task_evidence_v1();

CREATE OR REPLACE FUNCTION public.mdn_target_notification_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.supervisor_id IS NOT NULL AND (TG_OP='INSERT' OR to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW)) THEN
    INSERT INTO public.notifications(company_id,supervisor_id,type,title_ar,body_ar,is_read)
      VALUES(NEW.company_id,NEW.supervisor_id,'target_update','تم تحديث أهداف المهام','راجع أهداف الزيارات ومراجعات الرف للفترة.',false);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mdn_target_notification ON public.targets;
CREATE TRIGGER mdn_target_notification AFTER INSERT OR UPDATE ON public.targets FOR EACH ROW EXECUTE FUNCTION public.mdn_target_notification_v1();

-- Parent/company consistency is enforced even where the legacy schema has only individual FKs.
CREATE OR REPLACE FUNCTION public.mdn_check_tenant_links_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE doc jsonb:=to_jsonb(NEW); link record; target_company uuid; value text;
BEGIN
  FOR link IN SELECT * FROM (VALUES('supervisor_id','supervisors'),('customer_id','customers'),('visit_id','visits'),
    ('product_id','products'),('branch_id','branches'),('manager_id','supervisors'),('region_id','regions'),('course_id','training_courses'),
    ('lesson_id','training_lessons'),('survey_id','surveys'),('asset_id','assets'),('asset_type_id','asset_types')) AS links(field_name,table_name) LOOP
    IF TG_TABLE_NAME='customers' AND link.field_name='survey_id' THEN link.table_name:='field_surveys'; END IF;
    value := doc->>link.field_name;
    IF value IS NOT NULL THEN
      IF to_regclass('public.'||link.table_name) IS NULL THEN RAISE EXCEPTION 'Missing prerequisite parent relation: %',link.table_name; END IF;
      EXECUTE format('SELECT company_id FROM public.%I WHERE id=$1',link.table_name) INTO target_company USING value::uuid;
      IF target_company IS DISTINCT FROM (doc->>'company_id')::uuid THEN RAISE EXCEPTION 'Cross-company or missing parent: %',link.field_name; END IF;
    END IF;
  END LOOP;
  IF doc ? 'customer_ids_ordered' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(nullif(doc->'customer_ids_ordered','null'::jsonb),'[]'::jsonb)) item WHERE NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.id=item::uuid AND c.company_id=(doc->>'company_id')::uuid)) THEN RAISE EXCEPTION 'Cross-company route customer'; END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['supervisors','customers','visits','visit_tasks','shelf_audit','competitor_products','targets','attendance',
    'orders','price_list','price_lists','branches','beat_plans','assets','asset_tickets','training_lessons','supervisor_training_progress','survey_responses','supervisor_permissions','notifications'] LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS mdn_tenant_links ON public.%I',t);
    EXECUTE format('CREATE TRIGGER mdn_tenant_links BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mdn_check_tenant_links_v1()',t);
  END LOOP;
END $$;

-- All-period aggregates run in PostgreSQL; no browser row cap and no substituted zeros on failure.
CREATE OR REPLACE FUNCTION public.mdn_admin_kpis_v1(p_date_from date,p_date_to date,p_region_id uuid DEFAULT NULL,p_branch_id uuid DEFAULT NULL,p_supervisor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE sups uuid[]; result jsonb; assets_count bigint:=0; tickets_count bigint:=0;
BEGIN
  IF public.get_my_role() NOT IN('admin','super_admin','manager','branch_manager') OR NOT public.mdn_session_ready_v1() THEN RAISE EXCEPTION 'Admin required'; END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL OR p_date_from>p_date_to THEN RAISE EXCEPTION 'Invalid period'; END IF;
  SELECT coalesce(array_agg(s.id),'{}'::uuid[]) INTO sups FROM public.supervisors s LEFT JOIN public.branches b ON b.id=s.branch_id
    WHERE s.company_id=public.get_my_company_id() AND public.mdn_can_access_owner_v1(s.id)
      AND (p_supervisor_id IS NULL OR s.id=p_supervisor_id) AND (p_branch_id IS NULL OR s.branch_id=p_branch_id)
      AND (p_region_id IS NULL OR b.region_id=p_region_id);
  IF to_regclass('public.assets') IS NOT NULL THEN SELECT count(*) INTO assets_count FROM public.assets WHERE company_id=public.get_my_company_id() AND is_active; END IF;
  IF to_regclass('public.asset_tickets') IS NOT NULL THEN SELECT count(*) INTO tickets_count FROM public.asset_tickets WHERE company_id=public.get_my_company_id() AND status IN('open','dispatched','in_progress'); END IF;
  WITH v AS (
    SELECT count(*) AS total,count(*) FILTER(WHERE status='completed') AS done,
      count(*) FILTER(WHERE coalesce(within_geofence,on_beat) IS NOT NULL) AS located,
      count(*) FILTER(WHERE coalesce(within_geofence,on_beat)) AS near
    FROM public.visits WHERE company_id=public.get_my_company_id() AND supervisor_id=ANY(sups) AND visit_date>=p_date_from AND visit_date<=p_date_to
  ), a AS (
    SELECT count(*) AS total,round(avg(audit_score)) AS score FROM public.shelf_audit WHERE company_id=public.get_my_company_id()
      AND supervisor_id=ANY(sups) AND status='completed' AND audited_at>=p_date_from::timestamptz AND audited_at<(p_date_to+1)::timestamptz
      AND coalesce(ai_detailed_report->>'engine','')<>'smart-vision-engine'
  ), t AS (
    SELECT coalesce(sum(visits_target),0) AS visits,coalesce(sum(audit_target),0) AS audits FROM public.targets
    WHERE company_id=public.get_my_company_id() AND (supervisor_id=ANY(sups) OR (supervisor_id IS NULL AND p_supervisor_id IS NULL AND (
        (branch_id IS NULL AND p_branch_id IS NULL AND p_region_id IS NULL)
        OR EXISTS(SELECT 1 FROM public.branches b WHERE b.id=targets.branch_id AND b.company_id=targets.company_id
          AND public.mdn_can_manage_branch_v1(b.id) AND (p_branch_id IS NULL OR b.id=p_branch_id) AND (p_region_id IS NULL OR b.region_id=p_region_id))
      )))
      AND coalesce(criteria,'visits')<>'orders' AND target_date>=date_trunc('month',p_date_from)::date AND target_date<(date_trunc('month',p_date_to)+interval '1 month')::date
  ) SELECT jsonb_build_object('supervisors',(SELECT count(*) FROM public.supervisors WHERE id=ANY(sups) AND is_active),
    'visitsToday',v.total,'visitsAchieved',v.done,'onBeatVisits',v.near,'oorVisits',v.located-v.near,'totalGeoVisits',v.located,
    'geofenceRate',CASE WHEN v.located>0 THEN round(v.near*100.0/v.located) ELSE NULL END,'assets',assets_count,'openTickets',tickets_count,
    'avgPss',a.score,'audits30d',a.total,'auditsAchieved',a.total,'visitsTarget',t.visits,'auditsTarget',t.audits,
    'achievementRate',CASE WHEN t.visits>0 THEN round(v.done*100.0/t.visits) ELSE 0 END) INTO result FROM v,a,t;
  RETURN result;
END $$;

-- Server-only seat reservations serialize against the company row before sending an invitation.
CREATE TABLE IF NOT EXISTS public.mdn_invitation_reservations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id),
  caller_user_id uuid NOT NULL,email text NOT NULL,role text NOT NULL,branch_id uuid,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',UNIQUE(company_id,email)
);
ALTER TABLE public.mdn_invitation_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mdn_invitation_reservations FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.mdn_security_contract_version_v1() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
CREATE OR REPLACE FUNCTION public.mdn_reserve_invitation_v1(p_caller_user_id uuid,p_company_id uuid,p_email text,p_role text,p_branch_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE caller public.supervisors%ROWTYPE; company public.companies%ROWTYPE; reservation uuid;
BEGIN
  SELECT * INTO caller FROM public.supervisors WHERE user_id=p_caller_user_id AND is_active AND NOT force_password_change;
  IF NOT FOUND OR NOT public.mdn_identity_ready_v1(p_caller_user_id,NULL) OR caller.role NOT IN('admin','super_admin') OR (caller.role<>'super_admin' AND caller.company_id<>p_company_id) THEN RAISE EXCEPTION 'Forbidden provisioning'; END IF;
  IF p_role NOT IN('admin','manager','branch_manager','supervisor','senior_supervisor') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  SELECT * INTO company FROM public.companies WHERE id=p_company_id FOR UPDATE;
  IF NOT FOUND OR NOT company.is_active OR (company.expires_at IS NOT NULL AND company.expires_at<=now()) OR company.max_supervisors IS NULL THEN RAISE EXCEPTION 'Company unavailable'; END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch_id AND company_id=p_company_id AND is_active) THEN RAISE EXCEPTION 'Invalid branch'; END IF;
  DELETE FROM public.mdn_invitation_reservations WHERE company_id=p_company_id AND expires_at<=now();
  IF (SELECT count(*) FROM public.supervisors WHERE company_id=p_company_id AND is_active)
    +(SELECT count(*) FROM public.mdn_invitation_reservations WHERE company_id=p_company_id)>=company.max_supervisors THEN RAISE EXCEPTION 'Seat limit reached'; END IF;
  INSERT INTO public.mdn_invitation_reservations(company_id,caller_user_id,email,role,branch_id) VALUES(p_company_id,p_caller_user_id,lower(trim(p_email)),p_role,p_branch_id) RETURNING id INTO reservation;
  RETURN reservation;
END $$;
CREATE OR REPLACE FUNCTION public.mdn_cancel_invitation_v1(p_reservation_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ DELETE FROM public.mdn_invitation_reservations WHERE id=p_reservation_id $$;
CREATE OR REPLACE FUNCTION public.mdn_complete_invitation_v1(p_reservation_id uuid,p_user_id uuid,p_full_name text,p_phone text,p_permissions jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE reservation public.mdn_invitation_reservations%ROWTYPE; profile_id uuid:=gen_random_uuid(); screen text;
BEGIN
  SELECT * INTO reservation FROM public.mdn_invitation_reservations WHERE id=p_reservation_id AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation expired'; END IF;
  PERFORM 1 FROM public.companies WHERE id=reservation.company_id AND is_active AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE;
  IF NOT FOUND OR NOT public.mdn_identity_ready_v1(reservation.caller_user_id,NULL) OR NOT EXISTS(SELECT 1 FROM public.supervisors WHERE user_id=reservation.caller_user_id AND is_active AND NOT force_password_change AND role IN('admin','super_admin') AND (role='super_admin' OR company_id=reservation.company_id)) THEN RAISE EXCEPTION 'Provisioning authorization expired'; END IF;
  IF (SELECT count(*) FROM public.supervisors WHERE company_id=reservation.company_id AND is_active)>=(SELECT max_supervisors FROM public.companies WHERE id=reservation.company_id) THEN RAISE EXCEPTION 'Seat limit reached'; END IF;
  INSERT INTO public.supervisors(id,user_id,company_id,branch_id,full_name,phone,role,is_active,force_password_change)
    VALUES(profile_id,p_user_id,reservation.company_id,reservation.branch_id,trim(p_full_name),nullif(trim(p_phone),''),reservation.role,true,true);
  FOREACH screen IN ARRAY ARRAY['new_visit','shelf_audit','competitor_products','my_reports','notifications','beat_plan','field_survey'] LOOP
    INSERT INTO public.supervisor_permissions(company_id,supervisor_id,screen_key,is_enabled)
      VALUES(reservation.company_id,profile_id,screen,CASE WHEN jsonb_typeof(p_permissions->screen)='boolean' THEN (p_permissions->>screen)::boolean ELSE screen<>'field_survey' END);
  END LOOP;
  INSERT INTO public.audit_logs(company_id,table_name,action,performed_by,new_data)
    VALUES(reservation.company_id,'supervisors','INSERT',(SELECT id FROM public.supervisors WHERE user_id=reservation.caller_user_id),jsonb_build_object('supervisor_id',profile_id,'role',reservation.role,'action','invite'));
  DELETE FROM public.mdn_invitation_reservations WHERE id=reservation.id;
  RETURN profile_id;
END $$;

-- Shared AI budget and leases: claim + quota checks are serialized for both analysis functions.
CREATE TABLE IF NOT EXISTS public.mdn_analysis_jobs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,supervisor_id uuid NOT NULL,
  resource_id uuid NOT NULL,resource_type text NOT NULL CHECK(resource_type IN('shelf_audit','field_surveys')),
  state text NOT NULL CHECK(state IN('processing','completed','failed')),created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS mdn_analysis_company_window ON public.mdn_analysis_jobs(company_id,created_at);
CREATE INDEX IF NOT EXISTS mdn_analysis_supervisor_window ON public.mdn_analysis_jobs(supervisor_id,created_at);
ALTER TABLE public.mdn_analysis_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mdn_analysis_jobs FROM PUBLIC,anon,authenticated;
ALTER TABLE public.shelf_audit ADD COLUMN IF NOT EXISTS analysis_job_id uuid;
DO $$ BEGIN IF to_regclass('public.field_surveys') IS NOT NULL THEN ALTER TABLE public.field_surveys ADD COLUMN IF NOT EXISTS analysis_job_id uuid; END IF; END $$;
CREATE OR REPLACE FUNCTION public.mdn_claim_analysis_job_v1(p_user_id uuid,p_session_id uuid,p_resource_type text,p_resource_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE caller public.supervisors%ROWTYPE; resource record; claimed uuid:=gen_random_uuid(); stale record;
BEGIN
  SELECT * INTO caller FROM public.supervisors WHERE user_id=p_user_id AND is_active AND NOT force_password_change;
  IF NOT FOUND OR NOT public.mdn_identity_ready_v1(p_user_id,p_session_id) THEN RAISE EXCEPTION 'Forbidden analysis caller or unregistered session'; END IF;
  PERFORM 1 FROM public.companies WHERE id=caller.company_id AND is_active AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company unavailable'; END IF;
  IF caller.role NOT IN('admin','super_admin') AND NOT EXISTS(SELECT 1 FROM public.mdn_device_sessions WHERE session_id=p_session_id AND supervisor_id=caller.id AND device_id=caller.device_id) THEN RAISE EXCEPTION 'Unregistered analysis session'; END IF;
  IF p_resource_type NOT IN('shelf_audit','field_surveys') THEN RAISE EXCEPTION 'Invalid analysis type'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.app_settings WHERE company_id=caller.company_id AND ai_audit_enabled=true AND length(trim(coalesce(target_brand_name,'')))>0) THEN RAISE EXCEPTION 'AI disabled or settings unavailable'; END IF;
  IF caller.role NOT IN('admin','super_admin','manager','branch_manager') AND NOT EXISTS(SELECT 1 FROM public.supervisor_permissions WHERE company_id=caller.company_id AND supervisor_id=caller.id AND screen_key=CASE WHEN p_resource_type='shelf_audit' THEN 'shelf_audit' ELSE 'field_survey' END AND is_enabled) THEN RAISE EXCEPTION 'Analysis capability required'; END IF;
  -- Lease expiry is explicit; a late provider response cannot overwrite a newer claim.
  FOR stale IN SELECT * FROM public.mdn_analysis_jobs WHERE company_id=caller.company_id AND state='processing' AND created_at<now()-interval '5 minutes' FOR UPDATE LOOP
    UPDATE public.mdn_analysis_jobs SET state='failed',finished_at=now() WHERE id=stale.id;
    EXECUTE format('UPDATE public.%I SET status=''failed'' WHERE id=$1 AND analysis_job_id=$2',stale.resource_type) USING stale.resource_id,stale.id;
  END LOOP;
  EXECUTE format('SELECT company_id,supervisor_id,status FROM public.%I WHERE id=$1 FOR UPDATE',p_resource_type) INTO resource USING p_resource_id;
  IF resource.company_id IS DISTINCT FROM caller.company_id OR (caller.role NOT IN('admin','super_admin') AND resource.supervisor_id IS DISTINCT FROM caller.id) THEN RAISE EXCEPTION 'Analysis resource unavailable'; END IF;
  IF resource.status IN('processing','completed') THEN RAISE EXCEPTION 'Analysis already claimed or completed' USING ERRCODE='23505'; END IF;
  IF (SELECT count(*) FROM public.mdn_analysis_jobs WHERE company_id=caller.company_id AND created_at>=(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))>=100
    OR (SELECT count(*) FROM public.mdn_analysis_jobs WHERE supervisor_id=caller.id AND created_at>=now()-interval '1 hour')>=20
    OR (SELECT count(*) FROM public.mdn_analysis_jobs WHERE company_id=caller.company_id AND state='processing')>=5 THEN RAISE EXCEPTION 'Analysis budget exceeded' USING ERRCODE='54000'; END IF;
  INSERT INTO public.mdn_analysis_jobs(id,company_id,supervisor_id,resource_id,resource_type,state) VALUES(claimed,caller.company_id,caller.id,p_resource_id,p_resource_type,'processing');
  EXECUTE format('UPDATE public.%I SET status=''processing'',analysis_job_id=$1 WHERE id=$2',p_resource_type) USING claimed,p_resource_id;
  RETURN claimed;
END $$;
CREATE OR REPLACE FUNCTION public.mdn_finish_analysis_job_v1(p_job_id uuid,p_success boolean,p_result jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE job public.mdn_analysis_jobs%ROWTYPE; changed integer;
BEGIN
  SELECT * INTO job FROM public.mdn_analysis_jobs WHERE id=p_job_id AND state='processing' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Analysis lease unavailable'; END IF;
  IF p_success THEN
    IF p_result IS NULL OR jsonb_typeof(p_result)<>'object' OR coalesce(p_result->>'engine','') NOT IN('google-gemini','anthropic') THEN RAISE EXCEPTION 'Measured result required'; END IF;
    IF job.resource_type='shelf_audit' THEN
      IF jsonb_typeof(p_result->'score') IS DISTINCT FROM 'number' OR (p_result->>'score')::numeric NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Invalid measured score'; END IF;
      UPDATE public.shelf_audit SET audit_score=(p_result->>'score')::numeric,audit_summary_ar=p_result->>'audit_summary_ar',
        ai_detailed_report=p_result,status='completed',audited_at=now() WHERE id=job.resource_id AND analysis_job_id=job.id AND status='processing';
    ELSE
      UPDATE public.field_surveys SET stores_found=(p_result->>'stores_found')::integer,ai_raw_result=p_result,status='completed'
        WHERE id=job.resource_id AND analysis_job_id=job.id AND status='processing';
    END IF;
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>1 THEN RAISE EXCEPTION 'Analysis claim superseded'; END IF;
    IF job.resource_type='shelf_audit' AND (p_result#>>'{target_brand_metrics,out_of_stock}')::boolean THEN
      INSERT INTO public.notifications(company_id,supervisor_id,type,title_ar,body_ar,is_read)
      VALUES(job.company_id,job.supervisor_id,'oos_critical','تنبيه نواقص الرف','أظهر التحليل نقصاً؛ راجع تقرير الرف.',false);
    END IF;
  ELSE
    EXECUTE format('UPDATE public.%I SET status=''failed'' WHERE id=$1 AND analysis_job_id=$2 AND status=''processing''',job.resource_type) USING job.resource_id,job.id;
  END IF;
  UPDATE public.mdn_analysis_jobs SET state=CASE WHEN p_success THEN 'completed' ELSE 'failed' END,finished_at=now() WHERE id=job.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.mdn_nearest_customers_v1(
  p_lat    DOUBLE PRECISION,
  p_lng    DOUBLE PRECISION,
  p_limit  INT DEFAULT 10
)
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  customer_type   TEXT,
  address         TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  company_id      UUID,
  supervisor_id   UUID,
  is_active       BOOLEAN,
  customer_code   TEXT,
  distance_km     NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    c.id,
    c.name,
    c.customer_type,
    c.address,
    c.latitude,
    c.longitude,
    c.company_id,
    c.supervisor_id,
    c.is_active,
    c.customer_code,
    ROUND(
      (
        2 * 6371 * ASIN(
          SQRT(
            POWER(SIN((RADIANS(c.latitude)  - RADIANS(p_lat))  / 2), 2)
            + COS(RADIANS(p_lat)) * COS(RADIANS(c.latitude))
            * POWER(SIN((RADIANS(c.longitude) - RADIANS(p_lng)) / 2), 2)
          )
        )
      )::NUMERIC,
      2
    ) AS distance_km
  FROM public.customers c
  WHERE
    c.is_active    = TRUE
    AND c.latitude  IS NOT NULL
    AND c.longitude IS NOT NULL
    -- Tenant isolation: caller must be an active supervisor of the company
    AND c.company_id=public.get_my_company_id()
    AND p_lat BETWEEN -90 AND 90 AND p_lng BETWEEN -180 AND 180
  ORDER BY distance_km ASC
  -- p_limit = 0 means "return all" (maps to JS NearestLimit 'all')
  LIMIT CASE WHEN p_limit <= 0 THEN NULL ELSE p_limit END;
$$;


-- Known analytics views must execute under the caller's table policies.
DO $$ DECLARE view_name text; BEGIN
  FOREACH view_name IN ARRAY ARRAY['vw_daily_kpi_supervisor','vw_perfect_store_index','vw_branch_performance','vw_competitor_heatmap','vw_oor_analysis','vw_asset_fleet_health'] LOOP
    IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=view_name AND c.relkind='v') THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker=true)',view_name);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon',view_name);
    END IF;
  END LOOP;
END $$;

-- Explicit execution grants: trigger helpers are never client endpoints.
DO $$ DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE 'mdn_%' OR p.proname IN('get_my_company_id','get_my_role','get_my_supervisor_id','admin_update_supervisor','delete_supervisor_cascade')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    IF f.proname NOT IN('mdn_identity_ready_v1','mdn_auth_password_changed_v1','mdn_validate_task_evidence_v1','mdn_target_notification_v1','mdn_check_tenant_links_v1','mdn_security_contract_version_v1','mdn_reserve_invitation_v1','mdn_cancel_invitation_v1','mdn_complete_invitation_v1','mdn_claim_analysis_job_v1','mdn_finish_analysis_job_v1') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
    END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.mdn_public_branding_v1(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mdn_media_read_v1(text,text) TO anon;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT EXECUTE ON FUNCTION public.mdn_security_contract_version_v1() TO service_role;
    GRANT EXECUTE ON FUNCTION public.mdn_identity_ready_v1(uuid,uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.mdn_claim_analysis_job_v1(uuid,uuid,text,uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.mdn_finish_analysis_job_v1(uuid,boolean,jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION public.mdn_reserve_invitation_v1(uuid,uuid,text,text,uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.mdn_cancel_invitation_v1(uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.mdn_complete_invitation_v1(uuid,uuid,text,text,jsonb) TO service_role;
  END IF;
END $$;
COMMIT;
