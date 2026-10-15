-- ============================================================
-- MYDAN Migration 4 — Sales Capability & Training Academy
-- Udemy & Coursera-style micro-learning module for supervisors
-- ============================================================

-- 1. Storage bucket for training videos & attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-materials',
  'training-materials',
  true,
  524288000, -- 500 MB max video file size
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 524288000;

-- 2. Training Courses table
CREATE TABLE IF NOT EXISTS training_courses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  category         TEXT DEFAULT 'مهارات المبيعات',
  thumbnail_url    TEXT,
  display_order    INTEGER DEFAULT 0,
  is_published     BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Training Lessons table
CREATE TABLE IF NOT EXISTS training_lessons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID REFERENCES training_courses(id) ON DELETE CASCADE NOT NULL,
  company_id       UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  video_url        TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  attachment_url   TEXT,
  display_order    INTEGER DEFAULT 0,
  is_published     BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Supervisor Progress tracking
CREATE TABLE IF NOT EXISTS supervisor_training_progress (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  supervisor_id        UUID REFERENCES supervisors(id) ON DELETE CASCADE NOT NULL,
  lesson_id            UUID REFERENCES training_lessons(id) ON DELETE CASCADE NOT NULL,
  is_completed         BOOLEAN DEFAULT false,
  last_watched_seconds INTEGER DEFAULT 0,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT supervisor_lesson_unique UNIQUE (supervisor_id, lesson_id)
);

-- 5. Enable RLS
ALTER TABLE training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_training_progress ENABLE ROW LEVEL SECURITY;

-- 6. Policies for training_courses
DROP POLICY IF EXISTS "training_courses_read" ON training_courses;
DROP POLICY IF EXISTS "training_courses_admin" ON training_courses;

CREATE POLICY "training_courses_read" ON training_courses
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM supervisors WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "training_courses_admin" ON training_courses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM supervisors s
      WHERE s.user_id = auth.uid() 
        AND s.company_id = training_courses.company_id 
        AND s.role IN ('admin', 'super_admin')
    ) OR EXISTS (
      SELECT 1 FROM supervisors s
      WHERE s.user_id = auth.uid() AND s.role = 'super_admin'
    )
  );

-- 7. Policies for training_lessons
DROP POLICY IF EXISTS "training_lessons_read" ON training_lessons;
DROP POLICY IF EXISTS "training_lessons_admin" ON training_lessons;

CREATE POLICY "training_lessons_read" ON training_lessons
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM supervisors WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "training_lessons_admin" ON training_lessons
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM supervisors s
      WHERE s.user_id = auth.uid() 
        AND s.company_id = training_lessons.company_id 
        AND s.role IN ('admin', 'super_admin')
    ) OR EXISTS (
      SELECT 1 FROM supervisors s
      WHERE s.user_id = auth.uid() AND s.role = 'super_admin'
    )
  );

-- 8. Policies for supervisor_training_progress
DROP POLICY IF EXISTS "training_progress_read" ON supervisor_training_progress;
DROP POLICY IF EXISTS "training_progress_write" ON supervisor_training_progress;

CREATE POLICY "training_progress_read" ON supervisor_training_progress
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM supervisors WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "training_progress_write" ON supervisor_training_progress
  FOR ALL USING (
    supervisor_id IN (
      SELECT id FROM supervisors WHERE user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM supervisors s
      WHERE s.user_id = auth.uid() 
        AND s.company_id = supervisor_training_progress.company_id 
        AND s.role IN ('admin', 'super_admin')
    )
  );

-- 9. Storage policies for training-materials
DROP POLICY IF EXISTS "training_materials_read" ON storage.objects;
DROP POLICY IF EXISTS "training_materials_upload" ON storage.objects;

CREATE POLICY "training_materials_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'training-materials');

CREATE POLICY "training_materials_upload" ON storage.objects
  FOR ALL USING (
    bucket_id = 'training-materials' AND (
      EXISTS (
        SELECT 1 FROM supervisors s
        WHERE s.user_id = auth.uid() AND s.role IN ('admin', 'super_admin')
      )
    )
  );

-- 10. Seed Initial Capability Course for Zeina Group
INSERT INTO training_courses (
  id, company_id, title, description, category, display_order, is_published
) VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'فن الزيارة البيعية الفعالة والتعامل مع التجار',
  'الدليل العملي الميداني للمشرف المتميز لتطوير أداء المناديب، فتح عملاء جدد، وتحقيق أعلى إنتاجية من الزيارة.',
  'مهارات المبيعات الميدانية',
  1,
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO training_lessons (
  id, course_id, company_id, title, description, video_url, duration_seconds, display_order, is_published
) VALUES 
(
  'd0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '1. التحضير لما قبل الزيارة (Pre-Call Preparation)',
  'كيف يجهز المشرف نفسه والمندوب بالبيانات والأهداف قبل الدخول للمحل لضمان نجاح الزيارة.',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', -- sample demo video
  180,
  1,
  true
),
(
  'd0000000-0000-0000-0000-000000000002',
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '2. خطوات فتح وتأهيل عميل جديد (Store Prospecting)',
  'طريقة التقييم السريع للمحل وحجم الرف وكيفية بناء علاقة ثقة أولى مع التاجر.',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  240,
  2,
  true
),
(
  'd0000000-0000-0000-0000-000000000003',
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '3. معالجة اعتراضات التاجر على السعر وتواجد المنافسين',
  'أساليب إقناع التاجر بأهمية تواجد منتجات زينة مقابل فاين ووايت وكيفية تحويل الرف لمصدر ربح.',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  300,
  3,
  true
),
(
  'd0000000-0000-0000-0000-000000000004',
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '4. فن إغلاق الأوردر والترتيب المثالي للرف (Order Closing & Facing)',
  'كيفية إنهاء الزيارة بكتابة الأوردر والتأكد من صدارة منتجاتنا على الرف أمام المشتري.',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  210,
  4,
  true
)
ON CONFLICT (id) DO NOTHING;
