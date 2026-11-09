-- =============================================================================
-- Migration: Expiry Notification System
-- Description: Automatic license expiry notifications at 14, 7, 3, 1 days
-- Schedule: Daily at 06:00 UTC (08:00 Cairo / EET+2)
-- =============================================================================

-- -------------------------------------------------------------------------
-- 1. NOTIFICATION FUNCTION
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_expiry_notifications()
RETURNS TABLE(company_name TEXT, days_remaining INT, notifications_inserted INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today        DATE    := CURRENT_DATE;
  v_thresholds   INT[]   := ARRAY[14, 7, 3, 1];
  v_threshold    INT;
  v_company      RECORD;
  v_supervisor   RECORD;
  v_title        TEXT;
  v_body         TEXT;
  v_inserted     INT     := 0;
  v_total        INT     := 0;
  v_days_left    INT;
BEGIN
  FOREACH v_threshold IN ARRAY v_thresholds LOOP
    -- Companies expiring exactly at this threshold (expires_at = today + threshold days)
    FOR v_company IN
      SELECT c.id, c.name, c.expires_at
      FROM   companies c
      WHERE  c.is_active = TRUE
        AND  c.expires_at IS NOT NULL
        AND  DATE(c.expires_at) = (v_today + (v_threshold || ' days')::INTERVAL)::DATE
    LOOP
      v_days_left := v_threshold;

      -- Compose Arabic notification message based on threshold
      IF v_days_left = 1 THEN
        v_title := '🚨 الاشتراك ينتهي غداً!';
        v_body  := 'ينتهي اشتراك شركة ' || v_company.name || ' غداً. يرجى التواصل الفوري مع إدارة المنصة لتجديد الترخيص وتفادي إيقاف الخدمة عن المشرفين.';
      ELSIF v_days_left = 3 THEN
        v_title := '🔴 الاشتراك ينتهي خلال 3 أيام';
        v_body  := 'تنبيه عاجل: ينتهي اشتراك شركة ' || v_company.name || ' خلال 3 أيام فقط. بادر بالتجديد الآن لضمان استمرارية الخدمة.';
      ELSIF v_days_left = 7 THEN
        v_title := '⚠️ الاشتراك ينتهي خلال أسبوع';
        v_body  := 'ينتهي اشتراك شركة ' || v_company.name || ' خلال 7 أيام. يرجى التواصل مع إدارة المنصة لتجديد باقة الاشتراك.';
      ELSE -- 14 days
        v_title := '🔔 تنبيه مبكر: الاشتراك ينتهي خلال 14 يوماً';
        v_body  := 'تنبيه مبكر: ينتهي اشتراك شركة ' || v_company.name || ' خلال 14 يوماً بتاريخ ' || TO_CHAR(v_company.expires_at, 'DD/MM/YYYY') || '. يُنصح ببدء إجراءات التجديد مع إدارة المنصة.';
      END IF;

      v_inserted := 0;

      -- Insert notification for each active admin / branch_manager / senior_supervisor
      -- Dedup: skip if same supervisor already received same threshold today
      FOR v_supervisor IN
        SELECT s.id AS supervisor_id, s.company_id
        FROM   supervisors s
        WHERE  s.company_id = v_company.id
          AND  s.is_active  = TRUE
          AND  s.role IN ('admin', 'branch_manager', 'senior_supervisor', 'super_admin')
          AND  NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE  n.company_id    = s.company_id
              AND  n.supervisor_id = s.id
              AND  n.type          = 'system'
              AND  n.title_ar      = v_title
              AND  DATE(n.created_at) = v_today
          )
      LOOP
        INSERT INTO notifications (
          company_id, supervisor_id, type, title_ar, body_ar, action_url, is_read
        ) VALUES (
          v_supervisor.company_id,
          v_supervisor.supervisor_id,
          'system',
          v_title,
          v_body,
          '/admin',
          FALSE
        );
        v_inserted := v_inserted + 1;
        v_total    := v_total    + 1;
      END LOOP;

      RETURN QUERY SELECT v_company.name::TEXT, v_days_left::INT, v_inserted::INT;
    END LOOP;
  END LOOP;

  -- If nothing was returned (no expiring companies), return a summary row
  IF v_total = 0 THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::INT, 0::INT;
  END IF;
END;
$$;

-- Grant execute to service_role only (Edge Functions run as service_role)
REVOKE ALL ON FUNCTION public.send_expiry_notifications() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.send_expiry_notifications() TO service_role;

-- -------------------------------------------------------------------------
-- 2. pg_cron SCHEDULE — requires pg_cron extension (enabled by default on Supabase)
-- Runs daily at 06:00 UTC = 08:00 Cairo (EET+2)
-- -------------------------------------------------------------------------

-- Enable pg_cron extension if not already enabled
-- Note: Run this once from Supabase Dashboard SQL Editor (requires superuser)
-- SELECT cron.schedule(
--   'send-expiry-notifications-daily',
--   '0 6 * * *',
--   $$SELECT public.send_expiry_notifications()$$
-- );

-- To verify scheduled jobs:
-- SELECT * FROM cron.job WHERE jobname = 'send-expiry-notifications-daily';

-- To unschedule if needed:
-- SELECT cron.unschedule('send-expiry-notifications-daily');

-- -------------------------------------------------------------------------
-- 3. MANUAL TEST (safe to run any time)
-- SELECT * FROM public.send_expiry_notifications();
-- -------------------------------------------------------------------------
