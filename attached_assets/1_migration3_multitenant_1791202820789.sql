-- ============================================================
-- MYDAN Migration 3 — Multi-tenant + Dynamic Branding
-- Makes the product company-agnostic & sellable as SaaS/License
-- Run in: Supabase Dashboard → SQL Editor
-- Project: ywdlrrdkjbtpfgacuuoy
-- ============================================================

-- ── 1. COMPANIES (Master tenant table) ───────────────────────
-- Every client who buys a license gets one row here.
-- The Admin Panel lets you create/manage companies.
CREATE TABLE IF NOT EXISTS companies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,              -- "كورونا للشوكولاتة"
  name_en          TEXT,                       -- "Corona Chocolate"
  logo_url         TEXT,                       -- uploaded to storage
  primary_color    TEXT DEFAULT '#1A56DB',     -- brand color hex
  secondary_color  TEXT DEFAULT '#108981',
  industry         TEXT DEFAULT 'FMCG',        -- FMCG / Pharma / Dairy
  country          TEXT DEFAULT 'EG',
  city             TEXT,
  contact_email    TEXT,
  contact_phone    TEXT,
  license_key      TEXT UNIQUE,                -- sent to client on purchase
  license_type     TEXT DEFAULT 'standard'
                     CHECK (license_type IN ('standard','pro','enterprise')),
  max_supervisors  INTEGER DEFAULT 50,         -- license limit
  is_active        BOOLEAN DEFAULT true,
  activated_at     TIMESTAMP WITH TIME ZONE,
  expires_at       TIMESTAMP WITH TIME ZONE,   -- NULL = perpetual
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
-- Super admin (platform owner = you) sees all
-- Company admin sees only their own company
DROP POLICY IF EXISTS "companies_super_admin" ON companies;
DROP POLICY IF EXISTS "companies_own"         ON companies;
CREATE POLICY "companies_super_admin" ON companies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM supervisors s
      WHERE s.user_id = auth.uid() AND s.role = 'super_admin'
    )
  );
CREATE POLICY "companies_own" ON companies
  FOR SELECT USING (
    id IN (
      SELECT company_id FROM supervisors
      WHERE user_id = auth.uid()
    )
  );

-- ── 2. APP SETTINGS (Dynamic branding per company) ───────────
-- Stores all configurable UI/UX values per company.
-- Frontend reads this on login and applies dynamically.
CREATE TABLE IF NOT EXISTS app_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  app_name            TEXT DEFAULT 'ميدان',       -- shown in header
  app_name_en         TEXT DEFAULT 'Mydan',
  app_tagline         TEXT DEFAULT 'نظام إدارة المشرفين الميدانيين',
  logo_url            TEXT,                        -- app logo
  favicon_url         TEXT,
  primary_color       TEXT DEFAULT '#1A56DB',
  success_color       TEXT DEFAULT '#108981',
  danger_color        TEXT DEFAULT '#EF4444',
  background_color    TEXT DEFAULT '#F8FAFC',
  geofence_radius_m   INTEGER DEFAULT 500,         -- meters
  visit_types         TEXT[] DEFAULT ARRAY[        -- customer types
    'بقالة','سوبر ماركت','هايبر ماركت','ميني ماركت','كافيه','مطعم','أخرى'
  ],
  target_brand_name   TEXT DEFAULT 'العلامة التجارية',  -- used in AI prompt
  competitor_brands   TEXT[],                      -- fed to AI vision
  ai_audit_enabled    BOOLEAN DEFAULT true,
  whatsapp_number     TEXT,                        -- support number
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_settings_read"  ON app_settings;
DROP POLICY IF EXISTS "app_settings_admin" ON app_settings;
CREATE POLICY "app_settings_read" ON app_settings
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM supervisors WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "app_settings_admin" ON app_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM supervisors s
      WHERE s.user_id = auth.uid()
        AND s.role IN ('admin','super_admin')
        AND s.company_id = app_settings.company_id
    )
  );

-- ── 3. ADD company_id TO ALL EXISTING TABLES ─────────────────
-- This is the core of multi-tenancy.
-- Every row in every table belongs to exactly one company.

