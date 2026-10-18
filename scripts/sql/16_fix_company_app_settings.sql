-- ==============================================================================
-- MYDAN MIGRATION 16: Fix Company App Settings & Auto-Initialization Trigger
-- 1. Backfill app_settings for any existing company missing its settings
-- 2. Trigger on companies table to automatically create app_settings on new company
-- 3. RLS policy to allow admins and super_admins to insert/upsert app_settings
-- ==============================================================================

BEGIN;

-- ── 1. RLS POLICIES FOR APP_SETTINGS ──────────────────────────────────────────
-- Allow authenticated users to read settings of their own company (or super_admin read all)
DROP POLICY IF EXISTS "app_settings_company_read" ON public.app_settings;
CREATE POLICY "app_settings_company_read" ON public.app_settings
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    OR get_my_role() = 'super_admin'
  );

-- Allow admins to insert settings for their own company, and super_admin for any company
DROP POLICY IF EXISTS "app_settings_admin_insert" ON public.app_settings;
CREATE POLICY "app_settings_admin_insert" ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = get_my_company_id() AND get_my_role() IN ('admin', 'super_admin'))
    OR get_my_role() = 'super_admin'
  );

-- Allow admins to update settings for their own company, and super_admin for any company
DROP POLICY IF EXISTS "app_settings_admin_write" ON public.app_settings;
CREATE POLICY "app_settings_admin_write" ON public.app_settings
  FOR UPDATE TO authenticated
  USING (
    (company_id = get_my_company_id() AND get_my_role() IN ('admin', 'super_admin'))
    OR get_my_role() = 'super_admin'
  )
  WITH CHECK (
    (company_id = get_my_company_id() AND get_my_role() IN ('admin', 'super_admin'))
    OR get_my_role() = 'super_admin'
  );


-- ── 2. BACKFILL APP_SETTINGS FOR EXISTING COMPANIES ───────────────────────────
INSERT INTO public.app_settings (
  company_id,
  app_name,
  primary_color,
  success_color,
  danger_color,
  background_color,
  geofence_radius_m,
  target_brand_name,
  competitor_brands,
  ai_audit_enabled
)
SELECT
  c.id,
  COALESCE(NULLIF(c.name, ''), 'Mydan'),
  '#1A56DB',
  '#10B981',
  '#EF4444',
  '#F8FAFC',
  100,
  COALESCE(NULLIF(c.name, ''), 'Mydan'),
  '{}',
  true
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings s WHERE s.company_id = c.id
)
ON CONFLICT DO NOTHING;


-- ── 3. AUTOMATIC TRIGGER FOR FUTURE NEW COMPANIES ────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_company_app_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_settings (
    company_id,
    app_name,
    primary_color,
    success_color,
    danger_color,
    background_color,
    geofence_radius_m,
    target_brand_name,
    competitor_brands,
    ai_audit_enabled
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.name, ''), 'Mydan'),
    '#1A56DB',
    '#10B981',
    '#EF4444',
    '#F8FAFC',
    100,
    COALESCE(NULLIF(NEW.name, ''), 'Mydan'),
    '{}',
    true
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_company_create_app_settings ON public.companies;
CREATE TRIGGER tr_company_create_app_settings
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_company_app_settings();

COMMIT;
