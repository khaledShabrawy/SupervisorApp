-- Prospective task-planning authorization. Not applied to production.
-- Requires the captured visits/visit_tasks schema and private_rls helpers.
-- Apply only after a tested production backup and approval of this exact scope.
BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visit_tasks'
    AND policyname NOT IN ('visit_tasks_own','mdn_visit_tasks_read','mdn_visit_tasks_complete')) THEN
    RAISE EXCEPTION 'Unreviewed visit_tasks policy; stop and review the catalog';
  END IF;
END $$;

-- Scoped visit access is also required: a broad visit policy would let a
-- branch manager reassign a foreign-branch visit before calling the task RPC.
CREATE OR REPLACE FUNCTION public.mdn_visit_scope_v1(p_company_id uuid,p_supervisor_id uuid,p_customer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT (SELECT count(*) FROM public.supervisors WHERE user_id=auth.uid() AND is_active IS TRUE)=1
    AND EXISTS (SELECT 1 FROM public.supervisors me JOIN public.supervisors target ON target.id=p_supervisor_id
      WHERE me.user_id=auth.uid() AND me.is_active IS TRUE
        AND me.role IN ('supervisor','senior_supervisor','branch_manager','admin','super_admin')
        AND me.company_id=p_company_id AND target.company_id=p_company_id
        AND private_rls.can_access_supervisor(target.id,p_company_id))
    AND (p_customer_id IS NULL OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id=p_customer_id AND c.company_id=p_company_id));
$$;
REVOKE ALL ON FUNCTION public.mdn_visit_scope_v1(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mdn_visit_scope_v1(uuid,uuid,uuid) TO authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visits'
    AND policyname NOT IN ('visits_own','visits_insert','mdn_visits_read','mdn_visits_insert','mdn_visits_update')) THEN
    RAISE EXCEPTION 'Unreviewed visits policy; stop and review the catalog';
  END IF;
END $$;
DROP POLICY IF EXISTS visits_own ON public.visits;
DROP POLICY IF EXISTS visits_insert ON public.visits;
DROP POLICY IF EXISTS mdn_visits_read ON public.visits;
DROP POLICY IF EXISTS mdn_visits_insert ON public.visits;
DROP POLICY IF EXISTS mdn_visits_update ON public.visits;
REVOKE ALL ON public.visits FROM PUBLIC,anon,authenticated;
REVOKE UPDATE (id,supervisor_id,customer_id,status,visit_outcome,latitude,longitude,geo_distance,on_beat,notes,visit_date,created_at,company_id,check_in_time,check_out_time)
  ON public.visits FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.visits TO authenticated;
GRANT UPDATE (customer_id,status,visit_outcome,latitude,longitude,geo_distance,on_beat,notes,visit_date,check_in_time,check_out_time)
  ON public.visits TO authenticated;
CREATE POLICY mdn_visits_read ON public.visits FOR SELECT TO authenticated
USING (public.mdn_visit_scope_v1(company_id,supervisor_id,customer_id));
CREATE POLICY mdn_visits_insert ON public.visits FOR INSERT TO authenticated
WITH CHECK (public.mdn_visit_scope_v1(company_id,supervisor_id,customer_id)
  AND (supervisor_id=private_rls.current_supervisor_id() OR public.get_my_role() IN ('admin','super_admin','branch_manager')));
CREATE POLICY mdn_visits_update ON public.visits FOR UPDATE TO authenticated
USING (status IN ('pending','in_progress') AND public.mdn_visit_scope_v1(company_id,supervisor_id,customer_id)
  AND (supervisor_id=private_rls.current_supervisor_id() OR public.get_my_role() IN ('admin','super_admin','branch_manager')))
WITH CHECK (public.mdn_visit_scope_v1(company_id,supervisor_id,customer_id)
  AND (supervisor_id=private_rls.current_supervisor_id() OR public.get_my_role() IN ('admin','super_admin','branch_manager')));