ALTER TABLE supervisors        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE branches           ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE customers          ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE products           ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE visits             ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE shelf_audit        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE competitor_products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE orders             ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE targets            ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE planograms         ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE notifications      ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE price_list         ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE visit_tasks        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE attendance         ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE beat_plans         ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE surveys            ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE survey_responses   ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE audit_logs         ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE supervisor_permissions ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- ── 4. UPDATE RLS POLICIES — Add company_id isolation ────────
-- Pattern: a supervisor can only see data from their own company.

-- SUPERVISORS
DROP POLICY IF EXISTS "supervisors_own" ON supervisors;
CREATE POLICY "supervisors_own" ON supervisors
  FOR ALL USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM supervisors s
      WHERE s.user_id = auth.uid()
        AND s.role IN ('admin','super_admin')
        AND (s.company_id = supervisors.company_id OR s.role = 'super_admin')
    )
  );

-- CUSTOMERS
DROP POLICY IF EXISTS "customers_read"   ON customers;
DROP POLICY IF EXISTS "customers_insert" ON customers;
DROP POLICY IF EXISTS "customers_update" ON customers;
CREATE POLICY "customers_read" ON customers FOR SELECT USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);
CREATE POLICY "customers_insert" ON customers FOR INSERT WITH CHECK (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);
CREATE POLICY "customers_update" ON customers FOR UPDATE USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);

-- PRODUCTS
DROP POLICY IF EXISTS "products_read" ON products;
CREATE POLICY "products_read" ON products FOR SELECT USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
  OR company_id IS NULL  -- shared/global products
);

-- VISITS
DROP POLICY IF EXISTS "visits_own" ON visits;
CREATE POLICY "visits_own" ON visits FOR ALL USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
  AND (
    supervisor_id IN (SELECT id FROM supervisors WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM supervisors s
      WHERE s.user_id = auth.uid()
        AND s.role IN ('admin','branch_manager','super_admin')
    )
  )
);

-- SHELF AUDIT
DROP POLICY IF EXISTS "shelf_audit_own" ON shelf_audit;
CREATE POLICY "shelf_audit_own" ON shelf_audit FOR ALL USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);

-- ORDERS
DROP POLICY IF EXISTS "orders_own" ON orders;
CREATE POLICY "orders_own" ON orders FOR ALL USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);

-- TARGETS
DROP POLICY IF EXISTS "targets_own" ON targets;
CREATE POLICY "targets_own" ON targets FOR ALL USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);

-- NOTIFICATIONS
DROP POLICY IF EXISTS "notifications_own" ON notifications;
CREATE POLICY "notifications_own" ON notifications FOR ALL USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);

-- BRANCHES
DROP POLICY IF EXISTS "branches_read"  ON branches;
DROP POLICY IF EXISTS "branches_admin" ON branches;
CREATE POLICY "branches_read" ON branches FOR SELECT USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);
CREATE POLICY "branches_admin" ON branches FOR ALL USING (
  EXISTS (
    SELECT 1 FROM supervisors s
    WHERE s.user_id = auth.uid()
      AND s.role IN ('admin','super_admin')
      AND s.company_id = branches.company_id
  )
);

-- PRICE LIST
DROP POLICY IF EXISTS "price_list_read"  ON price_list;
DROP POLICY IF EXISTS "price_list_admin" ON price_list;
CREATE POLICY "price_list_read" ON price_list FOR SELECT USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);
CREATE POLICY "price_list_admin" ON price_list FOR ALL USING (
  EXISTS (
    SELECT 1 FROM supervisors s
    WHERE s.user_id = auth.uid()
      AND s.role IN ('admin','super_admin')
  )
);

-- VISIT TASKS
DROP POLICY IF EXISTS "visit_tasks_own" ON visit_tasks;
CREATE POLICY "visit_tasks_own" ON visit_tasks FOR ALL USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);

-- ATTENDANCE
DROP POLICY IF EXISTS "attendance_own" ON attendance;
CREATE POLICY "attendance_own" ON attendance FOR ALL USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);

-- BEAT PLANS
DROP POLICY IF EXISTS "beat_plans_own" ON beat_plans;
CREATE POLICY "beat_plans_own" ON beat_plans FOR ALL USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);

-- SURVEYS
DROP POLICY IF EXISTS "surveys_read"  ON surveys;
DROP POLICY IF EXISTS "surveys_admin" ON surveys;
CREATE POLICY "surveys_read" ON surveys FOR SELECT USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);

