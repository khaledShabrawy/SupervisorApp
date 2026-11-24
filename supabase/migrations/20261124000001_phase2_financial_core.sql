-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20261124000001_phase2_financial_core.sql
-- Project: Mydan (ميدان) Phase 2A — Financial & Commercial Module
-- Maps: AR_Order + AR_Invoice + AR_CustTrans + Customer extensions
-- Avoids all known Salesbuzz production bugs:
--   ✅ numeric(28,8) — not nvarchar like Customer.Balance/CreditLimit
--   ✅ is_free_item boolean NOT NULL DEFAULT false — not FreeItem tinyint NULL
--   ✅ is_closed boolean NOT NULL DEFAULT false — not Closed=NULL (crash bug)
--   ✅ company_id RLS — not BUID='1' for all branches
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path = public, pg_temp;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Customer financial extensions  (≈ Customer.CreditLimit, StopOrder, Balance)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_limit     numeric(28,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_days      smallint      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_terms    smallint      NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_blocked       boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_reason     text,
  ADD COLUMN IF NOT EXISTS tax_number       text,
  ADD COLUMN IF NOT EXISTS customer_class   char(1)       DEFAULT 'C',
  ADD COLUMN IF NOT EXISTS d365_account_no  text;

COMMENT ON COLUMN customers.payment_terms IS '1=Cash, 2=Credit, 3=Cheque';
COMMENT ON COLUMN customers.customer_class IS 'A, B, C classification tier';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Product extensions  (≈ HH_Item.SmallUOM/LargeUOM/PLT_CRT + barcode)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS uom_small        text,
  ADD COLUMN IF NOT EXISTS uom_large        text,
  ADD COLUMN IF NOT EXISTS units_per_crt    smallint,
  ADD COLUMN IF NOT EXISTS crt_per_plt      smallint,
  ADD COLUMN IF NOT EXISTS barcode_1        text,
  ADD COLUMN IF NOT EXISTS barcode_2        text,
  ADD COLUMN IF NOT EXISTS list_price       numeric(28,8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_price       numeric(28,8) DEFAULT 0;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Routes  (≈ HH_Route)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES companies(id),
  route_code      text        NOT NULL,
  name_ar         text        NOT NULL,
  name_en         text,
  branch_id       uuid        REFERENCES branches(id),
  channel         text,
  planned_customers int       DEFAULT 0,
  planned_visits  int         DEFAULT 0,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (company_id, route_code)
);

COMMENT ON COLUMN routes.channel IS 'GT / MT / HoReCa / Key Account';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Invoices  (≈ AR_Invoice — 38 cols → distilled to 20 clean cols)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES companies(id),
  invoice_no      text        NOT NULL,
  order_id        uuid        REFERENCES orders(id),
  customer_id     uuid        NOT NULL REFERENCES customers(id),
  supervisor_id   uuid        NOT NULL REFERENCES supervisors(id),
  route_id        uuid        REFERENCES routes(id),
  invoice_type    smallint    NOT NULL DEFAULT 1,
  invoice_date    date        NOT NULL,
  due_date        date        NOT NULL,
  payment_terms   smallint    NOT NULL DEFAULT 1,
  items_total     numeric(28,8) NOT NULL DEFAULT 0,
  discount_total  numeric(28,8) NOT NULL DEFAULT 0,
  promo_total     numeric(28,8) NOT NULL DEFAULT 0,
  tax_total       numeric(28,8) NOT NULL DEFAULT 0,
  net_total       numeric(28,8) GENERATED ALWAYS AS
    (items_total - discount_total - promo_total + tax_total) STORED,
  status          text        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','partial','paid','cancelled')),
  notes           text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (company_id, invoice_no)
);

