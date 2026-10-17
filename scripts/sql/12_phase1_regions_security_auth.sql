-- ============================================================
-- 12_phase1_regions_security_auth.sql
-- Phase 1: Regions, Security Settings, Auth & Password Policies
-- Idempotent script for Supabase Database
-- ============================================================

BEGIN;

-- 1. Create REGIONS table
CREATE TABLE IF NOT EXISTS public.regions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  name_en     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for regions
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regions_tenant_read" ON public.regions;
CREATE POLICY "regions_tenant_read" ON public.regions
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.supervisors WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "regions_admin_write" ON public.regions;
CREATE POLICY "regions_admin_write" ON public.regions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supervisors s
      WHERE s.user_id = auth.uid()
        AND s.role IN ('admin', 'super_admin')
        AND s.company_id = regions.company_id
    )
  );

-- 2. Link branches to regions
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_branches_region_id ON public.branches(region_id);

-- 3. Security & Auth Settings in app_settings
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS allow_password_change BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS allow_forgot_password BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS password_expiry_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS password_expiry_days INTEGER NOT NULL DEFAULT 90;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS branch_lock_mode TEXT NOT NULL DEFAULT 'auto_supervisor_branch';

-- 4. Supervisor password expiration & force change
ALTER TABLE public.supervisors ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.supervisors ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT NOW();

-- 5. Customer Code in customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_code TEXT;
CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers(customer_code);

-- 6. Product Master Brand, Sub Brand, Item Code
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS item_code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS master_brand TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sub_brand TEXT;
CREATE INDEX IF NOT EXISTS idx_products_item_code ON public.products(item_code);

COMMIT;
