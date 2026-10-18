-- Migration 17: mdn_nearest_customers_v1 — Server-side Haversine RPC
-- Apply via: Supabase Dashboard → SQL Editor → New query → Paste → Run
--
-- PURPOSE:
--   Replaces the 2,000-row client-side download + sort in NewVisitScreen.
--   The DB sorts by Haversine distance and returns only the N nearest rows,
--   eliminating O(N) network bytes and O(N log N) client-side computation.
--
-- CALLER CONTRACT (Supabase JS v2):
--   supabase.rpc('mdn_nearest_customers_v1', {
--     p_lat:   <number>,   -- caller GPS latitude
--     p_lng:   <number>,   -- caller GPS longitude
--     p_limit: <number>,   -- 5 / 10 / 15 / 20  (0 = return all)
--   })
--
-- SECURITY:
--   SECURITY DEFINER to bypass RLS on customers (needed for the aggregate
--   across all supervisors within the tenant), but tenant isolation is
--   enforced manually via auth.uid() → supervisors.company_id lookup.
--   search_path is pinned to prevent search-path injection.
--
-- VERIFY AFTER APPLYING:
--   SELECT routine_name FROM information_schema.routines
--   WHERE routine_schema = 'public'
--     AND routine_name   = 'mdn_nearest_customers_v1';
--   -- must return one row

CREATE OR REPLACE FUNCTION public.mdn_nearest_customers_v1(
  p_lat    DOUBLE PRECISION,
  p_lng    DOUBLE PRECISION,
  p_limit  INT DEFAULT 10
)
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  customer_type   TEXT,
  address         TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  company_id      UUID,
  supervisor_id   UUID,
  is_active       BOOLEAN,
  customer_code   TEXT,
  distance_km     NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    c.id,
    c.name,
    c.customer_type,
    c.address,
    c.latitude,
    c.longitude,
    c.company_id,
    c.supervisor_id,
    c.is_active,
    c.customer_code,
    ROUND(
      (
        2 * 6371 * ASIN(
          SQRT(
            POWER(SIN((RADIANS(c.latitude)  - RADIANS(p_lat))  / 2), 2)
            + COS(RADIANS(p_lat)) * COS(RADIANS(c.latitude))
            * POWER(SIN((RADIANS(c.longitude) - RADIANS(p_lng)) / 2), 2)
          )
        )
      )::NUMERIC,
      2
    ) AS distance_km
  FROM public.customers c
  WHERE
    c.is_active    = TRUE
    AND c.latitude  IS NOT NULL
    AND c.longitude IS NOT NULL
    -- Tenant isolation: caller must be an active supervisor of the company
    AND c.company_id IN (
      SELECT s.company_id
      FROM   public.supervisors s
      WHERE  s.user_id   = auth.uid()
        AND  s.is_active = TRUE
    )
  ORDER BY distance_km ASC
  -- p_limit = 0 means "return all" (maps to JS NearestLimit 'all')
  LIMIT CASE WHEN p_limit <= 0 THEN NULL ELSE p_limit END;
$$;

-- Grant execute to authenticated role only (anon has no access)
GRANT EXECUTE ON FUNCTION public.mdn_nearest_customers_v1(
  DOUBLE PRECISION, DOUBLE PRECISION, INT
) TO authenticated;
