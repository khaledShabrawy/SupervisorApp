-- Migration 29: Unified Seat-Based Licensing, License Codes, and PostgreSQL Seat Enforcement
-- Enforces active user limits across ALL roles (supervisor, senior_supervisor, branch_manager, admin)
-- at the database level so neither UI, CSV import, nor API calls can exceed purchased seats.

-- 1. Extend public.companies with max_users & license_key (idempotent)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS max_users integer,
  ADD COLUMN IF NOT EXISTS license_key text;

-- Backfill max_users from max_supervisors where null
UPDATE public.companies
SET max_users = COALESCE(max_supervisors, 10)
WHERE max_users IS NULL;

-- Backfill unique license_key for existing companies that lack one
UPDATE public.companies
SET license_key = 'MYD-' || upper(substr(replace(id::text, '-', ''), 1, 4) || '-' || substr(replace(id::text, '-', ''), 5, 4))
WHERE license_key IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_license_key_key'
  ) THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_license_key_key UNIQUE (license_key);
  END IF;
END $$;

-- 2. Table for pre-issued / store-generated license codes
CREATE TABLE IF NOT EXISTS public.license_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  license_type text NOT NULL DEFAULT 'pro',
  max_users integer NOT NULL CHECK (max_users > 0),
  duration_days integer NOT NULL DEFAULT 365 CHECK (duration_days > 0),
  price_amount numeric(10, 2),
  currency text NOT NULL DEFAULT 'SAR',
  used_by_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.license_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_manage_license_codes" ON public.license_codes;
CREATE POLICY "super_admin_manage_license_codes"
  ON public.license_codes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supervisors s
      WHERE s.user_id = auth.uid() AND s.role = 'super_admin' AND s.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.supervisors s
      WHERE s.user_id = auth.uid() AND s.role = 'super_admin' AND s.is_active = true
    )
  );

-- 3. Database Trigger: Enforce active seat limit across all roles (excluding super_admin)
CREATE OR REPLACE FUNCTION public.enforce_company_user_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_active_count integer;
BEGIN
  -- Only enforce when the resulting row is an active non-super_admin user
  IF NEW.is_active IS DISTINCT FROM true OR NEW.role = 'super_admin' OR NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip if already active in the same company
  IF TG_OP = 'UPDATE' AND OLD.is_active = true AND OLD.company_id IS NOT DISTINCT FROM NEW.company_id THEN
    RETURN NEW;
  END IF;

  -- Lock company row to prevent concurrent race conditions
  SELECT COALESCE(max_users, max_supervisors)
    INTO v_limit
    FROM public.companies
   WHERE id = NEW.company_id
     FOR UPDATE;

  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
    INTO v_active_count
    FROM public.supervisors
   WHERE company_id = NEW.company_id
     AND is_active = true
     AND role IS DISTINCT FROM 'super_admin'
     AND id IS DISTINCT FROM NEW.id;

  IF v_active_count >= v_limit THEN
    RAISE EXCEPTION 'SEAT_LIMIT_REACHED: تم الوصول للحد الأقصى للمقاعد النشطة (% / %)', v_active_count, v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_company_user_seat_limit ON public.supervisors;
CREATE TRIGGER trg_enforce_company_user_seat_limit
  BEFORE INSERT OR UPDATE OF is_active, company_id, role
  ON public.supervisors
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_company_user_seat_limit();

-- 4. RPC to redeem a license code for the caller's company
CREATE OR REPLACE FUNCTION public.redeem_license_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller record;
  v_code record;
  v_active_count integer;
  v_new_expiry timestamptz;
BEGIN
  SELECT id, company_id, role, is_active
    INTO v_caller
    FROM public.supervisors
   WHERE user_id = auth.uid()
   LIMIT 1;

  IF NOT FOUND OR v_caller.is_active IS DISTINCT FROM true OR v_caller.role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'غير مصرح لك بتفعيل أكواد الترخيص.' USING ERRCODE = '42501';
  END IF;

  IF v_caller.company_id IS NULL THEN
    RAISE EXCEPTION 'لا توجد شركة مرتبطة بهذا الحساب.' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
    INTO v_code
    FROM public.license_codes
   WHERE upper(trim(code)) = upper(trim(p_code))
     AND used_at IS NULL
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'كود الترخيص غير صحيح أو تم استخدامه مسبقاً.' USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*)
    INTO v_active_count
    FROM public.supervisors
   WHERE company_id = v_caller.company_id
     AND is_active = true
     AND role IS DISTINCT FROM 'super_admin';

  IF v_active_count > v_code.max_users THEN
    RAISE EXCEPTION 'عدد المستخدمين النشطين حالياً (%) أكبر من سعة هذا الكود (%). يرجى تعطيل المستخدمين الزائدين أولاً.', v_active_count, v_code.max_users
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.companies
     SET max_users = v_code.max_users,
         max_supervisors = v_code.max_users,
         license_type = v_code.license_type,
         license_key = v_code.code,
         is_active = true,
         expires_at = GREATEST(COALESCE(expires_at, now()), now()) + make_interval(days => v_code.duration_days)
   WHERE id = v_caller.company_id
   RETURNING expires_at INTO v_new_expiry;

  UPDATE public.license_codes
     SET used_by_company_id = v_caller.company_id,
         used_at = now()
   WHERE id = v_code.id;

  RETURN jsonb_build_object(
    'max_users', v_code.max_users,
    'license_type', v_code.license_type,
    'expires_at', v_new_expiry
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_license_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_license_code(text) TO authenticated;
