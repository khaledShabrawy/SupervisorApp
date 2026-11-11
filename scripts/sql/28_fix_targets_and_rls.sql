-- ============================================================
-- Migration 28: Fix Monthly Targets Save, General Targets, & Manager RLS
-- Project: Mydan / ywdlrrdkjbtpfgacuuoy
-- Purpose:
--   1. Allow general / branch-wide monthly targets (supervisor_id NULLABLE)
--   2. Ensure target scope columns (criteria, scope_type, target_scope, branch_id, etc.) exist
--   3. Replace legacy UNIQUE (supervisor_id, target_date) with multi-criteria unique index
--      so multiple targets (visits / orders / shelf_audit / new_opportunity) can coexist
--   4. Allow 'manager' role alongside 'admin', 'super_admin', 'branch_manager' in targets RLS
-- ============================================================

BEGIN;

-- 1. Ensure Phase 3+ target columns exist idempotently
ALTER TABLE public.targets
  ADD COLUMN IF NOT EXISTS criteria text NOT NULL DEFAULT 'visits',
  ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS target_scope text NOT NULL DEFAULT 'all_branches',
  ADD COLUMN IF NOT EXISTS branch_id uuid NULL REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS orders_target integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_orders integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_sales_amount numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_sales_amount numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prospects_target integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_prospects integer NOT NULL DEFAULT 0;

-- 2. Allow NULL supervisor_id for general / branch-wide targets
ALTER TABLE public.targets
  ALTER COLUMN supervisor_id DROP NOT NULL;

-- 3. Drop legacy single-criteria constraint and replace with scope/criteria-aware unique index
ALTER TABLE public.targets
  DROP CONSTRAINT IF EXISTS targets_supervisor_id_target_date_key;

DROP INDEX IF EXISTS idx_targets_scope_unique;
CREATE UNIQUE INDEX idx_targets_scope_unique ON public.targets (
  company_id,
  COALESCE(supervisor_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  target_date,
  COALESCE(criteria, 'visits')
);

-- 4. Allow 'manager' role in targets RLS write policy (plus SELECT for all company users)
DROP POLICY IF EXISTS "targets_admin_write" ON public.targets;
CREATE POLICY "targets_admin_write" ON public.targets
FOR ALL TO authenticated
USING (
  company_id = get_my_company_id()
  AND get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
)
WITH CHECK (
  company_id = get_my_company_id()
  AND get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.targets TO authenticated;

COMMIT;
