-- Migration 11: Field survey row-level isolation.
-- Prerequisites: migrations 01-10 have been reviewed/applied; test in staging first.
-- Supervisors can manage their own surveys. Company admins/managers may read
-- company survey rows for oversight. Client-side writes remain owner-scoped.
-- This replaces migration 09's company-wide FOR ALL policy.

DROP POLICY IF EXISTS "field_surveys_tenant" ON public.field_surveys;
DROP POLICY IF EXISTS "field_surveys_company_read" ON public.field_surveys;
DROP POLICY IF EXISTS "field_surveys_owner_insert" ON public.field_surveys;
DROP POLICY IF EXISTS "field_surveys_owner_update" ON public.field_surveys;
DROP POLICY IF EXISTS "field_surveys_owner_delete" ON public.field_surveys;

CREATE POLICY "field_surveys_company_read" ON public.field_surveys
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supervisors s
      WHERE s.user_id = auth.uid()
        AND s.is_active = true
        AND s.company_id = field_surveys.company_id
        AND (
          s.id = field_surveys.supervisor_id
          OR s.role IN ('admin', 'branch_manager', 'super_admin')
        )
    )
  );

CREATE POLICY "field_surveys_owner_insert" ON public.field_surveys
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.supervisors s
      WHERE s.user_id = auth.uid()
        AND s.is_active = true
        AND s.company_id = field_surveys.company_id
        AND s.id = field_surveys.supervisor_id
    )
  );

CREATE POLICY "field_surveys_owner_update" ON public.field_surveys
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supervisors s
      WHERE s.user_id = auth.uid()
        AND s.is_active = true
        AND s.company_id = field_surveys.company_id
        AND s.id = field_surveys.supervisor_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.supervisors s
      WHERE s.user_id = auth.uid()
        AND s.is_active = true
        AND s.company_id = field_surveys.company_id
        AND s.id = field_surveys.supervisor_id
    )
  );

CREATE POLICY "field_surveys_owner_delete" ON public.field_surveys
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supervisors s
      WHERE s.user_id = auth.uid()
        AND s.is_active = true
        AND s.company_id = field_surveys.company_id
        AND s.id = field_surveys.supervisor_id
    )
  );
