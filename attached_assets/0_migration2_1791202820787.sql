-- ============================================================
-- MYDAN Migration 2 — 9 New Tables + 5 Power BI Views
-- Project: ywdlrrdkjbtpfgacuuoy
-- Paste ALL in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ── 1. BRANCHES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  region      TEXT,
  manager_id  UUID REFERENCES supervisors(id),
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "branches_read"  ON branches;
DROP POLICY IF EXISTS "branches_admin" ON branches;
CREATE POLICY "branches_read" ON branches
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "branches_admin" ON branches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM supervisors s WHERE s.user_id = auth.uid() AND s.role = 'admin')
  );

-- Add branch_id FK to supervisors
ALTER TABLE supervisors ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ── 2. NOTIFICATIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id UUID REFERENCES supervisors(id) ON DELETE CASCADE,
  type          TEXT CHECK (type IN ('ai_result','target_alert','admin_message','system')),
  title_ar      TEXT NOT NULL,
  body_ar       TEXT NOT NULL,
  is_read       BOOLEAN DEFAULT false,
  action_url    TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_own" ON notifications;
CREATE POLICY "notifications_own" ON notifications
  FOR ALL USING (
    supervisor_id IN (SELECT id FROM supervisors WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM supervisors s WHERE s.user_id = auth.uid() AND s.role = 'admin')
  );
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ── 3. PRICE LIST ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_list (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID REFERENCES products(id) ON DELETE CASCADE,
  customer_type TEXT,
  unit_price    DECIMAL(10,2) NOT NULL,
  min_quantity  INTEGER DEFAULT 1,
  valid_from    DATE DEFAULT CURRENT_DATE,
  valid_to      DATE,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE price_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "price_list_read"  ON price_list;
DROP POLICY IF EXISTS "price_list_admin" ON price_list;
CREATE POLICY "price_list_read" ON price_list
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "price_list_admin" ON price_list
  FOR ALL USING (
    EXISTS (SELECT 1 FROM supervisors s WHERE s.user_id = auth.uid() AND s.role = 'admin')
  );

-- ── 4. VISIT TASKS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visit_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id     UUID REFERENCES visits(id) ON DELETE CASCADE,
  task_type    TEXT CHECK (task_type IN ('shelf_audit','competitor_check','order','survey','other')),
  title_ar     TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  is_mandatory BOOLEAN DEFAULT false,
  order_num    INTEGER DEFAULT 0,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE visit_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "visit_tasks_own" ON visit_tasks;
CREATE POLICY "visit_tasks_own" ON visit_tasks
  FOR ALL USING (
    visit_id IN (
      SELECT v.id FROM visits v
      JOIN supervisors s ON s.id = v.supervisor_id
      WHERE s.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM supervisors s
      WHERE s.user_id = auth.uid() AND s.role IN ('admin','branch_manager')
    )
  );

-- ── 5. ATTENDANCE ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id   UUID REFERENCES supervisors(id) ON DELETE CASCADE,
  attendance_date DATE DEFAULT CURRENT_DATE,
  check_in_time   TIMESTAMP WITH TIME ZONE,
  check_out_time  TIMESTAMP WITH TIME ZONE,
  check_in_lat    DOUBLE PRECISION,
  check_in_lng    DOUBLE PRECISION,
  selfie_url      TEXT,
  notes           TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(supervisor_id, attendance_date)
);
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_own" ON attendance;
CREATE POLICY "attendance_own" ON attendance
  FOR ALL USING (
    supervisor_id IN (SELECT id FROM supervisors WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM supervisors s
      WHERE s.user_id = auth.uid() AND s.role IN ('admin','branch_manager')
    )
  );

