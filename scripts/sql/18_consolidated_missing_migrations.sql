-- ==============================================================================
-- MYDAN CONSOLIDATED MIGRATION 18: Complete Schema Sync for Supabase
-- Applies all pending schema updates (Phases 1, 3, 4, 5) idempotently.
-- Run this in Supabase Dashboard -> SQL Editor -> Click 'Run'.
-- ==============================================================================

BEGIN;

-- ── 1. REGIONS TABLE & BRANCH LINK ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  name_en     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_branches_region_id ON public.branches(region_id);


-- ── 2. APP SETTINGS & SECURITY CONTROLS ───────────────────────────────────────
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS allow_password_change BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS allow_forgot_password BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS password_expiry_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS password_expiry_days INTEGER NOT NULL DEFAULT 90;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS branch_lock_mode TEXT NOT NULL DEFAULT 'auto_supervisor_branch';


-- ── 3. SUPERVISORS: PASSWORD MGMT & ANTI-FRAUD DEVICE BINDING ─────────────────
ALTER TABLE public.supervisors ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.supervisors ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supervisors ADD COLUMN IF NOT EXISTS device_id TEXT;
CREATE INDEX IF NOT EXISTS idx_supervisors_device_id ON public.supervisors(device_id);


-- ── 4. CUSTOMERS: CUSTOMER CODE ───────────────────────────────────────────────
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_code TEXT;
CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers(customer_code);


-- ── 5. PRODUCTS: BRANDS, CODES & FMCG PACKAGING UNITS ────────────────────────
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS item_code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku_code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS master_brand TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sub_brand TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'قطعة';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS units_per_carton INTEGER DEFAULT 1;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS carton_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Backfill codes and units if null
UPDATE public.products SET sku_code = item_code WHERE sku_code IS NULL AND item_code IS NOT NULL;
UPDATE public.products SET item_code = sku_code WHERE item_code IS NULL AND sku_code IS NOT NULL;
UPDATE public.products SET units_per_carton = 1 WHERE units_per_carton IS NULL OR units_per_carton < 1;

CREATE INDEX IF NOT EXISTS idx_products_item_code ON public.products (company_id, item_code);
CREATE INDEX IF NOT EXISTS idx_products_brands ON public.products (company_id, master_brand, sub_brand);


-- ── 6. TARGETS: CRITERIA & SCOPE ─────────────────────────────────────────────
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS criteria TEXT DEFAULT 'visits';
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS scope_type TEXT DEFAULT 'per_user';
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS target_scope TEXT DEFAULT 'all_branches';
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS target_amount NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_targets_company_criteria ON public.targets (company_id, criteria, target_date);
CREATE INDEX IF NOT EXISTS idx_targets_branch ON public.targets (company_id, branch_id);


-- ── 7. ASSETS: CREATED_AT & INSTALLED_AT ─────────────────────────────────────
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS installed_at TIMESTAMPTZ DEFAULT NOW();


-- ── 8. PRICE LISTS TABLE ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.price_lists (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id    UUID          NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_type TEXT          NOT NULL DEFAULT 'default',
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_lists_company_product ON public.price_lists(company_id, product_id, customer_type);

ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_lists_company_read" ON public.price_lists;
CREATE POLICY "price_lists_company_read" ON public.price_lists
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.supervisors WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "price_lists_admin_write" ON public.price_lists;
CREATE POLICY "price_lists_admin_write" ON public.price_lists
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supervisors s
      WHERE s.user_id = auth.uid()
        AND s.role IN ('admin', 'super_admin')
        AND s.company_id = price_lists.company_id
    )
  );

COMMIT;
