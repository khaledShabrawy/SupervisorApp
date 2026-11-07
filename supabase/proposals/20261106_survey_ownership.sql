-- PROSPECTIVE, REVIEW REQUIRED. Not part of automatic migrations.
-- Application catalog basis: 2026-11-06. Never run against production during tests.
-- Active owners write their own records. Admin/super_admin and branch_manager
-- may manage records only where existing private_rls.can_access_supervisor agrees.
-- senior_supervisor may read the existing helper's branch scope but cannot edit
-- a colleague's answer. Legacy unknown/manager roles gain no new permission.
BEGIN;

CREATE OR REPLACE FUNCTION private_rls.mdn_survey_links_valid_v1(
  p_company_id uuid, p_supervisor_id uuid, p_visit_id uuid, p_survey_id uuid DEFAULT NULL
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT p_company_id = public.get_my_company_id()
   AND EXISTS (SELECT 1 FROM public.supervisors s WHERE s.id=p_supervisor_id AND s.company_id=p_company_id)
   AND (p_visit_id IS NULL OR EXISTS (
     SELECT 1 FROM public.visits v WHERE v.id=p_visit_id AND v.company_id=p_company_id AND v.supervisor_id=p_supervisor_id))
   AND (p_survey_id IS NULL OR EXISTS (
     SELECT 1 FROM public.surveys s WHERE s.id=p_survey_id AND s.company_id=p_company_id));
$$;
REVOKE ALL ON FUNCTION private_rls.mdn_survey_links_valid_v1(uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private_rls.mdn_survey_links_valid_v1(uuid,uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private_rls.mdn_survey_can_write_v1(p_supervisor_id uuid,p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT p_company_id = public.get_my_company_id()
   AND public.get_my_role() IN ('supervisor','senior_supervisor','branch_manager','admin','super_admin')
   AND (p_supervisor_id = private_rls.current_supervisor_id()
     OR (public.get_my_role() IN ('admin','super_admin','branch_manager')
       AND private_rls.can_access_supervisor(p_supervisor_id,p_company_id)));
$$;
REVOKE ALL ON FUNCTION private_rls.mdn_survey_can_write_v1(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private_rls.mdn_survey_can_write_v1(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private_rls.mdn_survey_identity_guard_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id
   OR NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id THEN
   RAISE EXCEPTION 'Survey identity and ownership are immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private_rls.mdn_survey_identity_guard_v1() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS mdn_field_survey_identity ON public.field_surveys;
CREATE TRIGGER mdn_field_survey_identity BEFORE UPDATE ON public.field_surveys
FOR EACH ROW EXECUTE FUNCTION private_rls.mdn_survey_identity_guard_v1();
DROP TRIGGER IF EXISTS mdn_survey_response_identity ON public.survey_responses;
CREATE TRIGGER mdn_survey_response_identity BEFORE UPDATE ON public.survey_responses
FOR EACH ROW EXECUTE FUNCTION private_rls.mdn_survey_identity_guard_v1();

DROP POLICY IF EXISTS field_surveys_tenant ON public.field_surveys;
DROP POLICY IF EXISTS mdn_field_surveys_read_v1 ON public.field_surveys;
DROP POLICY IF EXISTS mdn_field_surveys_insert_v1 ON public.field_surveys;
DROP POLICY IF EXISTS mdn_field_surveys_update_v1 ON public.field_surveys;
DROP POLICY IF EXISTS mdn_field_surveys_delete_v1 ON public.field_surveys;
CREATE POLICY mdn_field_surveys_read_v1 ON public.field_surveys FOR SELECT TO authenticated
USING (company_id=public.get_my_company_id() AND public.get_my_role() IN ('supervisor','senior_supervisor','branch_manager','admin','super_admin')
 AND private_rls.can_access_supervisor(supervisor_id,company_id));
CREATE POLICY mdn_field_surveys_insert_v1 ON public.field_surveys FOR INSERT TO authenticated
WITH CHECK (supervisor_id=private_rls.current_supervisor_id()
 AND private_rls.mdn_survey_can_write_v1(supervisor_id,company_id)
 AND private_rls.mdn_survey_links_valid_v1(company_id,supervisor_id,visit_id,NULL));
CREATE POLICY mdn_field_surveys_update_v1 ON public.field_surveys FOR UPDATE TO authenticated
USING (private_rls.mdn_survey_can_write_v1(supervisor_id,company_id))
WITH CHECK (private_rls.mdn_survey_can_write_v1(supervisor_id,company_id)
 AND private_rls.mdn_survey_links_valid_v1(company_id,supervisor_id,visit_id,NULL));
CREATE POLICY mdn_field_surveys_delete_v1 ON public.field_surveys FOR DELETE TO authenticated
USING (private_rls.mdn_survey_can_write_v1(supervisor_id,company_id));

DROP POLICY IF EXISTS survey_responses_own ON public.survey_responses;
DROP POLICY IF EXISTS mdn_survey_responses_read_v1 ON public.survey_responses;
DROP POLICY IF EXISTS mdn_survey_responses_insert_v1 ON public.survey_responses;
DROP POLICY IF EXISTS mdn_survey_responses_update_v1 ON public.survey_responses;
DROP POLICY IF EXISTS mdn_survey_responses_delete_v1 ON public.survey_responses;
CREATE POLICY mdn_survey_responses_read_v1 ON public.survey_responses FOR SELECT TO authenticated
USING (company_id=public.get_my_company_id() AND public.get_my_role() IN ('supervisor','senior_supervisor','branch_manager','admin','super_admin')
 AND private_rls.can_access_supervisor(supervisor_id,company_id));
CREATE POLICY mdn_survey_responses_insert_v1 ON public.survey_responses FOR INSERT TO authenticated
WITH CHECK (supervisor_id=private_rls.current_supervisor_id()
 AND private_rls.mdn_survey_can_write_v1(supervisor_id,company_id)
 AND private_rls.mdn_survey_links_valid_v1(company_id,supervisor_id,visit_id,survey_id));
CREATE POLICY mdn_survey_responses_update_v1 ON public.survey_responses FOR UPDATE TO authenticated
USING (private_rls.mdn_survey_can_write_v1(supervisor_id,company_id))
WITH CHECK (private_rls.mdn_survey_can_write_v1(supervisor_id,company_id)
 AND private_rls.mdn_survey_links_valid_v1(company_id,supervisor_id,visit_id,survey_id));
CREATE POLICY mdn_survey_responses_delete_v1 ON public.survey_responses FOR DELETE TO authenticated
USING (private_rls.mdn_survey_can_write_v1(supervisor_id,company_id));
COMMIT;