COMMENT ON COLUMN invoices.invoice_type IS '1=Sale, 2=Return';

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Invoice items  (≈ AR_InvoiceLines — with explicit is_free_item boolean)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES companies(id),
  invoice_id      uuid        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id      uuid        NOT NULL REFERENCES products(id),
  serial_no       int         NOT NULL,
  uom             text        NOT NULL DEFAULT 'قطعة',
  qty             numeric(28,8) NOT NULL CHECK (qty > 0),
  unit_price      numeric(28,8) NOT NULL DEFAULT 0,
  is_free_item    boolean     NOT NULL DEFAULT false,
  line_discount   numeric(28,8) NOT NULL DEFAULT 0,
  line_promo      numeric(28,8) NOT NULL DEFAULT 0,
  line_tax        numeric(28,8) NOT NULL DEFAULT 0,
  line_total      numeric(28,8) GENERATED ALWAYS AS
    (CASE WHEN is_free_item THEN 0
     ELSE qty * unit_price - line_discount - line_promo + line_tax END) STORED,
  line_cost       numeric(28,8) DEFAULT 0,
  batch_no        text,
  expiry_date     date,
  UNIQUE (invoice_id, serial_no)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Customer ledger  (≈ AR_CustTrans — the financial core)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_ledger (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES companies(id),
  customer_id     uuid        NOT NULL REFERENCES customers(id),
  trans_type      smallint    NOT NULL,
  ref_id          text        NOT NULL,
  ref_table       text        NOT NULL,
  amount          numeric(28,8) NOT NULL,
  settled_amount  numeric(28,8) NOT NULL DEFAULT 0
    CHECK (settled_amount >= 0),
  outstanding     numeric(28,8) GENERATED ALWAYS AS
    (amount - settled_amount) STORED,
  trx_date        date        NOT NULL,
  due_date        date,
  supervisor_id   uuid        REFERENCES supervisors(id),
  created_at      timestamptz DEFAULT now()
);

COMMENT ON COLUMN customer_ledger.trans_type IS '0=Opening, 1=Invoice, 2=Payment, 3=CreditNote, 4=DebitNote, 5=Adjustment';
COMMENT ON COLUMN customer_ledger.ref_table IS 'invoices / collections';

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Collections  (≈ AR_OrderPayments + AR_CustTrans TransType=2)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collections (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES companies(id),
  collection_no   text        NOT NULL,
  invoice_id      uuid        REFERENCES invoices(id),
  customer_id     uuid        NOT NULL REFERENCES customers(id),
  supervisor_id   uuid        NOT NULL REFERENCES supervisors(id),
  payment_type    smallint    NOT NULL,
  amount          numeric(28,8) NOT NULL CHECK (amount > 0),
  cheque_no       text,
  cheque_bank     text,
  cheque_date     date,
  collection_date date        NOT NULL DEFAULT CURRENT_DATE,
  status          text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','bounced','cancelled')),
  notes           text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (company_id, collection_no)
);

COMMENT ON COLUMN collections.payment_type IS '1=Cash, 2=Cheque, 3=Transfer';

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Ledger settlements  (≈ HH_AR_TransactionLinks — Closed=NULL bug avoided)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_settlements (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES companies(id),
  source_type     smallint    NOT NULL,
  source_id       uuid        NOT NULL,
  target_type     smallint    NOT NULL,
  target_id       uuid        NOT NULL,
  settled_amount  numeric(28,8) NOT NULL CHECK (settled_amount > 0),
  settled_at      timestamptz DEFAULT now(),
  supervisor_id   uuid        REFERENCES supervisors(id),
  is_closed       boolean     NOT NULL DEFAULT false
);

COMMENT ON COLUMN ledger_settlements.source_type IS '1=Invoice, 4=DebitNote';
COMMENT ON COLUMN ledger_settlements.target_type IS '2=Payment, 3=CreditNote';
COMMENT ON COLUMN ledger_settlements.is_closed IS 'NOT NULL DEFAULT false — avoids HH_AR_TransactionLinks Closed=NULL crash bug';

-- ───────────────────────────────────────────────────────────────────────────
-- 9. Analytics views — Power BI / Fabric ready
-- ───────────────────────────────────────────────────────────────────────────

-- Customer aging  (≈ AR_CustTrans aging query)
CREATE OR REPLACE VIEW vw_customer_aging
WITH (security_invoker = true)
AS
SELECT
  cl.id,
  cl.company_id,
  cl.customer_id,
  c.name                                              AS customer_name,
  c.customer_class,
  c.credit_limit,
  cl.trans_type,
  cl.ref_id,
  cl.amount,
  cl.outstanding,
  cl.due_date,
  CURRENT_DATE - cl.due_date                          AS aging_days,
  CASE
    WHEN cl.due_date IS NULL
      OR CURRENT_DATE <= cl.due_date                  THEN 'جاري'
    WHEN CURRENT_DATE - cl.due_date <= 30             THEN '1-30 يوم'
    WHEN CURRENT_DATE - cl.due_date <= 60             THEN '31-60 يوم'
    WHEN CURRENT_DATE - cl.due_date <= 90             THEN '61-90 يوم'
    ELSE                                                   '90+ يوم'
  END                                                 AS aging_bucket,
  cl.supervisor_id,
  s.full_name                                         AS supervisor_name,
  s.supervisor_code,
  b.name                                              AS branch_name
FROM customer_ledger cl
JOIN customers       c  ON cl.customer_id   = c.id
JOIN supervisors     s  ON cl.supervisor_id = s.id
LEFT JOIN branches   b  ON s.branch_id      = b.id
WHERE cl.outstanding > 0.001
  AND cl.trans_type IN (1, 4);

