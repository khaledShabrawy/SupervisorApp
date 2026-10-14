-- ==============================================================================
-- MYDAN MIGRATION: Fix Admin Prospects & Admin Orders
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run
-- ==============================================================================

-- 1. PROSPECTS & FIELD SURVEYS (Fixes /admin/prospects)
CREATE TABLE IF NOT EXISTS public.field_surveys (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID          NOT NULL REFERENCES public.companies(id)    ON DELETE CASCADE,
  supervisor_id UUID          NOT NULL REFERENCES public.supervisors(id)  ON DELETE CASCADE,
  photo_url     TEXT,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  stores_found  INT           NOT NULL DEFAULT 0,
  ai_raw_result JSONB,
  status        TEXT          NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','processing','completed','failed')),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS
  status TEXT DEFAULT 'active' CHECK (status IN ('active','prospect','rejected'));

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS
  survey_id UUID REFERENCES public.field_surveys(id) ON DELETE SET NULL;

UPDATE public.customers SET status = 'active' WHERE status IS NULL;

ALTER TABLE public.field_surveys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'field_surveys' AND policyname = 'field_surveys_tenant'
  ) THEN
    CREATE POLICY "field_surveys_tenant" ON public.field_surveys
      FOR ALL TO authenticated
      USING (company_id IN (SELECT company_id FROM public.supervisors WHERE user_id = auth.uid() AND is_active = true))
      WITH CHECK (company_id IN (SELECT company_id FROM public.supervisors WHERE user_id = auth.uid() AND is_active = true));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(company_id, status);
CREATE INDEX IF NOT EXISTS idx_field_surveys_company ON public.field_surveys(company_id, created_at DESC);


-- 2. ORDERS & OPPORTUNITIES (Fixes /admin/orders)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_date date DEFAULT CURRENT_DATE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill company_id for any existing orders from supervisors table
UPDATE public.orders o
SET company_id = s.company_id
FROM public.supervisors s
WHERE o.supervisor_id = s.id AND o.company_id IS NULL;

-- Make product_id and quantity nullable to allow multi-item catalog orders
ALTER TABLE public.orders ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN quantity DROP NOT NULL;

-- Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_orders_company_status ON public.orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_supervisor ON public.orders(supervisor_id, order_date);
CREATE INDEX IF NOT EXISTS idx_orders_visit ON public.orders(visit_id);

-- Row Level Security on orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_company_all" ON public.orders;
CREATE POLICY "orders_company_all" ON public.orders
  FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.supervisors WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.supervisors WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.supervisors WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.supervisors WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- ==============================================================================
-- Completed successfully!
-- ==============================================================================
