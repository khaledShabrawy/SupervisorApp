-- Emergency configuration rollback to the captured original task ACL/policy.
-- Restores the original broad policy. Review before use; no task rows are deleted.
BEGIN;
DROP TRIGGER IF EXISTS mdn_task_completion_time ON public.visit_tasks;
DROP FUNCTION IF EXISTS public.mdn_task_completion_time_v1();
DROP FUNCTION IF EXISTS public.mdn_save_visit_task_v1(uuid,uuid,text,text,boolean);
DROP POLICY IF EXISTS mdn_visit_tasks_read ON public.visit_tasks;
DROP POLICY IF EXISTS mdn_visit_tasks_complete ON public.visit_tasks;
DROP POLICY IF EXISTS visit_tasks_own ON public.visit_tasks;
CREATE POLICY visit_tasks_own ON public.visit_tasks FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.visits v WHERE v.id=visit_tasks.visit_id AND v.company_id=visit_tasks.company_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.visits v WHERE v.id=visit_tasks.visit_id AND v.company_id=visit_tasks.company_id));
DROP TRIGGER IF EXISTS mdn_visit_client_transition ON public.visits;
DROP FUNCTION IF EXISTS public.mdn_visit_client_transition_v1();
DROP POLICY IF EXISTS mdn_visits_read ON public.visits;
DROP POLICY IF EXISTS mdn_visits_insert ON public.visits;
DROP POLICY IF EXISTS mdn_visits_update ON public.visits;
DROP FUNCTION IF EXISTS public.mdn_visit_scope_v1(uuid,uuid,uuid);
REVOKE ALL ON public.visits FROM PUBLIC,anon,authenticated;
REVOKE UPDATE (customer_id,status,visit_outcome,latitude,longitude,geo_distance,on_beat,notes,visit_date,check_in_time,check_out_time)
  ON public.visits FROM PUBLIC,anon,authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.visits TO anon,authenticated;
CREATE POLICY "visits_own" ON "public"."visits" AS PERMISSIVE FOR ALL TO PUBLIC USING (((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))) AND ((supervisor_id IN ( SELECT supervisors.id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.role = ANY (ARRAY['admin'::text, 'branch_manager'::text, 'super_admin'::text]))))))));
CREATE POLICY "visits_insert" ON "public"."visits" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((company_id = get_my_company_id()) AND ((supervisor_id = get_my_supervisor_id()) OR (get_my_role() = ANY (ARRAY['admin'::text, 'branch_manager'::text, 'super_admin'::text])))));
REVOKE ALL ON public.visit_tasks FROM PUBLIC,anon,authenticated;
REVOKE UPDATE (is_completed,completed_at) ON public.visit_tasks FROM PUBLIC,anon,authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.visit_tasks TO anon,authenticated;
COMMIT;