-- Rep performance  (≈ BI_DW_Customers fast path)
CREATE OR REPLACE VIEW vw_rep_performance
WITH (security_invoker = true)
AS
SELECT
  s.id                                                AS supervisor_id,
  s.full_name,
  s.supervisor_code,
  b.name                                              AS branch_name,
  DATE_TRUNC('month', v.visit_date)                   AS month,
  COUNT(v.id)                                         AS actual_visits,
  COUNT(bp.id)                                        AS planned_visits,
  COUNT(CASE WHEN v.visit_outcome = 'متعامل' THEN 1 END) AS positive_visits,
  ROUND(COUNT(v.id)::numeric /
    NULLIF(COUNT(bp.id), 0) * 100, 2)                AS coverage_pct,
  ROUND(COUNT(CASE WHEN v.visit_outcome='متعامل' THEN 1 END)::numeric /
    NULLIF(COUNT(v.id), 0) * 100, 2)                 AS strike_rate_pct,
  SUM(i.net_total)                                    AS net_sales,
  ROUND(SUM(i.net_total) /
    NULLIF(COUNT(CASE WHEN v.visit_outcome='متعامل' THEN 1 END), 0), 2) AS drop_size
FROM supervisors  s
JOIN branches     b  ON s.branch_id  = b.id
LEFT JOIN visits  v  ON v.supervisor_id = s.id
LEFT JOIN beat_plans bp ON bp.supervisor_id = s.id
  AND bp.plan_date = v.visit_date
LEFT JOIN invoices i ON i.supervisor_id = s.id
  AND DATE_TRUNC('month', i.invoice_date) = DATE_TRUNC('month', v.visit_date)
  AND i.invoice_type = 1
  AND i.status != 'cancelled'
WHERE s.is_active = true
GROUP BY s.id, s.full_name, s.supervisor_code, b.name,
         DATE_TRUNC('month', v.visit_date);

-- ───────────────────────────────────────────────────────────────────────────
-- 10. Row Level Security
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE routes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_ledger  ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_settlements ENABLE ROW LEVEL SECURITY;

-- Routes RLS
DROP POLICY IF EXISTS "tenant_isolation" ON routes;
CREATE POLICY "tenant_isolation" ON routes
  USING (company_id = (
    SELECT company_id FROM supervisors WHERE user_id = auth.uid() LIMIT 1
  ));

-- Invoices RLS
DROP POLICY IF EXISTS "tenant_isolation" ON invoices;
CREATE POLICY "tenant_isolation" ON invoices
  USING (company_id = (
    SELECT company_id FROM supervisors WHERE user_id = auth.uid() LIMIT 1
  ));

-- Invoice items RLS (via invoice)
DROP POLICY IF EXISTS "tenant_isolation" ON invoice_items;
CREATE POLICY "tenant_isolation" ON invoice_items
  USING (company_id = (
    SELECT company_id FROM supervisors WHERE user_id = auth.uid() LIMIT 1
  ));

-- Customer ledger RLS
DROP POLICY IF EXISTS "tenant_isolation" ON customer_ledger;
CREATE POLICY "tenant_isolation" ON customer_ledger
  USING (company_id = (
    SELECT company_id FROM supervisors WHERE user_id = auth.uid() LIMIT 1
  ));

-- Collections RLS
DROP POLICY IF EXISTS "tenant_isolation" ON collections;
CREATE POLICY "tenant_isolation" ON collections
  USING (company_id = (
    SELECT company_id FROM supervisors WHERE user_id = auth.uid() LIMIT 1
  ));

-- Ledger settlements RLS
DROP POLICY IF EXISTS "tenant_isolation" ON ledger_settlements;
CREATE POLICY "tenant_isolation" ON ledger_settlements
  USING (company_id = (
    SELECT company_id FROM supervisors WHERE user_id = auth.uid() LIMIT 1
  ));

-- ───────────────────────────────────────────────────────────────────────────
-- 11. Indexes
-- ───────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_company_date    ON invoices(company_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer        ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_supervisor      ON invoices(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice    ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ledger_customer          ON customer_ledger(customer_id, company_id);
CREATE INDEX IF NOT EXISTS idx_ledger_outstanding       ON customer_ledger(company_id)
  WHERE outstanding > 0.001;
CREATE INDEX IF NOT EXISTS idx_collections_date         ON collections(company_id, collection_date);
CREATE INDEX IF NOT EXISTS idx_collections_customer     ON collections(customer_id);
CREATE INDEX IF NOT EXISTS idx_routes_company           ON routes(company_id);
