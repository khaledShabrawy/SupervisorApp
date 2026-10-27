-- ==============================================================================
-- MYDAN MIGRATION 24: Add supervisor_code to supervisors table for easy target & beat plan bulk import
-- ==============================================================================

BEGIN;

-- 1. Add supervisor_code column
ALTER TABLE IF EXISTS public.supervisors
  ADD COLUMN IF NOT EXISTS supervisor_code text;

CREATE INDEX IF NOT EXISTS idx_supervisors_code
  ON public.supervisors (company_id, supervisor_code);

-- 2. Backfill sequential supervisor codes for existing supervisors without a code
DO $$
DECLARE
  rec RECORD;
  i INT;
  v_company UUID;
BEGIN
  FOR v_company IN SELECT DISTINCT company_id FROM public.supervisors WHERE company_id IS NOT NULL LOOP
    i := 1;
    FOR rec IN 
      SELECT id 
      FROM public.supervisors 
      WHERE company_id = v_company AND (supervisor_code IS NULL OR supervisor_code = '') 
      ORDER BY created_at ASC NULLS LAST, id ASC 
    LOOP
      UPDATE public.supervisors
      SET supervisor_code = 'SUP-' || LPAD(i::TEXT, 3, '0')
      WHERE id = rec.id;
      i := i + 1;
    END LOOP;
  END LOOP;
END $$;

-- 3. Update permissions so authenticated users can read/update supervisor_code
GRANT UPDATE (full_name, phone, device_id, is_active, role, branch_id, supervisor_code)
  ON public.supervisors TO authenticated;

COMMIT;
