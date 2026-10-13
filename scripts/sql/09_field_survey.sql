-- Migration 09: Field Survey — مسح ميداني (AI Customer Discovery)
-- Apply via Supabase Dashboard → SQL Editor
-- Prerequisites: migrations 01–08 must be applied.
--
-- NOTE: After running this SQL, go to:
--   Supabase Dashboard → Storage → New bucket
--   Name: survey-photos | Private (not public) | File size limit: 10MB

-- ─── 1. field_surveys table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_surveys (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID          NOT NULL REFERENCES companies(id)    ON DELETE CASCADE,
  supervisor_id UUID          NOT NULL REFERENCES supervisors(id)  ON DELETE CASCADE,
  photo_url     TEXT,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  stores_found  INT           NOT NULL DEFAULT 0,
  ai_raw_result JSONB,
  status        TEXT          NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','processing','completed','failed')),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ─── 2. Add status + survey_id to customers ──────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS
  status TEXT DEFAULT 'active' CHECK (status IN ('active','prospect','rejected'));

ALTER TABLE customers ADD COLUMN IF NOT EXISTS
  survey_id UUID REFERENCES field_surveys(id) ON DELETE SET NULL;

-- Backfill existing rows so the CHECK constraint is satisfied
UPDATE customers SET status = 'active' WHERE status IS NULL;

-- ─── 3. RLS on field_surveys ─────────────────────────────────────────────────
ALTER TABLE field_surveys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'field_surveys' AND policyname = 'field_surveys_tenant'
  ) THEN
    CREATE POLICY "field_surveys_tenant" ON field_surveys
      FOR ALL TO authenticated
      USING (
        company_id IN (
          SELECT company_id FROM supervisors
          WHERE user_id = auth.uid() AND is_active = true
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT company_id FROM supervisors
          WHERE user_id = auth.uid() AND is_active = true
        )
      );
  END IF;
END $$;

-- ─── 4. Performance indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_status
  ON customers(company_id, status);

CREATE INDEX IF NOT EXISTS idx_field_surveys_company
  ON field_surveys(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_field_surveys_supervisor
  ON field_surveys(supervisor_id, created_at DESC);
