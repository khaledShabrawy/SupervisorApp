-- Migration 12: Offline-first competitor field intelligence for the marketing team.
-- Apply after reviewing migrations 01-11; test with two supervisors and an admin in staging.
-- The client generates UUIDs before saving locally; the primary key makes upload retries idempotent.
BEGIN;

CREATE TABLE IF NOT EXISTS public.competitor_field_observations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supervisor_id  UUID NOT NULL REFERENCES public.supervisors(id) ON DELETE CASCADE,
  visit_id       UUID REFERENCES public.visits(id) ON DELETE SET NULL,
  customer_id    UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  outlet_name    TEXT,
  competitor_name TEXT NOT NULL CHECK (length(trim(competitor_name)) BETWEEN 1 AND 160),
  brand_name     TEXT NOT NULL CHECK (length(trim(brand_name)) BETWEEN 1 AND 160),
  product_name   TEXT,
  pack_size      TEXT,
  price          NUMERIC(12,2) CHECK (price IS NULL OR price >= 0),
  currency_code  TEXT NOT NULL DEFAULT 'EGP' CHECK (currency_code ~ '^[A-Z]{3}$'),
  promotion      TEXT,
  availability   TEXT NOT NULL DEFAULT 'unknown'
                 CHECK (availability IN ('in_stock','low_stock','out_of_stock','unknown')),
  shelf_position TEXT NOT NULL DEFAULT 'unknown'
                 CHECK (shelf_position IN ('eye_level','top','bottom','checkout','end_cap','unknown')),
  notes          TEXT,
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  observed_at    TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT competitor_observation_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT competitor_observation_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CONSTRAINT competitor_observation_visit_company CHECK (visit_id IS NULL OR customer_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_competitor_field_company_date
  ON public.competitor_field_observations(company_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_field_company_brand
  ON public.competitor_field_observations(company_id, brand_name);
CREATE INDEX IF NOT EXISTS idx_competitor_field_company_name
  ON public.competitor_field_observations(company_id, competitor_name);

ALTER TABLE public.competitor_field_observations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "competitor_field_observations_company_read" ON public.competitor_field_observations;
DROP POLICY IF EXISTS "competitor_field_observations_owner_insert" ON public.competitor_field_observations;

CREATE POLICY "competitor_field_observations_company_read"
  ON public.competitor_field_observations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supervisors s
      WHERE s.user_id = auth.uid() AND s.is_active = true
        AND s.company_id = competitor_field_observations.company_id
        AND (s.id = competitor_field_observations.supervisor_id
          OR s.role IN ('admin','branch_manager','super_admin'))
    )
  );

CREATE POLICY "competitor_field_observations_owner_insert"
  ON public.competitor_field_observations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.supervisors s
      WHERE s.user_id = auth.uid() AND s.is_active = true
        AND s.id = competitor_field_observations.supervisor_id
        AND s.company_id = competitor_field_observations.company_id
    )
    AND (visit_id IS NULL OR EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = competitor_field_observations.visit_id
        AND v.company_id = competitor_field_observations.company_id
        AND v.supervisor_id = competitor_field_observations.supervisor_id
    ))
    AND (customer_id IS NULL OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = competitor_field_observations.customer_id
        AND c.company_id = competitor_field_observations.company_id
    ))
  );

GRANT SELECT, INSERT ON TABLE public.competitor_field_observations TO authenticated;

COMMIT;
