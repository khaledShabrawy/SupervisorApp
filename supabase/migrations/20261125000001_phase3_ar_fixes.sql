-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20261125000001_phase3_ar_fixes.sql
-- Fixes 3 issues found in Phase 3.2 code review:
--   1. vw_rep_performance cross-join (coverage always 100%) — fix with CTEs
--   2. Non-atomic collection+ledger inserts — add create_collection_with_ledger RPC
--   3. AR ageing totals capped at 500 rows — add get_ar_ageing_summary RPC
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path = public, pg_temp;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Fix vw_rep_performance — replace cross-join with pre-aggregated CTEs
--    Original bug: beat_plans joined visit rows 1:N producing inflated counts
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_rep_performance
WITH (security_invoker = true)
AS
WITH monthly_visits AS (
  SELECT
    supervisor_id,
    DATE_TRUNC('month', visit_date)                                    AS month,
    COUNT(*)                                                           AS actual_visits,
    COUNT(CASE WHEN visit_outcome = 'متعامل' THEN 1 END)              AS positive_visits
  FROM visits
  WHERE supervisor_id IS NOT NULL
  GROUP BY supervisor_id, DATE_TRUNC('month', visit_date)
),
monthly_plans AS (
  SELECT
    supervisor_id,
    DATE_TRUNC('month', plan_date)  AS month,
    COUNT(*)                        AS planned_visits
  FROM beat_plans
  GROUP BY supervisor_id, DATE_TRUNC('month', plan_date)
),
monthly_sales AS (
  SELECT
    supervisor_id,
    DATE_TRUNC('month', invoice_date)  AS month,
    SUM(net_total)                     AS net_sales
  FROM invoices
  WHERE invoice_type = 1
    AND status != 'cancelled'
  GROUP BY supervisor_id, DATE_TRUNC('month', invoice_date)
)
SELECT
  s.id                                                                AS supervisor_id,
  s.full_name,
  s.supervisor_code,
  b.name                                                              AS branch_name,
  mv.month,
  mv.actual_visits,
  COALESCE(mp.planned_visits, 0)                                      AS planned_visits,
  mv.positive_visits,
  ROUND(
    mv.actual_visits::numeric / NULLIF(COALESCE(mp.planned_visits, 0), 0) * 100, 2
  )                                                                   AS coverage_pct,
  ROUND(
    mv.positive_visits::numeric / NULLIF(mv.actual_visits, 0) * 100, 2
  )                                                                   AS strike_rate_pct,
  COALESCE(ms.net_sales, 0)                                           AS net_sales,
  ROUND(
    COALESCE(ms.net_sales, 0) / NULLIF(mv.positive_visits, 0), 2
  )                                                                   AS drop_size
FROM supervisors          s
JOIN branches             b  ON s.branch_id  = b.id
LEFT JOIN monthly_visits  mv ON mv.supervisor_id = s.id
LEFT JOIN monthly_plans   mp ON mp.supervisor_id = s.id AND mp.month = mv.month
LEFT JOIN monthly_sales   ms ON ms.supervisor_id = s.id AND ms.month = mv.month
WHERE s.is_active = true;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Atomic create_collection_with_ledger
--    Both inserts in one Postgres transaction — prevents orphan collection rows
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_collection_with_ledger(
  p_collection_no   text,
  p_invoice_id      uuid    DEFAULT NULL,
  p_customer_id     uuid,
  p_supervisor_id   uuid,
  p_payment_type    smallint,
  p_amount          numeric,
  p_cheque_no       text    DEFAULT NULL,
  p_cheque_bank     text    DEFAULT NULL,
  p_cheque_date     date    DEFAULT NULL,
  p_collection_date date    DEFAULT CURRENT_DATE,
  p_notes           text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_coll_id    uuid;
BEGIN
  -- Resolve company_id from the calling user's supervisor record
  SELECT company_id INTO v_company_id
  FROM supervisors
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'غير مصرح لك بهذه العملية';
  END IF;

  -- Insert into collections
  INSERT INTO collections (
    company_id, collection_no, invoice_id, customer_id, supervisor_id,
    payment_type, amount, cheque_no, cheque_bank, cheque_date,
    collection_date, status, notes
  ) VALUES (
    v_company_id, p_collection_no, p_invoice_id, p_customer_id, p_supervisor_id,
    p_payment_type, p_amount, p_cheque_no, p_cheque_bank, p_cheque_date,
    p_collection_date, 'pending', p_notes
  )
  RETURNING id INTO v_coll_id;

  -- Insert matching payment entry in customer_ledger (trans_type=2 → Payment)
  INSERT INTO customer_ledger (
    company_id, customer_id, trans_type, ref_id, ref_table,
    amount, settled_amount, trx_date, due_date, supervisor_id
  ) VALUES (
    v_company_id, p_customer_id, 2, v_coll_id::text, 'collections',
    p_amount, 0, p_collection_date, NULL, p_supervisor_id
  );

  RETURN v_coll_id;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. get_ar_ageing_summary — server-side aggregation across ALL rows (not ≤500)
--    Fixes the grand-total undercount when outstanding > 500 ledger entries
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_ar_ageing_summary(
  p_supervisor_id uuid    DEFAULT NULL,
  p_branch_name   text    DEFAULT NULL
)
RETURNS TABLE(aging_bucket text, record_count bigint, total_outstanding numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    aging_bucket,
    COUNT(*)           AS record_count,
    SUM(outstanding)   AS total_outstanding
  FROM vw_customer_aging
  WHERE company_id = (
    SELECT company_id FROM supervisors WHERE user_id = auth.uid() LIMIT 1
  )
    AND (p_supervisor_id IS NULL OR supervisor_id = p_supervisor_id)
    AND (p_branch_name   IS NULL OR branch_name   = p_branch_name)
  GROUP BY aging_bucket;
$$;
