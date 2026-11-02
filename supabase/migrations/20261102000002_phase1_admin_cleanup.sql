-- Phase 1: Admin Cleanup Migration
-- Tasks: Supervisor Codes, Branch Deletion Safety, Customer Deletion (Manager), Products fix

-- ─── 1. SUPERVISOR CODES ──────────────────────────────────────────────────────
-- Add supervisor_code column (TEXT, UNIQUE per non-null value).
ALTER TABLE public.supervisors
  ADD COLUMN IF NOT EXISTS supervisor_code TEXT;

-- Partial unique index: two NULLs are allowed (NULL ≠ NULL in SQL).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'supervisors'
      AND indexname = 'supervisors_supervisor_code_key'
  ) THEN
    CREATE UNIQUE INDEX supervisors_supervisor_code_key
      ON public.supervisors(supervisor_code)
      WHERE supervisor_code IS NOT NULL;
  END IF;
END $$;

-- ─── 2. CUSTOMERS HARD DELETE – MANAGER/ADMIN ONLY ───────────────────────────
-- Allow admins and managers to permanently delete customers.
-- Regular supervisors can only toggle is_active (handled by existing UPDATE policy).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'customers'
      AND policyname  = 'managers_can_delete_customers'
  ) THEN
    CREATE POLICY "managers_can_delete_customers"
      ON public.customers
      FOR DELETE
      USING (
        company_id = get_my_company_id()
        AND get_my_role() IN ('admin', 'super_admin', 'branch_manager', 'manager')
      );
  END IF;
END $$;
