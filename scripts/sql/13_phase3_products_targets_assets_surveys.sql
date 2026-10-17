-- ==============================================================================
-- MYDAN MIGRATION 13: Phase 3 - Products, Targets criteria/scope, Assets tenant isolation & date, Surveys checklist
-- ==============================================================================

BEGIN;

-- ── 1. PRODUCTS: item_code, master_brand, sub_brand ───────────────────────────
ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS item_code text,
  ADD COLUMN IF NOT EXISTS master_brand text,
  ADD COLUMN IF NOT EXISTS sub_brand text;

CREATE INDEX IF NOT EXISTS idx_products_item_code
  ON public.products (company_id, item_code);

CREATE INDEX IF NOT EXISTS idx_products_brands
  ON public.products (company_id, master_brand, sub_brand);


-- ── 2. TARGETS: criteria, scope_type, target_scope, branch_id, target_amount ────
ALTER TABLE IF EXISTS public.targets
  ADD COLUMN IF NOT EXISTS criteria text DEFAULT 'visits',
  ADD COLUMN IF NOT EXISTS scope_type text DEFAULT 'per_user',
  ADD COLUMN IF NOT EXISTS target_scope text DEFAULT 'all_branches',
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_amount numeric DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_targets_company_criteria
  ON public.targets (company_id, criteria, target_date);

CREATE INDEX IF NOT EXISTS idx_targets_branch
  ON public.targets (company_id, branch_id);

-- Enforce strict RLS on targets table
ALTER TABLE IF EXISTS public.targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "targets_company_read" ON public.targets;
CREATE POLICY "targets_company_read" ON public.targets
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    OR get_my_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "targets_admin_write" ON public.targets;
CREATE POLICY "targets_admin_write" ON public.targets
  FOR ALL TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('admin', 'super_admin', 'branch_manager')
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('admin', 'super_admin', 'branch_manager')
  );


-- ── 3. ASSETS & ASSET TYPES: created_at, installed_at & strict company isolation ─
ALTER TABLE IF EXISTS public.assets
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS installed_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_assets_company_created
  ON public.assets (company_id, created_at DESC);

-- Enforce strict RLS on assets and asset_types
ALTER TABLE IF EXISTS public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.asset_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assets_company_read" ON public.assets;
CREATE POLICY "assets_company_read" ON public.assets
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    OR get_my_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "assets_admin_write" ON public.assets;
CREATE POLICY "assets_admin_write" ON public.assets
  FOR ALL TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('admin', 'super_admin', 'branch_manager')
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('admin', 'super_admin', 'branch_manager')
  );

DROP POLICY IF EXISTS "asset_types_company_read" ON public.asset_types;
CREATE POLICY "asset_types_company_read" ON public.asset_types
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    OR get_my_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "asset_types_admin_write" ON public.asset_types;
CREATE POLICY "asset_types_admin_write" ON public.asset_types
  FOR ALL TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('admin', 'super_admin')
  );


COMMIT;
