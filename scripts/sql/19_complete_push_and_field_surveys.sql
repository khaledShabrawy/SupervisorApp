-- ==============================================================================
-- MYDAN MIGRATION 19: Complete Push Notifications & Field Surveys Schema Sync
-- Combines Migration 07 (push_subscriptions) & Migration 09 (field_surveys)
-- Safe to run multiple times (Idempotent).
-- Run this in Supabase Dashboard -> SQL Editor -> Click 'Run'.
-- ==============================================================================

BEGIN;

-- ── 1. PUSH NOTIFICATION SUBSCRIPTIONS (Migration 07) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id UUID NOT NULL REFERENCES public.supervisors(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(supervisor_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supervisor_own_subs" ON public.push_subscriptions;
CREATE POLICY "supervisor_own_subs" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (supervisor_id IN (
    SELECT id FROM public.supervisors WHERE user_id = auth.uid()
  ));

GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;


-- ── 2. FIELD SURVEYS & AI DISCOVERY (Migration 09) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.field_surveys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supervisor_id UUID NOT NULL REFERENCES public.supervisors(id) ON DELETE CASCADE,
  photo_url     TEXT,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  stores_found  INT NOT NULL DEFAULT 0,
  ai_raw_result JSONB,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add status & survey_id to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'prospect', 'rejected'));

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS
  survey_id UUID REFERENCES public.field_surveys(id) ON DELETE SET NULL;

-- Backfill existing customers
UPDATE public.customers SET status = 'active' WHERE status IS NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_field_surveys_tenant ON public.field_surveys(company_id, supervisor_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(company_id, status);
CREATE INDEX IF NOT EXISTS idx_customers_survey ON public.customers(survey_id);

-- RLS on field_surveys
ALTER TABLE public.field_surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "field_surveys_tenant" ON public.field_surveys;
CREATE POLICY "field_surveys_tenant" ON public.field_surveys
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.supervisors
      WHERE user_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.supervisors
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

GRANT ALL ON public.field_surveys TO authenticated;

COMMIT;

-- ==============================================================================
-- ⚠️ IMPORTANT POST-SQL STEP (Storage Bucket):
-- In Supabase Dashboard -> Storage:
-- 1. Check if bucket 'survey-photos' exists.
-- 2. If not, click 'New bucket' -> Name: 'survey-photos' -> Private (or Public read) -> Save.
-- ==============================================================================
