-- Migration: add bilingual (ar/en) title and description columns to training tables
-- Purpose: allow admins to enter content in both Arabic and English separately,
--          so the app displays the correct language for each user session.
-- Existing `title` and `description` columns are kept as the primary/fallback value.

ALTER TABLE training_courses
  ADD COLUMN IF NOT EXISTS title_ar  text,
  ADD COLUMN IF NOT EXISTS title_en  text,
  ADD COLUMN IF NOT EXISTS description_ar text,
  ADD COLUMN IF NOT EXISTS description_en text;

ALTER TABLE training_lessons
  ADD COLUMN IF NOT EXISTS title_ar  text,
  ADD COLUMN IF NOT EXISTS title_en  text,
  ADD COLUMN IF NOT EXISTS description_ar text,
  ADD COLUMN IF NOT EXISTS description_en text;