-- SURVEY RESPONSES
DROP POLICY IF EXISTS "survey_responses_own" ON survey_responses;
CREATE POLICY "survey_responses_own" ON survey_responses FOR ALL USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);

-- PLANOGRAMS
DROP POLICY IF EXISTS "planograms_read" ON planograms;
CREATE POLICY "planograms_read" ON planograms FOR SELECT USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
  OR company_id IS NULL
);

-- SUPERVISOR PERMISSIONS
DROP POLICY IF EXISTS "permissions_own" ON supervisor_permissions;
CREATE POLICY "permissions_own" ON supervisor_permissions FOR ALL USING (
  company_id IN (SELECT company_id FROM supervisors WHERE user_id = auth.uid())
);

-- AUDIT LOGS
DROP POLICY IF EXISTS "audit_logs_admin" ON audit_logs;
CREATE POLICY "audit_logs_admin" ON audit_logs FOR ALL USING (
  EXISTS (
    SELECT 1 FROM supervisors s
    WHERE s.user_id = auth.uid()
      AND s.role IN ('admin','super_admin')
      AND s.company_id = audit_logs.company_id
  )
);

-- ── 5. ADD super_admin ROLE TO SUPERVISORS ───────────────────
-- super_admin = you (Khaled) — sees all companies
ALTER TABLE supervisors DROP CONSTRAINT IF EXISTS supervisors_role_check;
ALTER TABLE supervisors ADD CONSTRAINT supervisors_role_check
  CHECK (role IN ('supervisor','senior_supervisor','branch_manager','admin','super_admin'));

