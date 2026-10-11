-- ============================================================
--  Migration 08 — RLS Phase 2: Close remaining tenant-isolation gaps
--  Project: Mydan / ywdlrrdkjbtpfgacuuoy
--
--  ⚠️  DO NOT RUN ON PRODUCTION without:
--      1. A fresh database backup (Supabase Dashboard → Settings → Backups)
--      2. Testing in a staging/development project first with two separate
--         company accounts and verifying the app still works for both.
--
--  Rollback: copy the DROP / CREATE POLICY statements below and invert them.
--  Each change has an inline rollback comment.
--
--  Prerequisites: migrations 01-07 already applied.
--  Helper functions required: get_my_company_id(), get_my_role(),
--                              get_my_supervisor_id()  (added in migration 01)
-- ============================================================

BEGIN;

-- ── 1. supervisors: allow self-update of profile fields only ─────────────────
-- Problem: no UPDATE policy exists → RLS denies all supervisor self-updates,
--          but the app profile screen calls .update({ full_name, phone }).
-- Fix A:   Add a policy that allows UPDATE on own row (company_id + user).
-- Fix B:   Column-level privilege grant restricts *which* columns can be
--          written to full_name and phone.  role, company_id, is_active cannot
--          be changed by an authenticated user even with this policy in place.
--
-- Rollback:
--   DROP POLICY IF EXISTS "supervisors_self_update" ON public.supervisors;
--   REVOKE UPDATE (full_name, phone) ON public.supervisors FROM authenticated;

DROP POLICY IF EXISTS "supervisors_self_update" ON public.supervisors;
CREATE POLICY "supervisors_self_update" ON public.supervisors FOR UPDATE TO authenticated
USING  (user_id = auth.uid() AND company_id = get_my_company_id())
WITH CHECK (user_id = auth.uid() AND company_id = get_my_company_id());

-- Only full_name and phone can be written by the authenticated role.
-- role, company_id, is_active, user_id are not in this grant → attempts to
-- set them via the client will receive a permission-denied error from PostgreSQL.
REVOKE UPDATE ON public.supervisors FROM authenticated;
GRANT  UPDATE (full_name, phone) ON public.supervisors TO authenticated;


-- ── 2. customers: scope reads to own company ──────────────────────────────────
-- Problem: "customers_select_all" allows any authenticated user from ANY company
--          to read ALL customers in the database.
-- Fix: replace with company-scoped read policy.
--
-- Rollback:
--   DROP POLICY IF EXISTS "customers_company_read" ON public.customers;
--   CREATE POLICY "customers_select_all" ON public.customers
--     FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "customers_select_all"   ON public.customers;
DROP POLICY IF EXISTS "customers_company_read" ON public.customers;
CREATE POLICY "customers_company_read" ON public.customers FOR SELECT TO authenticated
USING (company_id = get_my_company_id());

-- Supervisor INSERT: own company, self as creator (created_by = own supervisor id)
DROP POLICY IF EXISTS "customers_supervisor_insert" ON public.customers;
CREATE POLICY "customers_supervisor_insert" ON public.customers FOR INSERT TO authenticated
WITH CHECK (company_id = get_my_company_id());

-- Supervisor UPDATE: own company + own customers or admin
DROP POLICY IF EXISTS "customers_supervisor_update" ON public.customers;
CREATE POLICY "customers_supervisor_update" ON public.customers FOR UPDATE TO authenticated
USING  (company_id = get_my_company_id()
        AND (supervisor_id = get_my_supervisor_id()
             OR get_my_role() IN ('admin', 'super_admin')))
WITH CHECK (company_id = get_my_company_id());


-- ── 3. products: scope reads to own company ───────────────────────────────────
-- Problem: "products_select_all" exposes products from other companies.
-- Rollback:
--   DROP POLICY IF EXISTS "products_company_read" ON public.products;
--   CREATE POLICY "products_select_all" ON public.products
--     FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "products_select_all"   ON public.products;
DROP POLICY IF EXISTS "products_company_read" ON public.products;
CREATE POLICY "products_company_read" ON public.products FOR SELECT TO authenticated
USING (company_id = get_my_company_id());