-- ── 6. BEAT PLANS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beat_plans (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id        UUID REFERENCES supervisors(id) ON DELETE CASCADE,
  plan_date            DATE NOT NULL,
  customer_ids_ordered UUID[] NOT NULL DEFAULT '{}',
  total_distance_km    DECIMAL(8,2),
  status               TEXT DEFAULT 'draft'
                         CHECK (status IN ('draft','active','completed')),
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(supervisor_id, plan_date)
);
ALTER TABLE beat_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "beat_plans_own" ON beat_plans;
CREATE POLICY "beat_plans_own" ON beat_plans
  FOR ALL USING (
    supervisor_id IN (SELECT id FROM supervisors WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM supervisors s
      WHERE s.user_id = auth.uid() AND s.role IN ('admin','branch_manager')
    )
  );

-- ── 7. SURVEYS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS surveys (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                TEXT NOT NULL,
  questions            JSONB NOT NULL DEFAULT '[]',
  target_customer_type TEXT,
  is_mandatory         BOOLEAN DEFAULT false,
  is_active            BOOLEAN DEFAULT true,
  valid_from           DATE DEFAULT CURRENT_DATE,
  valid_to             DATE,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "surveys_read"  ON surveys;
DROP POLICY IF EXISTS "surveys_admin" ON surveys;
CREATE POLICY "surveys_read" ON surveys
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "surveys_admin" ON surveys
  FOR ALL USING (
    EXISTS (SELECT 1 FROM supervisors s WHERE s.user_id = auth.uid() AND s.role = 'admin')
  );

-- ── 8. SURVEY RESPONSES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS survey_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     UUID REFERENCES surveys(id) ON DELETE CASCADE,
  visit_id      UUID REFERENCES visits(id) ON DELETE CASCADE,
  supervisor_id UUID REFERENCES supervisors(id),
  answers       JSONB NOT NULL DEFAULT '{}',
  submitted_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "survey_responses_own" ON survey_responses;
CREATE POLICY "survey_responses_own" ON survey_responses
  FOR ALL USING (
    supervisor_id IN (SELECT id FROM supervisors WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM supervisors s
      WHERE s.user_id = auth.uid() AND s.role IN ('admin','branch_manager')
    )
  );

-- ── 9. AUDIT LOGS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   TEXT NOT NULL,
  action       TEXT CHECK (action IN ('INSERT','UPDATE','DELETE')),
  performed_by UUID REFERENCES supervisors(id),
  old_data     JSONB,
  new_data     JSONB,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_logs_admin" ON audit_logs;
CREATE POLICY "audit_logs_admin" ON audit_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM supervisors s WHERE s.user_id = auth.uid() AND s.role = 'admin')
  );

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_supervisor
  ON notifications(supervisor_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_list_product
  ON price_list(product_id, customer_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_visit_tasks_visit
  ON visit_tasks(visit_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON attendance(supervisor_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_beat_plans_date
  ON beat_plans(supervisor_id, plan_date DESC);
CREATE INDEX IF NOT EXISTS idx_survey_responses_visit
  ON survey_responses(visit_id);

-- ── POWER BI VIEWS ───────────────────────────────────────────
CREATE OR REPLACE VIEW vw_daily_kpi_supervisor AS
SELECT
  s.id                                                               AS supervisor_id,
  s.full_name,
  s.branch,
  DATE(v.visit_date)                                                 AS visit_date,
  COUNT(v.id)                                                        AS total_visits,
  COUNT(CASE WHEN v.visit_outcome = 'متعامل'     THEN 1 END)        AS dealt_visits,
  COUNT(CASE WHEN v.visit_outcome = 'غير متعامل' THEN 1 END)        AS not_dealt_visits,
  COUNT(CASE WHEN v.visit_outcome = 'غير موجود'  THEN 1 END)        AS absent_visits,
  COUNT(CASE WHEN v.on_beat = false               THEN 1 END)        AS oor_visits,
  ROUND(
    COUNT(CASE WHEN v.visit_outcome = 'متعامل' THEN 1 END)::numeric
    / NULLIF(COUNT(v.id), 0) * 100, 1
  )                                                                  AS strike_rate_pct,
  ROUND(AVG(sa.audit_score), 1)                                      AS avg_pss_score
FROM supervisors s
LEFT JOIN visits v       ON v.supervisor_id = s.id
LEFT JOIN shelf_audit sa ON sa.visit_id     = v.id
WHERE s.is_active = true
GROUP BY s.id, s.full_name, s.branch, DATE(v.visit_date);

CREATE OR REPLACE VIEW vw_perfect_store_index AS
SELECT
  s.full_name  AS supervisor_name,
  s.branch,
  COUNT(sa.id) AS total_audits,
  ROUND(AVG(sa.audit_score), 1) AS avg_pss_score,
  ROUND(AVG(
    (sa.ai_detailed_report -> 'target_brand_metrics'
      ->> 'share_of_shelf_percentage')::numeric
  ), 1) AS avg_share_of_shelf_pct,
  COUNT(CASE WHEN
    (sa.ai_detailed_report -> 'competitor_metrics'
      ->> 'competitor_presence_detected')::boolean = true
  THEN 1 END) AS audits_with_competitors
FROM shelf_audit sa
JOIN visits     v ON sa.visit_id    = v.id
JOIN supervisors s ON v.supervisor_id = s.id
WHERE sa.ai_detailed_report IS NOT NULL
GROUP BY s.full_name, s.branch;

CREATE OR REPLACE VIEW vw_branch_performance AS
SELECT
  COALESCE(s.branch, 'غير محدد')              AS branch,
  COUNT(DISTINCT s.id)                         AS supervisor_count,
  COUNT(v.id)                                  AS total_visits,
  COUNT(CASE WHEN v.visit_outcome = 'متعامل'  THEN 1 END) AS dealt_visits,
  COUNT(CASE WHEN v.on_beat = false            THEN 1 END) AS oor_visits,
  COUNT(o.id)                                  AS total_orders,
  ROUND(
    COUNT(CASE WHEN v.visit_outcome = 'متعامل' THEN 1 END)::numeric
    / NULLIF(COUNT(v.id), 0) * 100, 1
  ) AS strike_rate_pct
FROM supervisors s
LEFT JOIN visits v ON v.supervisor_id = s.id
LEFT JOIN orders o ON o.supervisor_id = s.id
WHERE s.is_active = true
GROUP BY s.branch;

CREATE OR REPLACE VIEW vw_competitor_heatmap AS
SELECT
  cp.brand_name                                       AS competitor,
  COUNT(cp.id)                                        AS total_appearances,
  COUNT(DISTINCT v.customer_id)                       AS unique_outlets,
  ROUND(
    COUNT(cp.id)::numeric
    / NULLIF((SELECT COUNT(*) FROM visits WHERE visit_outcome = 'متعامل'), 0)
    * 100, 1
  )                                                   AS appearance_rate_pct,
  c.branch
FROM competitor_products cp
JOIN visits   v ON cp.visit_id   = v.id
JOIN customers c ON v.customer_id = c.id
GROUP BY cp.brand_name, c.branch
ORDER BY total_appearances DESC;

CREATE OR REPLACE VIEW vw_oor_analysis AS
SELECT
  s.full_name                                                        AS supervisor_name,
  s.branch,
  COUNT(v.id)                                                        AS total_visits,
  COUNT(CASE WHEN v.on_beat = false THEN 1 END)                     AS oor_count,
  ROUND(
    COUNT(CASE WHEN v.on_beat = false THEN 1 END)::numeric
    / NULLIF(COUNT(v.id), 0) * 100, 1
  )                                                                  AS oor_pct,
  ROUND(AVG(CASE WHEN v.on_beat = false THEN v.geo_distance END), 0) AS avg_oor_distance_m
FROM supervisors s
LEFT JOIN visits v ON v.supervisor_id = s.id
WHERE s.is_active = true
GROUP BY s.full_name, s.branch
ORDER BY oor_pct DESC;

-- ── VERIFY — Expected: 19 rows ────────────────────────────────
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns c
   WHERE c.table_name = t.table_name
     AND c.table_schema = 'public') AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