-- ── 6. INDEXES for company_id (performance) ──────────────────
CREATE INDEX IF NOT EXISTS idx_supervisors_company     ON supervisors(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_company       ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_visits_company          ON visits(company_id);
CREATE INDEX IF NOT EXISTS idx_shelf_audit_company     ON shelf_audit(company_id);
CREATE INDEX IF NOT EXISTS idx_orders_company          ON orders(company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_company   ON notifications(company_id);

-- ── 7. STORAGE BUCKET for logos ──────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-assets',
  'company-assets',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg','image/png','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "company_assets_upload" ON storage.objects;
DROP POLICY IF EXISTS "company_assets_read"   ON storage.objects;
CREATE POLICY "company_assets_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'company-assets' AND auth.role() = 'authenticated'
  );
CREATE POLICY "company_assets_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'company-assets');

-- ── 8. UPDATE Power BI VIEWS — add company filter ────────────
CREATE OR REPLACE VIEW vw_daily_kpi_supervisor AS
SELECT
  s.id                AS supervisor_id,
  s.full_name,
  s.branch,
  s.company_id,
  co.name             AS company_name,
  DATE(v.visit_date)  AS visit_date,
  COUNT(v.id)         AS total_visits,
  COUNT(CASE WHEN v.visit_outcome = 'متعامل'     THEN 1 END) AS dealt_visits,
  COUNT(CASE WHEN v.visit_outcome = 'غير متعامل' THEN 1 END) AS not_dealt_visits,
  COUNT(CASE WHEN v.visit_outcome = 'غير موجود'  THEN 1 END) AS absent_visits,
  COUNT(CASE WHEN v.on_beat = false               THEN 1 END) AS oor_visits,
  ROUND(
    COUNT(CASE WHEN v.visit_outcome = 'متعامل' THEN 1 END)::numeric
    / NULLIF(COUNT(v.id), 0) * 100, 1
  ) AS strike_rate_pct,
  ROUND(AVG(sa.audit_score)::numeric, 1) AS avg_pss_score
FROM supervisors s
JOIN companies co ON co.id = s.company_id
LEFT JOIN visits v       ON v.supervisor_id = s.id
LEFT JOIN shelf_audit sa ON sa.visit_id     = v.id
WHERE s.is_active = true
GROUP BY s.id, s.full_name, s.branch, s.company_id, co.name, DATE(v.visit_date);

CREATE OR REPLACE VIEW vw_perfect_store_index AS
SELECT
  s.full_name  AS supervisor_name,
  s.branch,
  s.company_id,
  co.name      AS company_name,
  COUNT(sa.id) AS total_audits,
  ROUND(AVG(sa.audit_score)::numeric, 1) AS avg_pss_score,
  ROUND(AVG(
    (sa.ai_detailed_report->'target_brand_metrics'->>'share_of_shelf_percentage')::numeric
  ), 1) AS avg_share_of_shelf_pct,
  COUNT(CASE WHEN
    (sa.ai_detailed_report->'competitor_metrics'->>'competitor_presence_detected')::boolean = true
  THEN 1 END) AS audits_with_competitors
FROM shelf_audit sa
JOIN visits      v  ON sa.visit_id     = v.id
JOIN supervisors s  ON v.supervisor_id = s.id
JOIN companies   co ON co.id           = s.company_id
WHERE sa.ai_detailed_report IS NOT NULL
GROUP BY s.full_name, s.branch, s.company_id, co.name;

CREATE OR REPLACE VIEW vw_branch_performance AS
SELECT
  co.name                          AS company_name,
  COALESCE(s.branch, 'غير محدد')  AS branch,
  s.company_id,
  COUNT(DISTINCT s.id)             AS supervisor_count,
  COUNT(v.id)                      AS total_visits,
  COUNT(CASE WHEN v.visit_outcome = 'متعامل' THEN 1 END) AS dealt_visits,
  COUNT(CASE WHEN v.on_beat = false           THEN 1 END) AS oor_visits,
  COUNT(o.id)                      AS total_orders,
  ROUND(
    COUNT(CASE WHEN v.visit_outcome = 'متعامل' THEN 1 END)::numeric
    / NULLIF(COUNT(v.id), 0) * 100, 1
  ) AS strike_rate_pct
FROM supervisors s
JOIN companies co ON co.id = s.company_id
LEFT JOIN visits v ON v.supervisor_id = s.id
LEFT JOIN orders o ON o.supervisor_id = s.id
WHERE s.is_active = true
GROUP BY co.name, s.branch, s.company_id;

CREATE OR REPLACE VIEW vw_competitor_heatmap AS
SELECT
  s.company_id,
  co.name        AS company_name,
  cp.brand_name  AS competitor,
  COUNT(cp.id)   AS total_appearances,
  COUNT(DISTINCT v.customer_id) AS unique_outlets,
  c.branch
FROM competitor_products cp
JOIN visits      v  ON cp.visit_id   = v.id
JOIN customers   c  ON v.customer_id = c.id
JOIN supervisors s  ON v.supervisor_id = s.id
JOIN companies   co ON co.id = s.company_id
GROUP BY s.company_id, co.name, cp.brand_name, c.branch
ORDER BY total_appearances DESC;

CREATE OR REPLACE VIEW vw_oor_analysis AS
SELECT
  s.company_id,
  co.name      AS company_name,
  s.full_name  AS supervisor_name,
  s.branch,
  COUNT(v.id)  AS total_visits,
  COUNT(CASE WHEN v.on_beat = false THEN 1 END) AS oor_count,
  ROUND(
    COUNT(CASE WHEN v.on_beat = false THEN 1 END)::numeric
    / NULLIF(COUNT(v.id), 0) * 100, 1
  ) AS oor_pct,
  ROUND(
    AVG(CASE WHEN v.on_beat = false THEN v.geo_distance END)::numeric, 0
  ) AS avg_oor_distance_m
FROM supervisors s
JOIN companies co ON co.id = s.company_id
LEFT JOIN visits v ON v.supervisor_id = s.id
WHERE s.is_active = true
GROUP BY s.company_id, co.name, s.full_name, s.branch
ORDER BY oor_pct DESC;

-- ── 9. SEED: Demo Company (for testing) ──────────────────────
INSERT INTO companies (
  id, name, name_en, primary_color, industry,
  country, city, license_type, max_supervisors, is_active
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'شركة العرض التجريبي',
  'Demo Company',
  '#1A56DB',
  'FMCG',
  'EG', 'Cairo',
  'pro', 100, true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO app_settings (
  company_id, app_name, app_name_en, app_tagline,
  primary_color, geofence_radius_m,
  target_brand_name, ai_audit_enabled
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'ميدان', 'Mydan',
  'نظام إدارة المشرفين الميدانيين',
  '#1A56DB', 500,
  'العلامة التجارية', true
) ON CONFLICT (company_id) DO NOTHING;

-- ── VERIFY ────────────────────────────────────────────────────
SELECT
  t.table_name,
  (SELECT COUNT(*) FROM information_schema.columns c
   WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
-- Expected: 21 rows (19 existing + companies + app_settings)
