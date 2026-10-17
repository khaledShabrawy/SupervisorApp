-- ==============================================================================
-- MYDAN MIGRATION 15: Phase 5 - Device Binding & FMCG Packaging Units
-- 1. Anti-fraud: device_id in supervisors for single device binding
-- 2. Packaging: units_per_carton & carton_price in products
-- ==============================================================================

BEGIN;

-- ── 1. DEVICE BINDING IN SUPERVISORS ──────────────────────────────────────────
ALTER TABLE IF EXISTS public.supervisors
  ADD COLUMN IF NOT EXISTS device_id TEXT;

CREATE INDEX IF NOT EXISTS idx_supervisors_device_id ON public.supervisors(device_id);

-- Column-level privilege grant for authenticated users (allows updating device_id, full_name, phone)
GRANT UPDATE (full_name, phone, device_id) ON public.supervisors TO authenticated;

-- Ensure supervisors can update their own profile (self device binding)
DROP POLICY IF EXISTS "supervisors_self_update" ON public.supervisors;
CREATE POLICY "supervisors_self_update" ON public.supervisors
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Ensure admins and super_admins can reset device_id or update supervisors
DROP POLICY IF EXISTS "supervisors_admin_update" ON public.supervisors;
CREATE POLICY "supervisors_admin_update" ON public.supervisors
  FOR UPDATE TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('admin', 'super_admin', 'branch_manager')
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('admin', 'super_admin', 'branch_manager')
  );


-- ── 2. FMCG PACKAGING UNITS IN PRODUCTS ───────────────────────────────────────
ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS units_per_carton INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS carton_price NUMERIC(12,2) DEFAULT 0;

-- Backfill existing products so units_per_carton is at least 1
UPDATE public.products
SET units_per_carton = 1
WHERE units_per_carton IS NULL OR units_per_carton < 1;


-- ── 3. COMPANY READ POLICY FOR SUBSCRIPTION VERIFICATION ────────────────────
DROP POLICY IF EXISTS "companies_own_read" ON public.companies;
CREATE POLICY "companies_own_read" ON public.companies
  FOR SELECT TO authenticated
  USING (
    id = get_my_company_id()
    OR get_my_role() = 'super_admin'
  );

COMMIT;

