-- Migration 10: Field survey private storage policies.
-- Prerequisites: migrations 01-09 applied and the private survey-photos bucket exists.
-- Upload paths follow: {company_id}/{supervisor_id}/{uuid}.ext
-- Service-role downloads in discover-customers bypass these client policies.

DROP POLICY IF EXISTS "survey_photos_supervisor_insert" ON storage.objects;
CREATE POLICY "survey_photos_supervisor_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'survey-photos'
    AND (storage.foldername(name))[1] = get_my_company_id()::text
    AND (storage.foldername(name))[2] = get_my_supervisor_id()::text
  );

-- The client removes an uploaded object if creating its field_surveys row fails.
DROP POLICY IF EXISTS "survey_photos_supervisor_delete" ON storage.objects;
CREATE POLICY "survey_photos_supervisor_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'survey-photos'
    AND (storage.foldername(name))[1] = get_my_company_id()::text
    AND (storage.foldername(name))[2] = get_my_supervisor_id()::text
  );