CREATE OR REPLACE FUNCTION public.mdn_visit_client_transition_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Visit identity cannot be changed by a client' USING ERRCODE='42501';
    END IF;
    IF OLD.status NOT IN ('pending','in_progress') OR NEW.status IS NULL
      OR (OLD.status='pending' AND NEW.status NOT IN ('pending','in_progress','skipped'))
      OR (OLD.status='in_progress' AND NEW.status NOT IN ('in_progress','completed','skipped')) THEN
      RAISE EXCEPTION 'Invalid visit state transition' USING ERRCODE='42501';
    END IF;
    IF OLD.status='in_progress' AND NEW.check_in_time IS DISTINCT FROM OLD.check_in_time THEN
      RAISE EXCEPTION 'Visit check-in cannot be replaced' USING ERRCODE='42501';
    END IF;
    IF NEW.status='in_progress' AND (NEW.check_in_time IS NULL OR NEW.check_out_time IS NOT NULL) THEN
      RAISE EXCEPTION 'Active visit requires a check-in and no checkout' USING ERRCODE='22023';
    END IF;
    IF NEW.status='completed' AND NEW.visit_outcome='متعامل' AND EXISTS (
      SELECT 1 FROM public.visit_tasks task WHERE task.visit_id=OLD.id AND task.company_id=OLD.company_id
      AND task.is_mandatory IS TRUE AND task.is_completed IS DISTINCT FROM true
    ) THEN
      RAISE EXCEPTION 'Complete mandatory tasks before checkout' USING ERRCODE='22023';
    END IF;
    IF NEW.status='completed' AND (NEW.check_in_time IS NULL OR NEW.check_out_time IS NULL OR NEW.check_out_time<NEW.check_in_time) THEN
      RAISE EXCEPTION 'Completed visit requires valid check-in/checkout' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mdn_visit_client_transition_v1() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS mdn_visit_client_transition ON public.visits;
CREATE TRIGGER mdn_visit_client_transition BEFORE UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.mdn_visit_client_transition_v1();

REVOKE ALL ON public.visit_tasks FROM PUBLIC, anon, authenticated;
REVOKE SELECT (id,visit_id,task_type,title_ar,is_completed,is_mandatory,order_num,completed_at,created_at,company_id)
  ON public.visit_tasks FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id,visit_id,task_type,title_ar,is_completed,is_mandatory,order_num,completed_at,created_at,company_id)
  ON public.visit_tasks FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id,visit_id,task_type,title_ar,is_completed,is_mandatory,order_num,completed_at,created_at,company_id)
  ON public.visit_tasks FROM PUBLIC, anon, authenticated;
REVOKE REFERENCES (id,visit_id,task_type,title_ar,is_completed,is_mandatory,order_num,completed_at,created_at,company_id)
  ON public.visit_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.visit_tasks TO authenticated;
GRANT UPDATE (is_completed,completed_at) ON public.visit_tasks TO authenticated;

DROP POLICY IF EXISTS visit_tasks_own ON public.visit_tasks;
DROP POLICY IF EXISTS mdn_visit_tasks_read ON public.visit_tasks;
CREATE POLICY mdn_visit_tasks_read ON public.visit_tasks FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.visits v WHERE v.id=visit_tasks.visit_id
  AND v.company_id=visit_tasks.company_id
  AND private_rls.can_access_supervisor(v.supervisor_id,v.company_id)));
DROP POLICY IF EXISTS mdn_visit_tasks_complete ON public.visit_tasks;
CREATE POLICY mdn_visit_tasks_complete ON public.visit_tasks FOR UPDATE TO authenticated
USING (is_completed IS FALSE AND EXISTS (SELECT 1 FROM public.visits v
  JOIN public.supervisors me ON me.id=v.supervisor_id
  WHERE v.id=visit_tasks.visit_id AND v.company_id=visit_tasks.company_id
    AND me.company_id=v.company_id AND me.user_id=auth.uid() AND me.is_active IS TRUE
    AND v.status='in_progress' AND v.check_in_time IS NOT NULL AND v.check_out_time IS NULL))
WITH CHECK (is_completed IS TRUE AND completed_at IS NOT NULL AND EXISTS (SELECT 1 FROM public.visits v
  JOIN public.supervisors me ON me.id=v.supervisor_id
  WHERE v.id=visit_tasks.visit_id AND v.company_id=visit_tasks.company_id
    AND me.company_id=v.company_id AND me.user_id=auth.uid() AND me.is_active IS TRUE
    AND v.status='in_progress' AND v.check_in_time IS NOT NULL AND v.check_out_time IS NULL));

