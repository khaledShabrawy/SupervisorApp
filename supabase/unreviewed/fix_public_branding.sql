-- Allow public (anon + authenticated) to read app_settings branding
DROP POLICY IF EXISTS "app_settings_public_read" ON app_settings;
CREATE POLICY "app_settings_public_read" ON app_settings
  FOR SELECT TO anon, authenticated
  USING (true);

-- Ensure company-logos bucket is public and readable by anyone
UPDATE storage.buckets SET public = true WHERE id = 'company-logos';

DROP POLICY IF EXISTS "company_logos_public_read" ON storage.objects;
CREATE POLICY "company_logos_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'company-logos');
