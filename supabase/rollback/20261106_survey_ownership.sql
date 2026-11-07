-- Restore the captured pre-review policies. This restores their known broad scope.
BEGIN;
DROP POLICY IF EXISTS mdn_field_surveys_read_v1 ON public.field_surveys;
DROP POLICY IF EXISTS mdn_field_surveys_insert_v1 ON public.field_surveys;
DROP POLICY IF EXISTS mdn_field_surveys_update_v1 ON public.field_surveys;
DROP POLICY IF EXISTS mdn_field_surveys_delete_v1 ON public.field_surveys;
DROP POLICY IF EXISTS mdn_survey_responses_read_v1 ON public.survey_responses;
DROP POLICY IF EXISTS mdn_survey_responses_insert_v1 ON public.survey_responses;
DROP POLICY IF EXISTS mdn_survey_responses_update_v1 ON public.survey_responses;
DROP POLICY IF EXISTS mdn_survey_responses_delete_v1 ON public.survey_responses;
DROP TRIGGER IF EXISTS mdn_field_survey_identity ON public.field_surveys;
DROP TRIGGER IF EXISTS mdn_survey_response_identity ON public.survey_responses;
DROP FUNCTION IF EXISTS private_rls.mdn_survey_identity_guard_v1();
DROP FUNCTION IF EXISTS private_rls.mdn_survey_can_write_v1(uuid,uuid);
DROP FUNCTION IF EXISTS private_rls.mdn_survey_links_valid_v1(uuid,uuid,uuid,uuid);
DROP POLICY IF EXISTS field_surveys_tenant ON public.field_surveys;
DROP POLICY IF EXISTS survey_responses_own ON public.survey_responses;
CREATE POLICY "field_surveys_tenant" ON "public"."field_surveys" AS PERMISSIVE FOR ALL TO "authenticated" USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE ((supervisors.user_id = auth.uid()) AND (supervisors.is_active = true))))) WITH CHECK ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE ((supervisors.user_id = auth.uid()) AND (supervisors.is_active = true)))));
CREATE POLICY "survey_responses_own" ON "public"."survey_responses" AS PERMISSIVE FOR ALL TO PUBLIC USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));
COMMIT;