CREATE OR REPLACE FUNCTION public.mdn_task_completion_time_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE active_status text; active_owner uuid;
BEGIN
  -- Coordinate completion with checkout/planning on the same parent visit row.
  -- Checkout reads child rows without locking them, so this lock order cannot deadlock.
  SELECT status,supervisor_id INTO active_status,active_owner FROM public.visits
    WHERE id=OLD.visit_id AND company_id=OLD.company_id FOR UPDATE;
  IF current_user IN ('authenticated','anon') AND (active_status IS DISTINCT FROM 'in_progress' OR active_owner IS DISTINCT FROM private_rls.current_supervisor_id()) THEN
    RAISE EXCEPTION 'Task completion requires its active owning visit' USING ERRCODE='42501';
  END IF;
  -- Do not accept a client-supplied completion timestamp.
  IF NEW.is_completed IS TRUE AND OLD.is_completed IS DISTINCT FROM true THEN
    NEW.completed_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mdn_task_completion_time_v1() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS mdn_task_completion_time ON public.visit_tasks;
CREATE TRIGGER mdn_task_completion_time BEFORE UPDATE OF is_completed,completed_at ON public.visit_tasks
FOR EACH ROW EXECUTE FUNCTION public.mdn_task_completion_time_v1();

CREATE OR REPLACE FUNCTION public.mdn_save_visit_task_v1(
  p_visit_id uuid,p_task_id uuid,p_title_ar text,p_task_type text,p_is_mandatory boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor public.supervisors%ROWTYPE;
  planned public.visits%ROWTYPE;
  existing public.visit_tasks%ROWTYPE;
  next_order integer;
BEGIN
  BEGIN
    SELECT * INTO STRICT actor FROM public.supervisors WHERE user_id=auth.uid() AND is_active IS TRUE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'Exactly one active manager is required' USING ERRCODE='42501';
  END;
  IF actor.role IS NULL OR actor.role NOT IN ('admin','super_admin','branch_manager') OR actor.company_id IS NULL THEN
    RAISE EXCEPTION 'Manager access required' USING ERRCODE='42501';
  END IF;
  IF p_visit_id IS NULL OR p_task_id IS NULL OR p_is_mandatory IS NULL
    OR p_title_ar IS NULL OR char_length(btrim(p_title_ar)) NOT BETWEEN 1 AND 200
    OR p_task_type IS NULL OR p_task_type NOT IN ('shelf_audit','competitor_check','survey','other') THEN
    RAISE EXCEPTION 'Invalid task fields' USING ERRCODE='22023';
  END IF;
  -- Starting a visit and planning its tasks serialize on the same visit row.
  SELECT * INTO planned FROM public.visits WHERE id=p_visit_id FOR UPDATE;
  IF NOT FOUND OR planned.company_id IS DISTINCT FROM actor.company_id
    OR planned.supervisor_id IS NULL
    OR NOT private_rls.can_access_supervisor(planned.supervisor_id,planned.company_id) THEN
    RAISE EXCEPTION 'Visit is outside the permitted company or branch' USING ERRCODE='42501';
  END IF;
  IF planned.status IS DISTINCT FROM 'pending' OR planned.check_in_time IS NOT NULL OR planned.check_out_time IS NOT NULL THEN
    RAISE EXCEPTION 'Only a not-yet-started planned visit can be edited' USING ERRCODE='22023';
  END IF;
  SELECT * INTO existing FROM public.visit_tasks WHERE id=p_task_id FOR UPDATE;
  IF FOUND THEN
    IF existing.visit_id IS DISTINCT FROM planned.id OR existing.company_id IS DISTINCT FROM planned.company_id THEN
      RAISE EXCEPTION 'Task is outside the selected visit' USING ERRCODE='42501';
    END IF;
    IF existing.is_completed IS DISTINCT FROM false OR existing.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Completed task history is immutable' USING ERRCODE='22023';
    END IF;
    UPDATE public.visit_tasks SET title_ar=btrim(p_title_ar),task_type=p_task_type,is_mandatory=p_is_mandatory
      WHERE id=existing.id;
  ELSE
    SELECT coalesce(max(order_num),-1)+1 INTO next_order FROM public.visit_tasks WHERE visit_id=planned.id;
    INSERT INTO public.visit_tasks(id,visit_id,company_id,title_ar,task_type,is_mandatory,order_num)
      VALUES(p_task_id,planned.id,planned.company_id,btrim(p_title_ar),p_task_type,p_is_mandatory,next_order);
  END IF;
  RETURN p_task_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mdn_save_visit_task_v1(uuid,uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mdn_save_visit_task_v1(uuid,uuid,text,text,boolean) TO authenticated;
COMMIT;