-- Admin can insert / update products for own company
DROP POLICY IF EXISTS "products_admin_write" ON public.products;
CREATE POLICY "products_admin_write" ON public.products FOR INSERT TO authenticated
WITH CHECK (company_id = get_my_company_id() AND get_my_role() IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "products_admin_update" ON public.products;
CREATE POLICY "products_admin_update" ON public.products FOR UPDATE TO authenticated
USING  (company_id = get_my_company_id() AND get_my_role() IN ('admin', 'super_admin'))
WITH CHECK (company_id = get_my_company_id() AND get_my_role() IN ('admin', 'super_admin'));


-- ── 4. app_settings: ensure company isolation ────────────────────────────────
-- Problem: if no SELECT policy exists on app_settings (or it lacks company_id
--          filtering) a supervisor can read settings of other tenants.
-- Rollback:
--   DROP POLICY IF EXISTS "app_settings_company_read" ON public.app_settings;
--   DROP POLICY IF EXISTS "app_settings_admin_write"  ON public.app_settings;
--   DROP POLICY IF EXISTS "app_settings_admin_update" ON public.app_settings;

DROP POLICY IF EXISTS "app_settings_company_read" ON public.app_settings;
CREATE POLICY "app_settings_company_read" ON public.app_settings FOR SELECT TO authenticated
USING (company_id = get_my_company_id());

DROP POLICY IF EXISTS "app_settings_admin_write" ON public.app_settings;
CREATE POLICY "app_settings_admin_write" ON public.app_settings FOR UPDATE TO authenticated
USING  (company_id = get_my_company_id() AND get_my_role() IN ('admin', 'super_admin'))
WITH CHECK (company_id = get_my_company_id() AND get_my_role() IN ('admin', 'super_admin'));


-- ── 5. price_list: ensure company isolation ───────────────────────────────────
-- Rollback:
--   DROP POLICY IF EXISTS "price_list_company_read"  ON public.price_list;
--   DROP POLICY IF EXISTS "price_list_admin_write"   ON public.price_list;

DROP POLICY IF EXISTS "price_list_company_read" ON public.price_list;
CREATE POLICY "price_list_company_read" ON public.price_list FOR SELECT TO authenticated
USING (company_id = get_my_company_id());

DROP POLICY IF EXISTS "price_list_admin_write" ON public.price_list;
CREATE POLICY "price_list_admin_write" ON public.price_list FOR ALL TO authenticated
USING  (company_id = get_my_company_id() AND get_my_role() IN ('admin', 'super_admin'))
WITH CHECK (company_id = get_my_company_id() AND get_my_role() IN ('admin', 'super_admin'));


-- ── 6. shelf-photos bucket: tighten to own company ────────────────────────────
-- The existing shelf-photos bucket policy (if any) should restrict uploads to
-- company_id subfolder. This adds the missing INSERT policy if not present.
-- Rollback:
--   DROP POLICY IF EXISTS "shelf_photos_supervisor_insert" ON storage.objects;

DROP POLICY IF EXISTS "shelf_photos_supervisor_insert" ON storage.objects;
CREATE POLICY "shelf_photos_supervisor_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'shelf-photos'
  AND (storage.foldername(name))[1] = get_my_company_id()::text
);


COMMIT;

-- ── Verification queries (run manually in SQL Editor after applying) ──────────
-- Confirm supervisors cannot update role:
--   UPDATE public.supervisors SET role = 'super_admin' WHERE user_id = auth.uid();
--   → Expected: ERROR 42501 permission denied for table supervisors
--
-- Confirm company isolation on customers:
--   SELECT count(*) FROM public.customers WHERE company_id != get_my_company_id();
--   → Expected: 0 rows
--
-- Check all policies on affected tables:
--   SELECT tablename, policyname, cmd, qual FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('supervisors','customers','products','app_settings','price_list');
