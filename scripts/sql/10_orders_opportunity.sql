-- ============================================================
-- MYDAN Migration 10 — Sales Opportunity & Order Delivery Tracking
-- Enables capture of sales leads during visits and delivery confirmation
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Ensure columns exist on orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_date date DEFAULT CURRENT_DATE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- If product_id was not nullable in original schema, make it nullable so multi-item orders are supported
ALTER TABLE public.orders ALTER COLUMN product_id DROP NOT NULL;

-- 2. Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_orders_company_status ON public.orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_supervisor ON public.orders(supervisor_id, order_date);
CREATE INDEX IF NOT EXISTS idx_orders_visit ON public.orders(visit_id);

-- 3. Row Level Security Policies
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
