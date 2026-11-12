-- Migration 30: Anti-Abuse Guards for Seat Limits, Daily Seat Churn, and Device Reset Abuse
-- 1. Auto-sync max_users and max_supervisors on public.companies
-- 2. Cap device_id resets per user (max 3 per 30 days, super_admin exempt)
-- 3. Cap monthly seat activations/churn per company (max GREATEST(limit * 2, limit + 5) per 30 days, super_admin exempt)

-- ─── 1. Sync max_users <-> max_supervisors ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_company_seat_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.max_users := COALESCE(NEW.max_users, NEW.max_supervisors, 10);
    NEW.max_supervisors := NEW.max_users;
  ELSE
    IF NEW.max_users IS DISTINCT FROM OLD.max_users AND NEW.max_users IS NOT NULL THEN
      NEW.max_supervisors := NEW.max_users;
    ELSIF NEW.max_supervisors IS DISTINCT FROM OLD.max_supervisors AND NEW.max_supervisors IS NOT NULL THEN
      NEW.max_users := NEW.max_supervisors;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_company_seat_columns ON public.companies;
CREATE TRIGGER trg_sync_company_seat_columns
  BEFORE INSERT OR UPDATE OF max_supervisors, max_users
  ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_company_seat_columns();

-- Backfill any out-of-sync companies
UPDATE public.companies
SET max_users = COALESCE(max_users, max_supervisors, 10),
    max_supervisors = COALESCE(max_users, max_supervisors, 10)
WHERE max_users IS DISTINCT FROM max_supervisors;

-- ─── 2. Device Binding Reset Anti-Abuse Log & Guard ──────────────────────────
CREATE TABLE IF NOT EXISTS public.device_reset_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supervisor_id uuid NOT NULL REFERENCES public.supervisors(id) ON DELETE CASCADE,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_reset_logs_lookup
  ON public.device_reset_logs (supervisor_id, created_at DESC);

ALTER TABLE public.device_reset_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_device_reset_logs" ON public.device_reset_logs;
CREATE POLICY "admins_read_device_reset_logs"
  ON public.device_reset_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supervisors s
      WHERE s.user_id = auth.uid()
        AND s.is_active = true
        AND (
          s.role = 'super_admin'
          OR (s.role = 'admin' AND s.company_id = device_reset_logs.company_id)
        )
    )
  );

CREATE OR REPLACE FUNCTION public.guard_device_reset_abuse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_reset_count integer;
BEGIN
  IF OLD.device_id IS NOT NULL AND NEW.device_id IS NULL THEN
    SELECT role INTO v_actor_role
      FROM public.supervisors
     WHERE user_id = auth.uid()
     LIMIT 1;

    IF v_actor_role IS DISTINCT FROM 'super_admin' THEN
      SELECT COUNT(*) INTO v_reset_count
        FROM public.device_reset_logs
       WHERE supervisor_id = NEW.id
         AND created_at >= now() - interval '30 days';

      IF v_reset_count >= 3 THEN
        RAISE EXCEPTION 'DEVICE_RESET_LIMIT: تم استهلاك الحد الشهري لفك ارتباط الجهاز لهذا الحساب (3 مرات كل 30 يوم).'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    INSERT INTO public.device_reset_logs (company_id, supervisor_id, actor_user_id)
    VALUES (NEW.company_id, NEW.id, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_device_reset_abuse ON public.supervisors;
CREATE TRIGGER trg_guard_device_reset_abuse
  BEFORE UPDATE OF device_id
  ON public.supervisors
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_device_reset_abuse();

-- ─── 3. Seat Churn Anti-Abuse Log & Guard ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seat_activation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supervisor_id uuid NOT NULL REFERENCES public.supervisors(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seat_activation_logs_lookup
  ON public.seat_activation_logs (company_id, created_at DESC);

ALTER TABLE public.seat_activation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_seat_activation_logs" ON public.seat_activation_logs;
CREATE POLICY "admins_read_seat_activation_logs"
  ON public.seat_activation_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supervisors s
      WHERE s.user_id = auth.uid()
        AND s.is_active = true
        AND (
          s.role = 'super_admin'
          OR (s.role = 'admin' AND s.company_id = seat_activation_logs.company_id)
        )
    )
  );

CREATE OR REPLACE FUNCTION public.guard_seat_churn_abuse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_limit integer;
  v_allowance integer;
  v_monthly_count integer;
BEGIN
  IF NEW.is_active IS DISTINCT FROM true OR NEW.role = 'super_admin' OR NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_active = true AND OLD.company_id IS NOT DISTINCT FROM NEW.company_id THEN
    RETURN NEW;
  END IF;

  SELECT role INTO v_actor_role
    FROM public.supervisors
   WHERE user_id = auth.uid()
   LIMIT 1;

  SELECT COALESCE(max_users, max_supervisors)
    INTO v_limit
    FROM public.companies
   WHERE id = NEW.company_id;

  IF v_limit IS NOT NULL AND v_actor_role IS DISTINCT FROM 'super_admin' THEN
    v_allowance := GREATEST(v_limit * 2, v_limit + 5);
    SELECT COUNT(*)
      INTO v_monthly_count
      FROM public.seat_activation_logs
     WHERE company_id = NEW.company_id
       AND created_at >= now() - interval '30 days';

    IF v_monthly_count >= v_allowance THEN
      RAISE EXCEPTION 'SEAT_CHURN_LIMIT: تم تجاوز الحد الشهري لتفعيل وتبديل المقاعد (% / %). يرجى التواصل مع الدعم أو ترقية الباقة.', v_monthly_count, v_allowance
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.seat_activation_logs (company_id, supervisor_id)
  VALUES (NEW.company_id, NEW.id);

  RETURN NEW;
END;
$$;

-- Note: trg_enforce_company_user_seat_limit (Migration 29) runs first alphabetically before trg_guard_seat_churn_abuse
-- or we name it trg_z_guard_seat_churn_abuse so it logs AFTER active seat count check passes!
DROP TRIGGER IF EXISTS trg_guard_seat_churn_abuse ON public.supervisors;
DROP TRIGGER IF EXISTS trg_z_guard_seat_churn_abuse ON public.supervisors;
CREATE TRIGGER trg_z_guard_seat_churn_abuse
  AFTER INSERT OR UPDATE OF is_active, company_id
  ON public.supervisors
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_seat_churn_abuse();
