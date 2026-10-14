-- ==============================================================================
-- MYDAN MIGRATION: Fix Admin Prospects & Admin Orders (Fail-Safe Edition)
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run
-- ==============================================================================

-- ── 1. FIELD SURVEYS & PROSPECTS (Fixes /admin/prospects) ────────────────────

-- Ensure table exists
CREATE TABLE IF NOT EXISTS public.field_surveys (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Ensure all columns exist on field_surveys (handles pre-existing tables)
ALTER TABLE public.field_surveys ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.field_surveys ADD COLUMN IF NOT EXISTS supervisor_id UUID;
ALTER TABLE public.field_surveys ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.field_surveys ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.field_surveys ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.field_surveys ADD COLUMN IF NOT EXISTS stores_found INT DEFAULT 0;
ALTER TABLE public.field_surveys ADD COLUMN IF NOT EXISTS ai_raw_result JSONB;
ALTER TABLE public.field_surveys ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Add status and survey_id to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS survey_id UUID;

-- Backfill customers status
UPDATE public.customers SET status = 'active' WHERE status IS NULL;

-- Enable RLS and create policy for field_surveys
ALTER TABLE public.field_surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "field_surveys_tenant" ON public.field_surveys;
CREATE POLICY "field_surveys_tenant" ON public.field_surveys
  FOR ALL TO authenticated
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT company_id FROM public.supervisors
      WHERE user_id = auth.uid() OR id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IS NULL
    OR company_id IN (
      SELECT company_id FROM public.supervisors
      WHERE user_id = auth.uid() OR id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(company_id, status);
CREATE INDEX IF NOT EXISTS idx_field_surveys_company ON public.field_surveys(company_id, created_at DESC);


-- ── 2. ORDERS & OPPORTUNITIES (Fixes /admin/orders) ──────────────────────────

-- Ensure all columns exist on orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_date date DEFAULT CURRENT_DATE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS company_id uuid;

-- Backfill company_id for any existing orders from supervisors table
UPDATE public.orders o
SET company_id = s.company_id
FROM public.supervisors s
WHERE (o.supervisor_id = s.id OR o.supervisor_id = s.user_id) AND o.company_id IS NULL;

-- Make product_id and quantity nullable to allow multi-item catalog orders
ALTER TABLE public.orders ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN quantity DROP NOT NULL;

-- Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_orders_company_status ON public.orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_supervisor ON public.orders(supervisor_id, order_date);
CREATE INDEX IF NOT EXISTS idx_orders_visit ON public.orders(visit_id);

-- Enable RLS and create policy for orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_company_all" ON public.orders;
CREATE POLICY "orders_company_all" ON public.orders
  FOR ALL TO authenticated
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT company_id FROM public.supervisors
      WHERE user_id = auth.uid() OR id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.supervisors
      WHERE (user_id = auth.uid() OR id = auth.uid()) AND role = 'super_admin'
    )
  )
  WITH CHECK (
    company_id IS NULL
    OR company_id IN (
      SELECT company_id FROM public.supervisors
      WHERE user_id = auth.uid() OR id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.supervisors
      WHERE (user_id = auth.uid() OR id = auth.uid()) AND role = 'super_admin'
    )
  );

-- ==============================================================================
-- DONE! All tables updated and secured.
-- ==============================================================================
