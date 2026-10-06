-- Phase D (Admin panel) database pieces. Idempotent. Run after 01.

BEGIN;

-- 1) Broadcast notifications: there is no INSERT policy on notifications today,
--    so /admin/notifications cannot send anything. Admins may insert for
--    supervisors of their own company only.
DROP POLICY IF EXISTS "notifications_admin_insert" ON public.notifications;
CREATE POLICY "notifications_admin_insert" ON public.notifications FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_my_company_id()
  AND get_my_role() IN ('admin', 'super_admin')
  AND EXISTS (SELECT 1 FROM public.supervisors s
              WHERE s.id = notifications.supervisor_id AND s.company_id = notifications.company_id)
);

-- 2) Public bucket for company logos (app_settings.logo_url must be an https URL
--    that loads without auth on the login screen). Only logos go here; the
--    existing private company-assets bucket is untouched.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('company-logos', 'company-logos', true, 1048576,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "company_logos_admin_write" ON storage.objects;
CREATE POLICY "company_logos_admin_write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = get_my_company_id()::text
  AND get_my_role() IN ('admin', 'super_admin')
);
DROP POLICY IF EXISTS "company_logos_admin_delete" ON storage.objects;
CREATE POLICY "company_logos_admin_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = get_my_company_id()::text
  AND get_my_role() IN ('admin', 'super_admin')
);

COMMIT;

-- After deploying invite-supervisor and testing one invite:
--   Dashboard → Authentication → Sign In / Providers → turn OFF "Allow new users to sign up".
--   Dashboard → Authentication → URL Configuration → add <app origin>/set-password to Redirect URLs.
