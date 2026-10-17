-- ==============================================================================
-- MYDAN MIGRATION 14: Phase 4 - Mobile App Hardening, Customer RLS & Price Lists
-- Ensures supervisors only see their assigned customers, products load reliably,
-- and price_lists table exists with multi-tenant RLS.
-- ==============================================================================

BEGIN;

-- ── 1. HARDEN CUSTOMERS SELECT RLS ───────────────────────────────────────────
-- Each supervisor sees only their own customers (or unassigned company customers).
-- Admins, super_admins, and branch_managers see all company customers.

DROP POLICY IF EXISTS "customers_company_read" ON public.customers;
CREATE POLICY "customers_company_read" ON public.customers
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      get_my_role() IN ('admin', 'super_admin', 'branch_manager')
      OR supervisor_id = get_my_supervisor_id()
      OR supervisor_id IS NULL
    )
  );

-- ── 2. ENSURE PRODUCTS COLUMNS EXIST & BACKFILL ──────────────────────────────
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS item_code TEXT;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS sku_code TEXT;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS master_brand TEXT;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS sub_brand TEXT;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'قطعة';
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Backfill sku_code and item_code if missing
UPDATE public.products SET sku_code = item_code WHERE sku_code IS NULL AND item_code IS NOT NULL;
UPDATE public.products SET item_code = sku_code WHERE item_code IS NULL AND sku_code IS NOT NULL;

-- ── 3. PRICE LISTS TABLE & RLS ────────────────────────────────────────────────
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
  USING (company_id = get_my_company_id());

DROP POLICY IF EXISTS "price_lists_admin_write" ON public.price_lists;
CREATE POLICY "price_lists_admin_write" ON public.price_lists
  FOR ALL TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('admin', 'super_admin')
  );

-- ── 4. CUSTOMER TYPES SUPPORT ────────────────────────────────────────────────
-- Ensure customer_code index exists for quick barcode/code lookups
CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers(company_id, customer_code);

COMMENT ON TABLE public.price_lists IS 'Customer-specific and default price lists per tenant';

COMMIT;
