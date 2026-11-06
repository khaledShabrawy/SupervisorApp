-- Local schema compatibility fixture; no production rows or credentials.

-- Captured 2026-11-06. Not a complete Supabase backup or production migration.

DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='auth') THEN RAISE EXCEPTION 'Restore fixture requires an empty disposable database; never run it on a hosted project'; END IF; END $$;

SET check_function_bodies = false;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE "anon" NOLOGIN; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE "authenticated" NOLOGIN; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pg_database_owner') THEN CREATE ROLE "pg_database_owner" NOLOGIN; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='postgres') THEN CREATE ROLE "postgres" NOLOGIN; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE "service_role" NOLOGIN; END IF; END $$;

ALTER ROLE service_role BYPASSRLS;

CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA private_rls;

-- Auth is a synthetic stub for SQL/RPC authorization tests, not a copied Auth service.

CREATE TABLE auth.users (id uuid PRIMARY KEY, encrypted_password text);

GRANT USAGE ON SCHEMA auth, storage TO authenticated, anon;

CREATE TABLE "public"."app_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid,
  "app_name" text DEFAULT 'ميدان'::text,
  "app_name_en" text DEFAULT 'Mydan'::text,
  "app_tagline" text DEFAULT 'نظام إدارة المشرفين الميدانيين'::text,
  "logo_url" text,
  "favicon_url" text,
  "primary_color" text DEFAULT '#1A56DB'::text,
  "success_color" text DEFAULT '#108981'::text,
  "danger_color" text DEFAULT '#EF4444'::text,
  "background_color" text DEFAULT '#F8FAFC'::text,
  "geofence_radius_m" integer DEFAULT 500,
  "visit_types" text[] DEFAULT ARRAY['بقالة'::text, 'سوبر ماركت'::text, 'هايبر ماركت'::text, 'ميني ماركت'::text, 'كافيه'::text, 'مطعم'::text, 'أخرى'::text],
  "target_brand_name" text DEFAULT 'العلامة التجارية'::text,
  "competitor_brands" text[],
  "ai_audit_enabled" boolean DEFAULT true,
  "whatsapp_number" text,
  "updated_at" timestamp with time zone DEFAULT now(),
  "allow_password_change" boolean DEFAULT true NOT NULL,
  "allow_forgot_password" boolean DEFAULT true NOT NULL,
  "password_expiry_enabled" boolean DEFAULT false NOT NULL,
  "password_expiry_days" integer DEFAULT 90 NOT NULL,
  "branch_lock_mode" text DEFAULT 'auto_supervisor_branch'::text NOT NULL
);

CREATE TABLE "public"."asset_tickets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "visit_id" uuid,
  "reported_by" uuid NOT NULL,
  "fault_type" text NOT NULL,
  "fault_description" text NOT NULL,
  "photo_url" text,
  "ai_priority" text DEFAULT 'unassessed'::text,
  "ai_action_instruction" text,
  "status" text DEFAULT 'open'::text,
  "resolved_at" timestamp with time zone,
  "resolution_notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "public"."asset_types" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name_ar" text NOT NULL,
  "name_en" text,
  "icon" text DEFAULT '📦'::text,
  "color" text DEFAULT '#1A56DB'::text,
  "requires_qr" boolean DEFAULT true,
  "requires_serial" boolean DEFAULT true,
  "custom_fields" jsonb DEFAULT '[]'::jsonb,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "public"."assets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "asset_type_id" uuid NOT NULL,
  "asset_code" text NOT NULL,
  "customer_id" uuid,
  "serial_number" text,
  "model" text,
  "status" text DEFAULT 'active'::text,
  "assigned_technician_name" text,
  "assigned_technician_phone" text,
  "last_maintenance_date" timestamp with time zone,
  "installation_date" date,
  "custom_field_values" jsonb DEFAULT '{}'::jsonb,
  "notes" text,
  "photo_url" text,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "installed_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "public"."attendance" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "supervisor_id" uuid,
  "attendance_date" date DEFAULT CURRENT_DATE,
  "check_in_time" timestamp with time zone,
  "check_out_time" timestamp with time zone,
  "check_in_lat" double precision,
  "check_in_lng" double precision,
  "selfie_url" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid
);

CREATE TABLE "public"."audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "table_name" text NOT NULL,
  "action" text,
  "performed_by" uuid,
  "old_data" jsonb,
  "new_data" jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid
);

CREATE TABLE "public"."beat_plans" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "supervisor_id" uuid,
  "plan_date" date NOT NULL,
  "customer_ids_ordered" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "total_distance_km" numeric(8,2),
  "status" text DEFAULT 'draft'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid,
  "day_of_week" integer GENERATED ALWAYS AS ((EXTRACT(dow FROM plan_date))::integer) STORED,
  "customer_id" uuid
);

CREATE TABLE "public"."branches" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "region" text,
  "manager_id" uuid,
  "latitude" double precision,
  "longitude" double precision,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid,
  "region_id" uuid
);

CREATE TABLE "public"."companies" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "name_en" text,
  "logo_url" text,
  "primary_color" text DEFAULT '#1A56DB'::text,
  "secondary_color" text DEFAULT '#108981'::text,
  "industry" text DEFAULT 'FMCG'::text,
  "country" text DEFAULT 'EG'::text,
  "city" text,
  "contact_email" text,
  "contact_phone" text,
  "license_key" text,
  "license_type" text DEFAULT 'standard'::text,
  "max_supervisors" integer DEFAULT 50,
  "is_active" boolean DEFAULT true,
  "activated_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "woo_order_id" text,
  "subscription_plan" text
);

CREATE TABLE "public"."competitor_products" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "visit_id" uuid,
  "brand_name" text NOT NULL,
  "product_name" text,
  "quantity" integer DEFAULT 0,
  "photo_url" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid
);

CREATE TABLE "public"."customers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "type" text,
  "owner_name" text,
  "phone" text,
  "address" text,
  "latitude" double precision,
  "longitude" double precision,
  "branch" text,
  "is_active" boolean DEFAULT true,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid,
  "customer_type" text GENERATED ALWAYS AS (type) STORED,
  "supervisor_id" uuid,
  "status" text DEFAULT 'active'::text,
  "survey_id" uuid,
  "customer_code" text
);

CREATE TABLE "public"."discovered_customers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "field_survey_id" uuid NOT NULL,
  "shop_name" text NOT NULL,
  "owner_name" text,
  "phone" text,
  "address" text,
  "location_lat" numeric(10,8),
  "location_lng" numeric(11,8),
  "business_type" text,
  "estimated_potential" text,
  "status" text DEFAULT 'pending'::text,
  "converted_customer_id" uuid,
  "ai_confidence" numeric(3,2),
  "ai_analysis" jsonb,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "public"."field_surveys" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "supervisor_id" uuid NOT NULL,
  "visit_id" uuid,
  "survey_date" timestamp with time zone DEFAULT now(),
  "location_lat" numeric(10,8),
  "location_lng" numeric(11,8),
  "location_accuracy" numeric(8,2),
  "address" text,
  "area_name" text,
  "status" text DEFAULT 'pending'::text,
  "notes" text,
  "ai_analysis" jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid,
  "photo_url" text,
  "latitude" double precision,
  "longitude" double precision,
  "stores_found" integer DEFAULT 0,
  "ai_raw_result" jsonb
);

CREATE TABLE "public"."notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "supervisor_id" uuid,
  "type" text,
  "title_ar" text NOT NULL,
  "body_ar" text NOT NULL,
  "is_read" boolean DEFAULT false,
  "action_url" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid
);

CREATE TABLE "public"."orders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "visit_id" uuid,
  "supervisor_id" uuid,
  "customer_id" uuid,
  "product_id" uuid,
  "quantity" integer DEFAULT 0,
  "unit_price" numeric(10,2),
  "total_price" numeric(10,2),
  "status" text DEFAULT 'pending'::text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid,
  "items" jsonb DEFAULT '[]'::jsonb,
  "total_amount" numeric(12,2) DEFAULT 0,
  "order_date" date DEFAULT CURRENT_DATE,
  "delivered_at" timestamp with time zone
);

CREATE TABLE "public"."planograms" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "category" text,
  "image_url" text,
  "description" text,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid
);

CREATE TABLE "public"."price_list" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid,
  "customer_type" text,
  "unit_price" numeric(10,2) NOT NULL,
  "min_quantity" integer DEFAULT 1,
  "valid_from" date DEFAULT CURRENT_DATE,
  "valid_to" date,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid
);

CREATE TABLE "public"."price_lists" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "customer_type" text DEFAULT 'default'::text NOT NULL,
  "unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "public"."products" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "category" text,
  "sku_code" text,
  "image_url" text,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid,
  "item_code" text,
  "master_brand" text,
  "sub_brand" text,
  "unit" text DEFAULT 'قطعة'::text,
  "price" numeric(12,2) DEFAULT 0,
  "units_per_carton" integer DEFAULT 1,
  "carton_price" numeric(12,2) DEFAULT 0
);

CREATE TABLE "public"."push_subscriptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "supervisor_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "public"."regions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "name_en" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."shelf_audit" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "visit_id" uuid,
  "product_id" uuid,
  "photo_url" text,
  "is_present" boolean DEFAULT false,
  "quantity" integer DEFAULT 0,
  "display_order" text,
  "ai_detailed_report" jsonb,
  "audit_summary_ar" text,
  "audit_score" integer,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid,
  "status" text DEFAULT 'pending'::text,
  "audited_at" timestamp with time zone,
  "supervisor_id" uuid
);

CREATE TABLE "public"."supervisor_permissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "supervisor_id" uuid,
  "screen_key" text NOT NULL,
  "is_enabled" boolean DEFAULT true,
  "updated_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid
);

CREATE TABLE "public"."supervisor_training_progress" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "supervisor_id" uuid NOT NULL,
  "lesson_id" uuid NOT NULL,
  "is_completed" boolean DEFAULT false,
  "last_watched_seconds" integer DEFAULT 0,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "public"."supervisors" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "full_name" text NOT NULL,
  "phone" text,
  "branch" text,
  "role" text DEFAULT 'supervisor'::text,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "branch_id" uuid,
  "company_id" uuid,
  "device_id" text,
  "force_password_change" boolean DEFAULT false NOT NULL,
  "password_changed_at" timestamp with time zone DEFAULT now(),
  "supervisor_code" text
);

CREATE TABLE "public"."survey_photos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "field_survey_id" uuid NOT NULL,
  "storage_path" text NOT NULL,
  "photo_url" text,
  "photo_type" text DEFAULT 'exterior'::text,
  "ai_tags" jsonb,
  "uploaded_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "public"."survey_responses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "survey_id" uuid,
  "visit_id" uuid,
  "supervisor_id" uuid,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid
);

CREATE TABLE "public"."surveys" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "target_customer_type" text,
  "is_mandatory" boolean DEFAULT false,
  "is_active" boolean DEFAULT true,
  "valid_from" date DEFAULT CURRENT_DATE,
  "valid_to" date,
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid
);

CREATE TABLE "public"."targets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "supervisor_id" uuid,
  "target_date" date NOT NULL,
  "visits_target" integer DEFAULT 0,
  "audit_target" integer DEFAULT 0,
  "orders_target" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid,
  "month" integer GENERATED ALWAYS AS ((EXTRACT(month FROM target_date))::integer) STORED,
  "year" integer GENERATED ALWAYS AS ((EXTRACT(year FROM target_date))::integer) STORED,
  "actual_visits" integer DEFAULT 0,
  "actual_audits" integer DEFAULT 0,
  "actual_orders" integer DEFAULT 0,
  "criteria" text DEFAULT 'visits'::text,
  "scope_type" text DEFAULT 'per_user'::text,
  "target_scope" text DEFAULT 'all_branches'::text,
  "branch_id" uuid,
  "target_amount" numeric DEFAULT 0
);

CREATE TABLE "public"."training_courses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "category" text DEFAULT 'مهارات المبيعات'::text,
  "thumbnail_url" text,
  "display_order" integer DEFAULT 0,
  "is_published" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "public"."training_lessons" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "course_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "video_url" text NOT NULL,
  "duration_seconds" integer DEFAULT 0,
  "attachment_url" text,
  "display_order" integer DEFAULT 0,
  "is_published" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "public"."visit_tasks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "visit_id" uuid,
  "task_type" text,
  "title_ar" text NOT NULL,
  "is_completed" boolean DEFAULT false,
  "is_mandatory" boolean DEFAULT false,
  "order_num" integer DEFAULT 0,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid
);

CREATE TABLE "public"."visits" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "supervisor_id" uuid,
  "customer_id" uuid,
  "status" text DEFAULT 'pending'::text,
  "visit_outcome" text,
  "latitude" double precision,
  "longitude" double precision,
  "geo_distance" double precision,
  "on_beat" boolean DEFAULT false,
  "notes" text,
  "visit_date" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now(),
  "company_id" uuid,
  "check_in_time" timestamp with time zone,
  "check_out_time" timestamp with time zone
);

CREATE OR REPLACE FUNCTION auth.email()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$function$
;

CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$
;

CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$
;

CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$
;

CREATE OR REPLACE FUNCTION private_rls.can_access_supervisor(p_target_supervisor_id uuid, p_target_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT EXISTS ( SELECT 1 FROM public.supervisors AS me JOIN public.supervisors AS target ON target.id = p_target_supervisor_id WHERE me.user_id = (SELECT auth.uid()) AND me.is_active = true AND target.company_id = p_target_company_id AND ( target.id = me.id OR ( me.role IN ('admin', 'super_admin') AND me.company_id = p_target_company_id ) OR ( me.role = 'senior_supervisor' AND me.company_id = p_target_company_id AND me.branch_id IS NOT NULL AND target.branch_id = me.branch_id ) OR ( me.role = 'branch_manager' AND me.company_id = p_target_company_id AND ( (me.branch_id IS NOT NULL AND target.branch_id = me.branch_id) OR EXISTS ( SELECT 1 FROM public.branches AS b WHERE b.manager_id = me.id AND b.id = target.branch_id AND b.company_id = p_target_company_id ) ) ) ) ) $function$
;

CREATE OR REPLACE FUNCTION private_rls.current_supervisor_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT s.id FROM public.supervisors AS s WHERE s.user_id = (SELECT auth.uid()) AND s.is_active = true LIMIT 1 $function$
;

CREATE OR REPLACE FUNCTION public.create_default_visit_tasks()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.visit_tasks (visit_id, company_id, task_type, title_ar, is_mandatory, order_num)
  VALUES
    (NEW.id, NEW.company_id, 'shelf_audit',      'تصوير ومراجعة الرف',     true,  1),
    (NEW.id, NEW.company_id, 'competitor_check', 'رصد منتجات المنافسين',   false, 2),
    (NEW.id, NEW.company_id, 'other',            'التحقق من جودة العرض', false, 3);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_supervisor_cascade(p_supervisor_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_role text;
  v_caller_company_id uuid;
  v_caller_branch_id uuid;
  v_caller_is_active boolean;
  v_target_record public.supervisors%ROWTYPE;
BEGIN
  -- 1. Explicit Fail-Closed Authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Fetch Caller Credentials
  SELECT role, company_id, branch_id, is_active
  INTO v_caller_role, v_caller_company_id, v_caller_branch_id, v_caller_is_active
  FROM public.supervisors
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND OR v_caller_role IS NULL OR v_caller_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Forbidden: Caller supervisor record not found or inactive';
  END IF;

  IF v_caller_role NOT IN ('admin', 'super_admin', 'branch_manager', 'manager') THEN
    RAISE EXCEPTION 'Forbidden: Insufficient privileges';
  END IF;

  -- 3. Fetch Target Supervisor
  SELECT * INTO v_target_record
  FROM public.supervisors
  WHERE id = p_supervisor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supervisor not found';
  END IF;

  -- 4. Multi-Tenant Company Match
  IF v_caller_role <> 'super_admin' AND v_target_record.company_id IS DISTINCT FROM v_caller_company_id THEN
    RAISE EXCEPTION 'Forbidden: Cannot delete supervisors outside your company';
  END IF;

  -- 4b. Branch-Scope for branch_manager (mirrors admin_update_supervisor guard)
  IF v_caller_role = 'branch_manager' THEN
    IF v_caller_branch_id IS NULL OR v_target_record.branch_id IS DISTINCT FROM v_caller_branch_id THEN
      RAISE EXCEPTION 'Forbidden: Branch manager can only delete supervisors within their own branch';
    END IF;
  END IF;

  -- 5. Super Admin and Self-Delete Protections
  IF v_target_record.role = 'super_admin' THEN
    RAISE EXCEPTION 'Forbidden: Cannot delete system super admin';
  END IF;

  IF v_target_record.user_id = auth.uid() THEN
    RAISE EXCEPTION 'Forbidden: Cannot delete your own account';
  END IF;

  -- 6. Cascading Cleanup of Dependent Records
  DELETE FROM public.supervisor_permissions WHERE supervisor_id = p_supervisor_id;
  DELETE FROM public.beat_plans WHERE supervisor_id = p_supervisor_id;
  DELETE FROM public.notifications WHERE supervisor_id = p_supervisor_id;
  DELETE FROM public.supervisors WHERE id = p_supervisor_id;

  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.company_id
  FROM public.supervisors AS s
  WHERE s.user_id = (SELECT auth.uid())
    AND s.is_active = true
  LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.role
  FROM public.supervisors AS s
  WHERE s.user_id = (SELECT auth.uid())
    AND s.is_active = true
  LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_supervisor_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM supervisors
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_company_app_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.app_settings (
    company_id, app_name, primary_color, success_color, danger_color,
    background_color, geofence_radius_m, target_brand_name, competitor_brands, ai_audit_enabled
  ) VALUES (
    NEW.id, COALESCE(NULLIF(NEW.name, ''), 'Mydan'), '#1A56DB', '#10B981', '#EF4444',
    '#F8FAFC', 100, COALESCE(NULLIF(NEW.name, ''), 'Mydan'), '{}', true
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.manager_set_order_status(p_order_id uuid, p_new_status text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_old public.orders; v_new public.orders; v_actor_id uuid; v_role text; BEGIN IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF; v_actor_id := private_rls.current_supervisor_id(); v_role := public.get_my_role(); IF v_actor_id IS NULL OR COALESCE(v_role, '') NOT IN ('branch_manager', 'admin', 'super_admin') THEN RAISE EXCEPTION 'Role not allowed to approve orders' USING ERRCODE = '42501'; END IF; IF COALESCE(p_new_status, '') NOT IN ('confirmed', 'cancelled') THEN RAISE EXCEPTION 'Only confirmed or cancelled is allowed' USING ERRCODE = '22023'; END IF; SELECT o.* INTO v_old FROM public.orders AS o WHERE o.id = p_order_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002'; END IF; IF NOT private_rls.can_access_supervisor(v_old.supervisor_id, v_old.company_id) THEN RAISE EXCEPTION 'Order is outside the manager scope' USING ERRCODE = '42501'; END IF; IF v_old.status <> 'pending' THEN RAISE EXCEPTION 'Only pending orders can be approved or rejected' USING ERRCODE = '22023'; END IF; IF p_new_status = 'confirmed' AND (v_old.unit_price IS NULL OR v_old.total_price IS NULL) THEN RAISE EXCEPTION 'Order prices must be calculated before confirmation' USING ERRCODE = '22023'; END IF; UPDATE public.orders AS o SET status = p_new_status WHERE o.id = p_order_id RETURNING o.* INTO v_new; INSERT INTO public.audit_logs (table_name, action, performed_by, old_data, new_data, company_id) VALUES ('orders', 'UPDATE', v_actor_id, to_jsonb(v_old), to_jsonb(v_new), v_new.company_id); RETURN v_new; END; $function$
;

CREATE OR REPLACE FUNCTION public.mdn_nearest_customers_v1(p_lat double precision, p_lng double precision, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, name text, customer_type text, address text, latitude double precision, longitude double precision, company_id uuid, supervisor_id uuid, is_active boolean, customer_code text, distance_km numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    c.id,
    c.name,
    c.customer_type,
    c.address,
    c.latitude,
    c.longitude,
    c.company_id,
    c.supervisor_id,
    c.is_active,
    c.customer_code,
    ROUND(
      (
        2 * 6371 * ASIN(
          SQRT(
            POWER(SIN((RADIANS(c.latitude)  - RADIANS(p_lat))  / 2), 2)
            + COS(RADIANS(p_lat)) * COS(RADIANS(c.latitude))
            * POWER(SIN((RADIANS(c.longitude) - RADIANS(p_lng)) / 2), 2)
          )
        )
      )::NUMERIC,
      2
    ) AS distance_km
  FROM public.customers c
  WHERE
    c.is_active    = TRUE
    AND c.latitude  IS NOT NULL
    AND c.longitude IS NOT NULL
    -- Tenant isolation: caller must be an active supervisor of the company
    AND c.company_id IN (
      SELECT s.company_id
      FROM   public.supervisors s
      WHERE  s.user_id   = auth.uid()
        AND  s.is_active = TRUE
    )
  ORDER BY distance_km ASC
  -- p_limit = 0 means "return all" (maps to JS NearestLimit 'all')
  LIMIT CASE WHEN p_limit <= 0 THEN NULL ELSE p_limit END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_supervisor_self_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.user_id = auth.uid() AND (
       NEW.role        IS DISTINCT FROM OLD.role
    OR NEW.company_id  IS DISTINCT FROM OLD.company_id
    OR NEW.is_active   IS DISTINCT FROM OLD.is_active
  ) THEN
    RAISE EXCEPTION 'Forbidden: supervisors cannot modify role, company_id, or is_active on their own record'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION storage.extension(name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Get the last path segment (the actual filename)
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    -- Extract extension: reverse, split on '.', then reverse again
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$function$
;

CREATE OR REPLACE FUNCTION storage.filename(name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    _parts text[];
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    RETURN _parts[array_length(_parts, 1)];
END
$function$
;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$function$
;

ALTER TABLE "public"."app_settings" ADD CONSTRAINT "app_settings_company_id_key" UNIQUE (company_id);

ALTER TABLE "public"."app_settings" ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."asset_tickets" ADD CONSTRAINT "asset_tickets_ai_priority_check" CHECK ((ai_priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text, 'unassessed'::text])));

ALTER TABLE "public"."asset_tickets" ADD CONSTRAINT "asset_tickets_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."asset_tickets" ADD CONSTRAINT "asset_tickets_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'dispatched'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])));

ALTER TABLE "public"."asset_types" ADD CONSTRAINT "asset_types_company_id_name_ar_key" UNIQUE (company_id, name_ar);

ALTER TABLE "public"."asset_types" ADD CONSTRAINT "asset_types_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."assets" ADD CONSTRAINT "assets_company_id_asset_code_key" UNIQUE (company_id, asset_code);

ALTER TABLE "public"."assets" ADD CONSTRAINT "assets_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."assets" ADD CONSTRAINT "assets_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'defective'::text, 'under_maintenance'::text, 'retired'::text])));

ALTER TABLE "public"."attendance" ADD CONSTRAINT "attendance_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."attendance" ADD CONSTRAINT "attendance_supervisor_id_attendance_date_key" UNIQUE (supervisor_id, attendance_date);

ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_action_check" CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])));

ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."beat_plans" ADD CONSTRAINT "beat_plans_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."beat_plans" ADD CONSTRAINT "beat_plans_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'completed'::text])));

ALTER TABLE "public"."beat_plans" ADD CONSTRAINT "beat_plans_supervisor_id_plan_date_key" UNIQUE (supervisor_id, plan_date);

ALTER TABLE "public"."branches" ADD CONSTRAINT "branches_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_license_key_key" UNIQUE (license_key);

ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_license_type_check" CHECK ((license_type = ANY (ARRAY['standard'::text, 'pro'::text, 'enterprise'::text])));

ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_subscription_plan_check" CHECK ((subscription_plan = ANY (ARRAY['monthly'::text, 'yearly'::text])));

ALTER TABLE "public"."competitor_products" ADD CONSTRAINT "competitor_products_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_type_check" CHECK ((type = ANY (ARRAY['بقالة'::text, 'سوبر ماركت'::text, 'هايبر ماركت'::text, 'ميني ماركت'::text, 'كافيه'::text, 'مطعم'::text, 'أخرى'::text])));

ALTER TABLE "public"."discovered_customers" ADD CONSTRAINT "discovered_customers_estimated_potential_check" CHECK ((estimated_potential = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));

ALTER TABLE "public"."discovered_customers" ADD CONSTRAINT "discovered_customers_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."discovered_customers" ADD CONSTRAINT "discovered_customers_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'converted'::text])));

ALTER TABLE "public"."field_surveys" ADD CONSTRAINT "field_surveys_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."field_surveys" ADD CONSTRAINT "field_surveys_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'rejected'::text])));

ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_type_check" CHECK ((type = ANY (ARRAY['ai_result'::text, 'target_alert'::text, 'admin_message'::text, 'system'::text])));

ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'delivered'::text, 'cancelled'::text])));

ALTER TABLE "public"."planograms" ADD CONSTRAINT "planograms_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."price_list" ADD CONSTRAINT "price_list_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."price_lists" ADD CONSTRAINT "price_lists_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."products" ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."products" ADD CONSTRAINT "products_sku_code_key" UNIQUE (sku_code);

ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_supervisor_id_endpoint_key" UNIQUE (supervisor_id, endpoint);

ALTER TABLE "public"."regions" ADD CONSTRAINT "regions_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."shelf_audit" ADD CONSTRAINT "shelf_audit_audit_score_check" CHECK (((audit_score IS NULL) OR ((audit_score >= 0) AND (audit_score <= 100))));

ALTER TABLE "public"."shelf_audit" ADD CONSTRAINT "shelf_audit_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."shelf_audit" ADD CONSTRAINT "shelf_audit_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])));

ALTER TABLE "public"."supervisor_permissions" ADD CONSTRAINT "supervisor_permissions_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."supervisor_permissions" ADD CONSTRAINT "supervisor_permissions_supervisor_id_screen_key_key" UNIQUE (supervisor_id, screen_key);

ALTER TABLE "public"."supervisor_training_progress" ADD CONSTRAINT "supervisor_lesson_unique" UNIQUE (supervisor_id, lesson_id);

ALTER TABLE "public"."supervisor_training_progress" ADD CONSTRAINT "supervisor_training_progress_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."supervisors" ADD CONSTRAINT "supervisors_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."supervisors" ADD CONSTRAINT "supervisors_role_check" CHECK ((role = ANY (ARRAY['supervisor'::text, 'senior_supervisor'::text, 'branch_manager'::text, 'admin'::text, 'super_admin'::text])));

ALTER TABLE "public"."survey_photos" ADD CONSTRAINT "survey_photos_photo_type_check" CHECK ((photo_type = ANY (ARRAY['exterior'::text, 'interior'::text, 'shelf'::text, 'competitor'::text, 'other'::text])));

ALTER TABLE "public"."survey_photos" ADD CONSTRAINT "survey_photos_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."survey_responses" ADD CONSTRAINT "survey_responses_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."surveys" ADD CONSTRAINT "surveys_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."targets" ADD CONSTRAINT "targets_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."targets" ADD CONSTRAINT "targets_supervisor_id_target_date_key" UNIQUE (supervisor_id, target_date);

ALTER TABLE "public"."training_courses" ADD CONSTRAINT "training_courses_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."training_lessons" ADD CONSTRAINT "training_lessons_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."visit_tasks" ADD CONSTRAINT "visit_tasks_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."visit_tasks" ADD CONSTRAINT "visit_tasks_task_type_check" CHECK ((task_type = ANY (ARRAY['shelf_audit'::text, 'competitor_check'::text, 'order'::text, 'survey'::text, 'other'::text])));

ALTER TABLE "public"."visits" ADD CONSTRAINT "visits_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."visits" ADD CONSTRAINT "visits_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text])));

ALTER TABLE "public"."visits" ADD CONSTRAINT "visits_visit_outcome_check" CHECK ((visit_outcome = ANY (ARRAY['متعامل'::text, 'غير متعامل'::text, 'غير موجود'::text])));

ALTER TABLE "public"."app_settings" ADD CONSTRAINT "app_settings_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE "public"."asset_tickets" ADD CONSTRAINT "asset_tickets_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE;

ALTER TABLE "public"."asset_tickets" ADD CONSTRAINT "asset_tickets_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE "public"."asset_tickets" ADD CONSTRAINT "asset_tickets_reported_by_fkey" FOREIGN KEY (reported_by) REFERENCES supervisors(id) ON DELETE RESTRICT;

ALTER TABLE "public"."asset_tickets" ADD CONSTRAINT "asset_tickets_visit_id_fkey" FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE SET NULL;

ALTER TABLE "public"."asset_types" ADD CONSTRAINT "asset_types_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE "public"."assets" ADD CONSTRAINT "assets_asset_type_id_fkey" FOREIGN KEY (asset_type_id) REFERENCES asset_types(id) ON DELETE RESTRICT;

ALTER TABLE "public"."assets" ADD CONSTRAINT "assets_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE "public"."assets" ADD CONSTRAINT "assets_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE "public"."attendance" ADD CONSTRAINT "attendance_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."attendance" ADD CONSTRAINT "attendance_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE CASCADE;

ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_performed_by_fkey" FOREIGN KEY (performed_by) REFERENCES supervisors(id);

ALTER TABLE "public"."beat_plans" ADD CONSTRAINT "beat_plans_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."beat_plans" ADD CONSTRAINT "beat_plans_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE "public"."beat_plans" ADD CONSTRAINT "beat_plans_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE CASCADE;

ALTER TABLE "public"."branches" ADD CONSTRAINT "branches_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."branches" ADD CONSTRAINT "branches_manager_id_fkey" FOREIGN KEY (manager_id) REFERENCES supervisors(id);

ALTER TABLE "public"."branches" ADD CONSTRAINT "branches_region_id_fkey" FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL;

ALTER TABLE "public"."competitor_products" ADD CONSTRAINT "competitor_products_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."competitor_products" ADD CONSTRAINT "competitor_products_visit_id_fkey" FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE;

ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES supervisors(id);

ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE SET NULL;

ALTER TABLE "public"."discovered_customers" ADD CONSTRAINT "discovered_customers_converted_customer_id_fkey" FOREIGN KEY (converted_customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE "public"."discovered_customers" ADD CONSTRAINT "discovered_customers_field_survey_id_fkey" FOREIGN KEY (field_survey_id) REFERENCES field_surveys(id) ON DELETE CASCADE;

ALTER TABLE "public"."field_surveys" ADD CONSTRAINT "field_surveys_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE CASCADE;

ALTER TABLE "public"."field_surveys" ADD CONSTRAINT "field_surveys_visit_id_fkey" FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE SET NULL;

ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE CASCADE;

ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);

ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id);

ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_visit_id_fkey" FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE;

ALTER TABLE "public"."planograms" ADD CONSTRAINT "planograms_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."price_list" ADD CONSTRAINT "price_list_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."price_list" ADD CONSTRAINT "price_list_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE "public"."price_lists" ADD CONSTRAINT "price_lists_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE "public"."price_lists" ADD CONSTRAINT "price_lists_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE "public"."products" ADD CONSTRAINT "products_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE CASCADE;

ALTER TABLE "public"."regions" ADD CONSTRAINT "regions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE "public"."shelf_audit" ADD CONSTRAINT "shelf_audit_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."shelf_audit" ADD CONSTRAINT "shelf_audit_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE "public"."shelf_audit" ADD CONSTRAINT "shelf_audit_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE SET NULL;

ALTER TABLE "public"."shelf_audit" ADD CONSTRAINT "shelf_audit_visit_id_fkey" FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE;

ALTER TABLE "public"."supervisor_permissions" ADD CONSTRAINT "supervisor_permissions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."supervisor_permissions" ADD CONSTRAINT "supervisor_permissions_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE CASCADE;

ALTER TABLE "public"."supervisor_training_progress" ADD CONSTRAINT "supervisor_training_progress_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE "public"."supervisor_training_progress" ADD CONSTRAINT "supervisor_training_progress_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES training_lessons(id) ON DELETE CASCADE;

ALTER TABLE "public"."supervisor_training_progress" ADD CONSTRAINT "supervisor_training_progress_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE CASCADE;

ALTER TABLE "public"."supervisors" ADD CONSTRAINT "supervisors_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE "public"."supervisors" ADD CONSTRAINT "supervisors_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."supervisors" ADD CONSTRAINT "supervisors_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."survey_photos" ADD CONSTRAINT "survey_photos_field_survey_id_fkey" FOREIGN KEY (field_survey_id) REFERENCES field_surveys(id) ON DELETE CASCADE;

ALTER TABLE "public"."survey_responses" ADD CONSTRAINT "survey_responses_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."survey_responses" ADD CONSTRAINT "survey_responses_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id);

ALTER TABLE "public"."survey_responses" ADD CONSTRAINT "survey_responses_survey_id_fkey" FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE;

ALTER TABLE "public"."survey_responses" ADD CONSTRAINT "survey_responses_visit_id_fkey" FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE;

ALTER TABLE "public"."surveys" ADD CONSTRAINT "surveys_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."targets" ADD CONSTRAINT "targets_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE "public"."targets" ADD CONSTRAINT "targets_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."targets" ADD CONSTRAINT "targets_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE CASCADE;

ALTER TABLE "public"."training_courses" ADD CONSTRAINT "training_courses_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE "public"."training_lessons" ADD CONSTRAINT "training_lessons_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE "public"."training_lessons" ADD CONSTRAINT "training_lessons_course_id_fkey" FOREIGN KEY (course_id) REFERENCES training_courses(id) ON DELETE CASCADE;

ALTER TABLE "public"."visit_tasks" ADD CONSTRAINT "visit_tasks_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."visit_tasks" ADD CONSTRAINT "visit_tasks_visit_id_fkey" FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE;

ALTER TABLE "public"."visits" ADD CONSTRAINT "visits_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE "public"."visits" ADD CONSTRAINT "visits_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE "public"."visits" ADD CONSTRAINT "visits_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE CASCADE;

CREATE INDEX idx_visits_supervisor_date ON public.visits USING btree (supervisor_id, visit_date DESC);

CREATE INDEX idx_visits_customer ON public.visits USING btree (customer_id);

CREATE INDEX idx_shelf_audit_visit ON public.shelf_audit USING btree (visit_id);

CREATE INDEX idx_shelf_audit_updated ON public.shelf_audit USING btree (updated_at DESC);

CREATE INDEX idx_shelf_audit_score ON public.shelf_audit USING btree (audit_score) WHERE (audit_score IS NOT NULL);

CREATE INDEX idx_orders_supervisor ON public.orders USING btree (supervisor_id);

CREATE INDEX idx_customers_branch ON public.customers USING btree (branch);

CREATE INDEX idx_supervisor_permissions_supervisor ON public.supervisor_permissions USING btree (supervisor_id);

CREATE INDEX idx_notifications_supervisor ON public.notifications USING btree (supervisor_id, is_read);

CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at DESC);

CREATE INDEX idx_price_list_product ON public.price_list USING btree (product_id, customer_type) WHERE (is_active = true);

CREATE INDEX idx_visit_tasks_visit ON public.visit_tasks USING btree (visit_id);

CREATE INDEX idx_attendance_date ON public.attendance USING btree (supervisor_id, attendance_date DESC);

CREATE INDEX idx_beat_plans_date ON public.beat_plans USING btree (supervisor_id, plan_date DESC);

CREATE INDEX idx_survey_responses_visit ON public.survey_responses USING btree (visit_id);

CREATE INDEX idx_supervisors_company ON public.supervisors USING btree (company_id);

CREATE INDEX idx_customers_company ON public.customers USING btree (company_id);

CREATE INDEX idx_visits_company ON public.visits USING btree (company_id);

CREATE INDEX idx_shelf_audit_company ON public.shelf_audit USING btree (company_id);

CREATE INDEX idx_orders_company ON public.orders USING btree (company_id);

CREATE INDEX idx_notifications_company ON public.notifications USING btree (company_id);

CREATE INDEX idx_customers_status ON public.customers USING btree (company_id, status);

CREATE INDEX idx_field_surveys_company ON public.field_surveys USING btree (company_id, created_at DESC);

CREATE INDEX idx_orders_company_status ON public.orders USING btree (company_id, status);

CREATE INDEX idx_orders_visit ON public.orders USING btree (visit_id);

CREATE INDEX idx_price_lists_company_product ON public.price_lists USING btree (company_id, product_id, customer_type);

CREATE INDEX idx_customers_code ON public.customers USING btree (company_id, customer_code);

CREATE INDEX idx_supervisors_device_id ON public.supervisors USING btree (device_id);

CREATE INDEX idx_branches_region_id ON public.branches USING btree (region_id);

CREATE INDEX idx_field_surveys_tenant ON public.field_surveys USING btree (company_id, supervisor_id);

CREATE INDEX idx_customers_survey ON public.customers USING btree (survey_id);

CREATE INDEX idx_attendance_lookup ON public.attendance USING btree (company_id, supervisor_id, attendance_date DESC);

CREATE INDEX idx_beat_plans_lookup ON public.beat_plans USING btree (company_id, day_of_week, supervisor_id);

CREATE INDEX idx_notifications_lookup ON public.notifications USING btree (company_id, supervisor_id, is_read, created_at DESC);

CREATE INDEX idx_customers_supervisor_lookup ON public.customers USING btree (company_id, supervisor_id, is_active);

CREATE INDEX idx_supervisors_code ON public.supervisors USING btree (company_id, supervisor_code);

CREATE VIEW "public"."vw_asset_fleet_health" WITH (security_invoker=true) AS  SELECT a.company_id,
    at2.name_ar AS asset_type,
    COALESCE(b.name, c.branch, 'غير محدد'::text) AS branch,
    count(DISTINCT a.id) AS total_assets,
    count(DISTINCT a.id) FILTER (WHERE a.status = 'active'::text) AS active_count,
    count(DISTINCT a.id) FILTER (WHERE a.status = 'under_maintenance'::text) AS in_maintenance,
    count(DISTINCT a.id) FILTER (WHERE a.status = 'defective'::text) AS defective_count,
    count(DISTINCT atk.id) FILTER (WHERE atk.status = ANY (ARRAY['open'::text, 'dispatched'::text, 'in_progress'::text])) AS open_tickets,
    round(avg(EXTRACT(epoch FROM atk.resolved_at - atk.created_at) / 3600::numeric) FILTER (WHERE atk.resolved_at IS NOT NULL), 1) AS avg_resolution_hours
   FROM assets a
     JOIN asset_types at2 ON at2.id = a.asset_type_id
     LEFT JOIN customers c ON c.id = a.customer_id
     LEFT JOIN supervisors s ON s.id = c.supervisor_id
     LEFT JOIN branches b ON b.id = s.branch_id
     LEFT JOIN asset_tickets atk ON atk.asset_id = a.id
  WHERE a.is_active
  GROUP BY a.company_id, at2.name_ar, (COALESCE(b.name, c.branch, 'غير محدد'::text));

CREATE VIEW "public"."vw_branch_performance" WITH (security_invoker=true) AS  SELECT COALESCE(s.branch, 'غير محدد'::text) AS branch,
    count(DISTINCT s.id) AS supervisor_count,
    count(v.id) AS total_visits,
    count(
        CASE
            WHEN v.visit_outcome = 'متعامل'::text THEN 1
            ELSE NULL::integer
        END) AS dealt_visits,
    count(
        CASE
            WHEN v.on_beat = false THEN 1
            ELSE NULL::integer
        END) AS oor_visits,
    count(o.id) AS total_orders,
    round(count(
        CASE
            WHEN v.visit_outcome = 'متعامل'::text THEN 1
            ELSE NULL::integer
        END)::numeric / NULLIF(count(v.id), 0)::numeric * 100::numeric, 1) AS strike_rate_pct
   FROM supervisors s
     LEFT JOIN visits v ON v.supervisor_id = s.id
     LEFT JOIN orders o ON o.supervisor_id = s.id
  WHERE s.is_active = true
  GROUP BY s.branch;

CREATE VIEW "public"."vw_competitor_heatmap" WITH (security_invoker=true) AS  SELECT cp.brand_name AS competitor,
    count(cp.id) AS total_appearances,
    count(DISTINCT v.customer_id) AS unique_outlets,
    round(count(cp.id)::numeric / NULLIF(( SELECT count(*) AS count
           FROM visits
          WHERE visits.visit_outcome = 'متعامل'::text), 0)::numeric * 100::numeric, 1) AS appearance_rate_pct,
    c.branch
   FROM competitor_products cp
     JOIN visits v ON cp.visit_id = v.id
     JOIN customers c ON v.customer_id = c.id
  GROUP BY cp.brand_name, c.branch
  ORDER BY (count(cp.id)) DESC;

CREATE VIEW "public"."vw_daily_kpi_supervisor" WITH (security_invoker=true) AS  SELECT s.id AS supervisor_id,
    s.full_name,
    s.branch,
    date(v.visit_date) AS visit_date,
    count(v.id) AS total_visits,
    count(
        CASE
            WHEN v.visit_outcome = 'متعامل'::text THEN 1
            ELSE NULL::integer
        END) AS dealt_visits,
    count(
        CASE
            WHEN v.visit_outcome = 'غير متعامل'::text THEN 1
            ELSE NULL::integer
        END) AS not_dealt_visits,
    count(
        CASE
            WHEN v.visit_outcome = 'غير موجود'::text THEN 1
            ELSE NULL::integer
        END) AS absent_visits,
    count(
        CASE
            WHEN v.on_beat = false THEN 1
            ELSE NULL::integer
        END) AS oor_visits,
    round(count(
        CASE
            WHEN v.visit_outcome = 'متعامل'::text THEN 1
            ELSE NULL::integer
        END)::numeric / NULLIF(count(v.id), 0)::numeric * 100::numeric, 1) AS strike_rate_pct,
    round(avg(sa.audit_score), 1) AS avg_pss_score
   FROM supervisors s
     LEFT JOIN visits v ON v.supervisor_id = s.id
     LEFT JOIN shelf_audit sa ON sa.visit_id = v.id
  WHERE s.is_active = true
  GROUP BY s.id, s.full_name, s.branch, (date(v.visit_date));

CREATE VIEW "public"."vw_oor_analysis" WITH (security_invoker=true) AS  SELECT s.full_name AS supervisor_name,
    s.branch,
    count(v.id) AS total_visits,
    count(
        CASE
            WHEN v.on_beat = false THEN 1
            ELSE NULL::integer
        END) AS oor_count,
    round(count(
        CASE
            WHEN v.on_beat = false THEN 1
            ELSE NULL::integer
        END)::numeric / NULLIF(count(v.id), 0)::numeric * 100::numeric, 1) AS oor_pct,
    round(avg(
        CASE
            WHEN v.on_beat = false THEN v.geo_distance
            ELSE NULL::double precision
        END)::numeric, 0) AS avg_oor_distance_m
   FROM supervisors s
     LEFT JOIN visits v ON v.supervisor_id = s.id
  WHERE s.is_active = true
  GROUP BY s.full_name, s.branch
  ORDER BY (round(count(
        CASE
            WHEN v.on_beat = false THEN 1
            ELSE NULL::integer
        END)::numeric / NULLIF(count(v.id), 0)::numeric * 100::numeric, 1)) DESC;

CREATE VIEW "public"."vw_perfect_store_index" WITH (security_invoker=true) AS  SELECT s.full_name AS supervisor_name,
    s.branch,
    count(sa.id) AS total_audits,
    round(avg(sa.audit_score), 1) AS avg_pss_score,
    round(avg(((sa.ai_detailed_report -> 'target_brand_metrics'::text) ->> 'share_of_shelf_percentage'::text)::numeric), 1) AS avg_share_of_shelf_pct,
    count(
        CASE
            WHEN (((sa.ai_detailed_report -> 'competitor_metrics'::text) ->> 'competitor_presence_detected'::text)::boolean) = true THEN 1
            ELSE NULL::integer
        END) AS audits_with_competitors
   FROM shelf_audit sa
     JOIN visits v ON sa.visit_id = v.id
     JOIN supervisors s ON v.supervisor_id = s.id
  WHERE sa.ai_detailed_report IS NOT NULL
  GROUP BY s.full_name, s.branch;

CREATE TRIGGER supervisor_self_escalation_guard BEFORE UPDATE ON public.supervisors FOR EACH ROW EXECUTE FUNCTION prevent_supervisor_self_escalation();

CREATE TRIGGER tr_company_create_app_settings AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION handle_new_company_app_settings();

CREATE TRIGGER trg_discovered_customers_updated_at BEFORE UPDATE ON public.discovered_customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_field_surveys_updated_at BEFORE UPDATE ON public.field_surveys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_visits_default_tasks AFTER INSERT ON public.visits FOR EACH ROW EXECUTE FUNCTION create_default_visit_tasks();

ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."asset_tickets" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."asset_types" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."beat_plans" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."branches" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."competitor_products" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."discovered_customers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."field_surveys" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."planograms" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."price_list" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."price_lists" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."regions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."shelf_audit" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."supervisor_permissions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."supervisor_training_progress" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."supervisors" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."survey_photos" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."survey_responses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."surveys" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."targets" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."training_courses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."training_lessons" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."visit_tasks" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."visits" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_admin" ON "public"."app_settings" AS PERMISSIVE FOR ALL TO PUBLIC USING (((get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (company_id = get_my_company_id()))) WITH CHECK (((get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (company_id = get_my_company_id())));

CREATE POLICY "app_settings_admin_insert" ON "public"."app_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))) OR (get_my_role() = 'super_admin'::text)));

CREATE POLICY "app_settings_admin_write" ON "public"."app_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))) OR (get_my_role() = 'super_admin'::text))) WITH CHECK ((((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))) OR (get_my_role() = 'super_admin'::text)));

CREATE POLICY "app_settings_company_read" ON "public"."app_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((company_id = get_my_company_id()) OR (get_my_role() = 'super_admin'::text)));

CREATE POLICY "app_settings_public_read" ON "public"."app_settings" AS PERMISSIVE FOR SELECT TO "anon","authenticated" USING (true);

CREATE POLICY "app_settings_read" ON "public"."app_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = get_my_company_id()));

CREATE POLICY "app_settings_super_admin" ON "public"."app_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING ((get_my_role() = 'super_admin'::text)) WITH CHECK ((get_my_role() = 'super_admin'::text));

CREATE POLICY "app_settings_tenant_admin" ON "public"."app_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (((get_my_role() = 'admin'::text) AND (company_id = get_my_company_id()))) WITH CHECK (((get_my_role() = 'admin'::text) AND (company_id = get_my_company_id())));

CREATE POLICY "app_settings_update" ON "public"."app_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))));

CREATE POLICY "asset_tickets_admin_update" ON "public"."asset_tickets" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))));

CREATE POLICY "asset_tickets_insert" ON "public"."asset_tickets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((company_id = get_my_company_id()));

CREATE POLICY "asset_tickets_read" ON "public"."asset_tickets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = get_my_company_id()));

CREATE POLICY "asset_types_admin_write" ON "public"."asset_types" AS PERMISSIVE FOR ALL TO "authenticated" USING (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])))) WITH CHECK (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))));

CREATE POLICY "asset_types_company_read" ON "public"."asset_types" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((company_id = get_my_company_id()) OR (get_my_role() = 'super_admin'::text)));

CREATE POLICY "asset_types_read" ON "public"."asset_types" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = get_my_company_id()));

CREATE POLICY "assets_admin_write" ON "public"."assets" AS PERMISSIVE FOR ALL TO "authenticated" USING (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text])))) WITH CHECK (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text]))));

CREATE POLICY "assets_company_read" ON "public"."assets" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((company_id = get_my_company_id()) OR (get_my_role() = 'super_admin'::text)));

CREATE POLICY "assets_read" ON "public"."assets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = get_my_company_id()));

CREATE POLICY "attendance_checkout_self" ON "public"."attendance" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((supervisor_id = ( SELECT private_rls.current_supervisor_id() AS current_supervisor_id)) AND (company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (check_out_time IS NULL))) WITH CHECK (((supervisor_id = ( SELECT private_rls.current_supervisor_id() AS current_supervisor_id)) AND (company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (check_out_time IS NOT NULL)));

CREATE POLICY "attendance_insert_self" ON "public"."attendance" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((supervisor_id = ( SELECT private_rls.current_supervisor_id() AS current_supervisor_id)) AND (company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (check_out_time IS NULL)));

CREATE POLICY "attendance_read_scoped" ON "public"."attendance" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private_rls.can_access_supervisor(supervisor_id, company_id));

CREATE POLICY "audit_logs_admin" ON "public"."audit_logs" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (s.company_id = audit_logs.company_id)))));

CREATE POLICY "beat_plans_insert" ON "public"."beat_plans" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((company_id = get_my_company_id()));

CREATE POLICY "beat_plans_own" ON "public"."beat_plans" AS PERMISSIVE FOR ALL TO PUBLIC USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "beat_plans_read" ON "public"."beat_plans" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = get_my_company_id()));

CREATE POLICY "branches_admin" ON "public"."branches" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (s.company_id = branches.company_id)))));

CREATE POLICY "branches_read" ON "public"."branches" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "companies_own" ON "public"."companies" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "companies_own_read" ON "public"."companies" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((id = get_my_company_id()) OR (get_my_role() = 'super_admin'::text)));

CREATE POLICY "companies_super_admin" ON "public"."companies" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.role = 'super_admin'::text)))));

CREATE POLICY "companies_super_admin_write" ON "public"."companies" AS PERMISSIVE FOR ALL TO "authenticated" USING ((get_my_role() = 'super_admin'::text)) WITH CHECK ((get_my_role() = 'super_admin'::text));

CREATE POLICY "competitor_own" ON "public"."competitor_products" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM visits v
  WHERE ((v.id = competitor_products.visit_id) AND ((competitor_products.company_id IS NULL) OR (competitor_products.company_id = v.company_id)) AND (v.company_id IN ( SELECT s.company_id
           FROM supervisors s
          WHERE (s.user_id = auth.uid()))) AND ((v.supervisor_id IN ( SELECT s.id
           FROM supervisors s
          WHERE (s.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM supervisors actor
          WHERE ((actor.user_id = auth.uid()) AND (actor.role = ANY (ARRAY['admin'::text, 'branch_manager'::text])) AND (actor.company_id = v.company_id))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM visits v
  WHERE ((v.id = competitor_products.visit_id) AND ((competitor_products.company_id IS NULL) OR (competitor_products.company_id = v.company_id)) AND (v.company_id IN ( SELECT s.company_id
           FROM supervisors s
          WHERE (s.user_id = auth.uid()))) AND ((v.supervisor_id IN ( SELECT s.id
           FROM supervisors s
          WHERE (s.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
           FROM supervisors actor
          WHERE ((actor.user_id = auth.uid()) AND (actor.role = ANY (ARRAY['admin'::text, 'branch_manager'::text])) AND (actor.company_id = v.company_id)))))))));

CREATE POLICY "customers_company_read" ON "public"."customers" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((company_id = get_my_company_id()) AND ((get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text])) OR (supervisor_id = get_my_supervisor_id()) OR (supervisor_id IS NULL))));

CREATE POLICY "customers_insert" ON "public"."customers" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((company_id = get_my_company_id()));

CREATE POLICY "customers_read" ON "public"."customers" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = get_my_company_id()));

CREATE POLICY "customers_supervisor_insert" ON "public"."customers" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((company_id = get_my_company_id()));

CREATE POLICY "customers_supervisor_update" ON "public"."customers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((company_id = get_my_company_id()) AND ((supervisor_id = get_my_supervisor_id()) OR (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text, 'manager'::text]))))) WITH CHECK ((company_id = get_my_company_id()));

CREATE POLICY "customers_update" ON "public"."customers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((company_id = get_my_company_id()));

CREATE POLICY "field_surveys_tenant" ON "public"."field_surveys" AS PERMISSIVE FOR ALL TO "authenticated" USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE ((supervisors.user_id = auth.uid()) AND (supervisors.is_active = true))))) WITH CHECK ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE ((supervisors.user_id = auth.uid()) AND (supervisors.is_active = true)))));

CREATE POLICY "notifications_admin_insert" ON "public"."notifications" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.id = notifications.supervisor_id) AND (s.company_id = notifications.company_id))))));

CREATE POLICY "notifications_mark_own_read" ON "public"."notifications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((supervisor_id = ( SELECT private_rls.current_supervisor_id() AS current_supervisor_id)) AND (company_id = ( SELECT get_my_company_id() AS get_my_company_id)))) WITH CHECK (((supervisor_id = ( SELECT private_rls.current_supervisor_id() AS current_supervisor_id)) AND (company_id = ( SELECT get_my_company_id() AS get_my_company_id))));

CREATE POLICY "notifications_read_scoped" ON "public"."notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((supervisor_id = ( SELECT private_rls.current_supervisor_id() AS current_supervisor_id)) OR ((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'super_admin'::text])))));

CREATE POLICY "orders_company_all" ON "public"."orders" AS PERMISSIVE FOR ALL TO "authenticated" USING (((company_id IS NULL) OR (company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE ((supervisors.user_id = auth.uid()) OR (supervisors.id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM supervisors
  WHERE (((supervisors.user_id = auth.uid()) OR (supervisors.id = auth.uid())) AND (supervisors.role = 'super_admin'::text)))))) WITH CHECK (((company_id IS NULL) OR (company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE ((supervisors.user_id = auth.uid()) OR (supervisors.id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM supervisors
  WHERE (((supervisors.user_id = auth.uid()) OR (supervisors.id = auth.uid())) AND (supervisors.role = 'super_admin'::text))))));

CREATE POLICY "orders_insert_self_pending" ON "public"."orders" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((supervisor_id = ( SELECT private_rls.current_supervisor_id() AS current_supervisor_id)) AND (company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = 'supervisor'::text) AND (status = 'pending'::text) AND (quantity > 0) AND (unit_price IS NULL) AND (total_price IS NULL) AND (visit_id IS NOT NULL) AND (customer_id IS NOT NULL) AND (product_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM visits v
  WHERE ((v.id = orders.visit_id) AND (v.company_id = orders.company_id) AND (v.supervisor_id = orders.supervisor_id) AND (v.customer_id = orders.customer_id)))) AND (EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = orders.customer_id) AND (c.company_id = orders.company_id) AND (c.is_active = true)))) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = orders.product_id) AND (p.company_id = orders.company_id) AND (p.is_active = true))))));

CREATE POLICY "orders_read_scoped" ON "public"."orders" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND private_rls.can_access_supervisor(supervisor_id, company_id)));

CREATE POLICY "orders_update_self_pending" ON "public"."orders" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((supervisor_id = ( SELECT private_rls.current_supervisor_id() AS current_supervisor_id)) AND (company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = 'supervisor'::text) AND (status = 'pending'::text))) WITH CHECK (((supervisor_id = ( SELECT private_rls.current_supervisor_id() AS current_supervisor_id)) AND (company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = 'supervisor'::text) AND (status = ANY (ARRAY['pending'::text, 'cancelled'::text])) AND (quantity > 0)));

CREATE POLICY "planograms_read" ON "public"."planograms" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = get_my_company_id()));

CREATE POLICY "price_list_admin" ON "public"."price_list" AS PERMISSIVE FOR ALL TO PUBLIC USING (((get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (( SELECT products.company_id
   FROM products
  WHERE (products.id = price_list.product_id)) = get_my_company_id()))) WITH CHECK (((get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (( SELECT products.company_id
   FROM products
  WHERE (products.id = price_list.product_id)) = get_my_company_id())));

CREATE POLICY "price_list_admin_write" ON "public"."price_list" AS PERMISSIVE FOR ALL TO "authenticated" USING (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])))) WITH CHECK (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))));

CREATE POLICY "price_list_company_read" ON "public"."price_list" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = get_my_company_id()));

CREATE POLICY "price_list_read" ON "public"."price_list" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "price_list_super_admin" ON "public"."price_list" AS PERMISSIVE FOR ALL TO "authenticated" USING ((get_my_role() = 'super_admin'::text)) WITH CHECK ((get_my_role() = 'super_admin'::text));

CREATE POLICY "price_list_tenant_admin" ON "public"."price_list" AS PERMISSIVE FOR ALL TO "authenticated" USING (((get_my_role() = 'admin'::text) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = price_list.product_id) AND (p.company_id = get_my_company_id())))))) WITH CHECK (((get_my_role() = 'admin'::text) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = price_list.product_id) AND (p.company_id = get_my_company_id()))))));

CREATE POLICY "price_lists_admin_write" ON "public"."price_lists" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (s.company_id = price_lists.company_id)))));

CREATE POLICY "price_lists_company_read" ON "public"."price_lists" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "products_admin_update" ON "public"."products" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text, 'manager'::text])))) WITH CHECK (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text, 'manager'::text]))));

CREATE POLICY "products_admin_write" ON "public"."products" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text, 'manager'::text]))));

CREATE POLICY "products_company_read" ON "public"."products" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = get_my_company_id()));

CREATE POLICY "products_delete_admin" ON "public"."products" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'super_admin'::text]))));

CREATE POLICY "products_insert_admin" ON "public"."products" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'super_admin'::text]))));

CREATE POLICY "products_read_company" ON "public"."products" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = ( SELECT get_my_company_id() AS get_my_company_id)));

CREATE POLICY "products_update_admin" ON "public"."products" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'super_admin'::text])))) WITH CHECK (((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'super_admin'::text]))));

CREATE POLICY "supervisor_own_subs" ON "public"."push_subscriptions" AS PERMISSIVE FOR ALL TO "authenticated" USING ((supervisor_id IN ( SELECT supervisors.id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "regions_admin_write" ON "public"."regions" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (s.company_id = regions.company_id)))));

CREATE POLICY "regions_tenant_read" ON "public"."regions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "shelf_audit_own" ON "public"."shelf_audit" AS PERMISSIVE FOR ALL TO "authenticated" USING (((company_id = get_my_company_id()) AND ((supervisor_id = get_my_supervisor_id()) OR (get_my_role() = ANY (ARRAY['admin'::text, 'branch_manager'::text, 'super_admin'::text]))))) WITH CHECK (((company_id = get_my_company_id()) AND ((supervisor_id = get_my_supervisor_id()) OR (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])))));

CREATE POLICY "supervisor_permissions_delete_admin" ON "public"."supervisor_permissions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((company_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM supervisors actor
  WHERE ((actor.user_id = ( SELECT auth.uid() AS uid)) AND (actor.is_active IS TRUE) AND ((actor.role = 'super_admin'::text) OR ((actor.role = 'admin'::text) AND (actor.company_id = supervisor_permissions.company_id))))))));

CREATE POLICY "supervisor_permissions_insert_admin" ON "public"."supervisor_permissions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((supervisor_id IS NOT NULL) AND (company_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM supervisors actor
  WHERE ((actor.user_id = ( SELECT auth.uid() AS uid)) AND (actor.is_active IS TRUE) AND ((actor.role = 'super_admin'::text) OR ((actor.role = 'admin'::text) AND (actor.company_id = supervisor_permissions.company_id)))))) AND (EXISTS ( SELECT 1
   FROM supervisors target
  WHERE ((target.id = supervisor_permissions.supervisor_id) AND (target.company_id = supervisor_permissions.company_id))))));

CREATE POLICY "supervisor_permissions_read_scoped" ON "public"."supervisor_permissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM supervisors actor
  WHERE ((actor.user_id = ( SELECT auth.uid() AS uid)) AND (actor.is_active IS TRUE) AND (((actor.id = supervisor_permissions.supervisor_id) AND (actor.company_id = supervisor_permissions.company_id)) OR ((actor.role = 'admin'::text) AND (actor.company_id = supervisor_permissions.company_id)) OR (actor.role = 'super_admin'::text))))));

CREATE POLICY "supervisor_permissions_update_admin" ON "public"."supervisor_permissions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((company_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM supervisors actor
  WHERE ((actor.user_id = ( SELECT auth.uid() AS uid)) AND (actor.is_active IS TRUE) AND ((actor.role = 'super_admin'::text) OR ((actor.role = 'admin'::text) AND (actor.company_id = supervisor_permissions.company_id)))))))) WITH CHECK (((supervisor_id IS NOT NULL) AND (company_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM supervisors actor
  WHERE ((actor.user_id = ( SELECT auth.uid() AS uid)) AND (actor.is_active IS TRUE) AND ((actor.role = 'super_admin'::text) OR ((actor.role = 'admin'::text) AND (actor.company_id = supervisor_permissions.company_id)))))) AND (EXISTS ( SELECT 1
   FROM supervisors target
  WHERE ((target.id = supervisor_permissions.supervisor_id) AND (target.company_id = supervisor_permissions.company_id))))));

CREATE POLICY "training_progress_read" ON "public"."supervisor_training_progress" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "training_progress_write" ON "public"."supervisor_training_progress" AS PERMISSIVE FOR ALL TO PUBLIC USING (((supervisor_id IN ( SELECT supervisors.id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.company_id = supervisor_training_progress.company_id) AND (s.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));

CREATE POLICY "supervisor_read_own" ON "public"."supervisors" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));

CREATE POLICY "supervisors_admin_delete" ON "public"."supervisors" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text, 'manager'::text])) AND (role <> 'super_admin'::text)));

CREATE POLICY "supervisors_admin_read" ON "public"."supervisors" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'branch_manager'::text, 'super_admin'::text]))));

CREATE POLICY "supervisors_admin_update" ON "public"."supervisors" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text, 'manager'::text])))) WITH CHECK (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text, 'manager'::text]))));

CREATE POLICY "supervisors_self_update" ON "public"."supervisors" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "survey_responses_own" ON "public"."survey_responses" AS PERMISSIVE FOR ALL TO PUBLIC USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "surveys_read" ON "public"."surveys" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "targets_insert" ON "public"."targets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((company_id = get_my_company_id()));

CREATE POLICY "targets_own" ON "public"."targets" AS PERMISSIVE FOR ALL TO PUBLIC USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "targets_read" ON "public"."targets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = get_my_company_id()));

CREATE POLICY "training_courses_admin" ON "public"."training_courses" AS PERMISSIVE FOR ALL TO PUBLIC USING (((EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.company_id = training_courses.company_id) AND (s.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))) OR (EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.role = 'super_admin'::text))))));

CREATE POLICY "training_courses_read" ON "public"."training_courses" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "training_lessons_admin" ON "public"."training_lessons" AS PERMISSIVE FOR ALL TO PUBLIC USING (((EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.company_id = training_lessons.company_id) AND (s.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))) OR (EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.role = 'super_admin'::text))))));

CREATE POLICY "training_lessons_read" ON "public"."training_lessons" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "visit_tasks_own" ON "public"."visit_tasks" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM visits v
  WHERE ((v.id = visit_tasks.visit_id) AND (v.company_id = visit_tasks.company_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM visits v
  WHERE ((v.id = visit_tasks.visit_id) AND (v.company_id = visit_tasks.company_id)))));

CREATE POLICY "visits_insert" ON "public"."visits" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((company_id = get_my_company_id()) AND ((supervisor_id = get_my_supervisor_id()) OR (get_my_role() = ANY (ARRAY['admin'::text, 'branch_manager'::text, 'super_admin'::text])))));

CREATE POLICY "visits_own" ON "public"."visits" AS PERMISSIVE FOR ALL TO PUBLIC USING (((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))) AND ((supervisor_id IN ( SELECT supervisors.id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.role = ANY (ARRAY['admin'::text, 'branch_manager'::text, 'super_admin'::text]))))))));

REVOKE ALL ON SCHEMA "public" FROM PUBLIC;

REVOKE ALL ON SCHEMA "private_rls" FROM PUBLIC;

GRANT USAGE ON SCHEMA "public" TO "pg_database_owner";

GRANT CREATE ON SCHEMA "public" TO "pg_database_owner";

GRANT USAGE ON SCHEMA "public" TO PUBLIC;

GRANT USAGE ON SCHEMA "public" TO "postgres";

GRANT USAGE ON SCHEMA "public" TO "anon";

GRANT USAGE ON SCHEMA "public" TO "authenticated";

GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT USAGE ON SCHEMA "private_rls" TO "postgres";

GRANT CREATE ON SCHEMA "private_rls" TO "postgres";

GRANT USAGE ON SCHEMA "private_rls" TO "authenticated";

GRANT USAGE ON SCHEMA "private_rls" TO "service_role";

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;

GRANT INSERT ON TABLE "public"."branches" TO "postgres";

GRANT SELECT ON TABLE "public"."branches" TO "postgres";

GRANT UPDATE ON TABLE "public"."branches" TO "postgres";

GRANT DELETE ON TABLE "public"."branches" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."branches" TO "postgres";

GRANT REFERENCES ON TABLE "public"."branches" TO "postgres";

GRANT TRIGGER ON TABLE "public"."branches" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."branches" TO "postgres";

GRANT INSERT ON TABLE "public"."branches" TO "anon";

GRANT SELECT ON TABLE "public"."branches" TO "anon";

GRANT UPDATE ON TABLE "public"."branches" TO "anon";

GRANT DELETE ON TABLE "public"."branches" TO "anon";

GRANT TRUNCATE ON TABLE "public"."branches" TO "anon";

GRANT REFERENCES ON TABLE "public"."branches" TO "anon";

GRANT TRIGGER ON TABLE "public"."branches" TO "anon";

GRANT MAINTAIN ON TABLE "public"."branches" TO "anon";

GRANT INSERT ON TABLE "public"."branches" TO "authenticated";

GRANT SELECT ON TABLE "public"."branches" TO "authenticated";

GRANT UPDATE ON TABLE "public"."branches" TO "authenticated";

GRANT DELETE ON TABLE "public"."branches" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."branches" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."branches" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."branches" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."branches" TO "authenticated";

GRANT INSERT ON TABLE "public"."branches" TO "service_role";

GRANT SELECT ON TABLE "public"."branches" TO "service_role";

GRANT UPDATE ON TABLE "public"."branches" TO "service_role";

GRANT DELETE ON TABLE "public"."branches" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."branches" TO "service_role";

GRANT REFERENCES ON TABLE "public"."branches" TO "service_role";

GRANT TRIGGER ON TABLE "public"."branches" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."branches" TO "service_role";

GRANT INSERT ON TABLE "public"."notifications" TO "postgres";

GRANT SELECT ON TABLE "public"."notifications" TO "postgres";

GRANT UPDATE ON TABLE "public"."notifications" TO "postgres";

GRANT DELETE ON TABLE "public"."notifications" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."notifications" TO "postgres";

GRANT REFERENCES ON TABLE "public"."notifications" TO "postgres";

GRANT TRIGGER ON TABLE "public"."notifications" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."notifications" TO "postgres";

GRANT INSERT ON TABLE "public"."notifications" TO "service_role";

GRANT SELECT ON TABLE "public"."notifications" TO "service_role";

GRANT UPDATE ON TABLE "public"."notifications" TO "service_role";

GRANT DELETE ON TABLE "public"."notifications" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."notifications" TO "service_role";

GRANT REFERENCES ON TABLE "public"."notifications" TO "service_role";

GRANT TRIGGER ON TABLE "public"."notifications" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."notifications" TO "service_role";

GRANT SELECT ON TABLE "public"."notifications" TO "authenticated";

GRANT INSERT ON TABLE "public"."price_list" TO "postgres";

GRANT SELECT ON TABLE "public"."price_list" TO "postgres";

GRANT UPDATE ON TABLE "public"."price_list" TO "postgres";

GRANT DELETE ON TABLE "public"."price_list" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."price_list" TO "postgres";

GRANT REFERENCES ON TABLE "public"."price_list" TO "postgres";

GRANT TRIGGER ON TABLE "public"."price_list" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."price_list" TO "postgres";

GRANT INSERT ON TABLE "public"."price_list" TO "anon";

GRANT SELECT ON TABLE "public"."price_list" TO "anon";

GRANT UPDATE ON TABLE "public"."price_list" TO "anon";

GRANT DELETE ON TABLE "public"."price_list" TO "anon";

GRANT TRUNCATE ON TABLE "public"."price_list" TO "anon";

GRANT REFERENCES ON TABLE "public"."price_list" TO "anon";

GRANT TRIGGER ON TABLE "public"."price_list" TO "anon";

GRANT MAINTAIN ON TABLE "public"."price_list" TO "anon";

GRANT INSERT ON TABLE "public"."price_list" TO "authenticated";

GRANT SELECT ON TABLE "public"."price_list" TO "authenticated";

GRANT UPDATE ON TABLE "public"."price_list" TO "authenticated";

GRANT DELETE ON TABLE "public"."price_list" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."price_list" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."price_list" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."price_list" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."price_list" TO "authenticated";

GRANT INSERT ON TABLE "public"."price_list" TO "service_role";

GRANT SELECT ON TABLE "public"."price_list" TO "service_role";

GRANT UPDATE ON TABLE "public"."price_list" TO "service_role";

GRANT DELETE ON TABLE "public"."price_list" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."price_list" TO "service_role";

GRANT REFERENCES ON TABLE "public"."price_list" TO "service_role";

GRANT TRIGGER ON TABLE "public"."price_list" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."price_list" TO "service_role";

GRANT INSERT ON TABLE "public"."visit_tasks" TO "postgres";

GRANT SELECT ON TABLE "public"."visit_tasks" TO "postgres";

GRANT UPDATE ON TABLE "public"."visit_tasks" TO "postgres";

GRANT DELETE ON TABLE "public"."visit_tasks" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."visit_tasks" TO "postgres";

GRANT REFERENCES ON TABLE "public"."visit_tasks" TO "postgres";

GRANT TRIGGER ON TABLE "public"."visit_tasks" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."visit_tasks" TO "postgres";

GRANT INSERT ON TABLE "public"."visit_tasks" TO "anon";

GRANT SELECT ON TABLE "public"."visit_tasks" TO "anon";

GRANT UPDATE ON TABLE "public"."visit_tasks" TO "anon";

GRANT DELETE ON TABLE "public"."visit_tasks" TO "anon";

GRANT TRUNCATE ON TABLE "public"."visit_tasks" TO "anon";

GRANT REFERENCES ON TABLE "public"."visit_tasks" TO "anon";

GRANT TRIGGER ON TABLE "public"."visit_tasks" TO "anon";

GRANT MAINTAIN ON TABLE "public"."visit_tasks" TO "anon";

GRANT INSERT ON TABLE "public"."visit_tasks" TO "authenticated";

GRANT SELECT ON TABLE "public"."visit_tasks" TO "authenticated";

GRANT UPDATE ON TABLE "public"."visit_tasks" TO "authenticated";

GRANT DELETE ON TABLE "public"."visit_tasks" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."visit_tasks" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."visit_tasks" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."visit_tasks" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."visit_tasks" TO "authenticated";

GRANT INSERT ON TABLE "public"."visit_tasks" TO "service_role";

GRANT SELECT ON TABLE "public"."visit_tasks" TO "service_role";

GRANT UPDATE ON TABLE "public"."visit_tasks" TO "service_role";

GRANT DELETE ON TABLE "public"."visit_tasks" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."visit_tasks" TO "service_role";

GRANT REFERENCES ON TABLE "public"."visit_tasks" TO "service_role";

GRANT TRIGGER ON TABLE "public"."visit_tasks" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."visit_tasks" TO "service_role";

GRANT INSERT ON TABLE "public"."beat_plans" TO "postgres";

GRANT SELECT ON TABLE "public"."beat_plans" TO "postgres";

GRANT UPDATE ON TABLE "public"."beat_plans" TO "postgres";

GRANT DELETE ON TABLE "public"."beat_plans" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."beat_plans" TO "postgres";

GRANT REFERENCES ON TABLE "public"."beat_plans" TO "postgres";

GRANT TRIGGER ON TABLE "public"."beat_plans" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."beat_plans" TO "postgres";

GRANT INSERT ON TABLE "public"."beat_plans" TO "anon";

GRANT SELECT ON TABLE "public"."beat_plans" TO "anon";

GRANT UPDATE ON TABLE "public"."beat_plans" TO "anon";

GRANT DELETE ON TABLE "public"."beat_plans" TO "anon";

GRANT TRUNCATE ON TABLE "public"."beat_plans" TO "anon";

GRANT REFERENCES ON TABLE "public"."beat_plans" TO "anon";

GRANT TRIGGER ON TABLE "public"."beat_plans" TO "anon";

GRANT MAINTAIN ON TABLE "public"."beat_plans" TO "anon";

GRANT INSERT ON TABLE "public"."beat_plans" TO "authenticated";

GRANT SELECT ON TABLE "public"."beat_plans" TO "authenticated";

GRANT UPDATE ON TABLE "public"."beat_plans" TO "authenticated";

GRANT DELETE ON TABLE "public"."beat_plans" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."beat_plans" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."beat_plans" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."beat_plans" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."beat_plans" TO "authenticated";

GRANT INSERT ON TABLE "public"."beat_plans" TO "service_role";

GRANT SELECT ON TABLE "public"."beat_plans" TO "service_role";

GRANT UPDATE ON TABLE "public"."beat_plans" TO "service_role";

GRANT DELETE ON TABLE "public"."beat_plans" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."beat_plans" TO "service_role";

GRANT REFERENCES ON TABLE "public"."beat_plans" TO "service_role";

GRANT TRIGGER ON TABLE "public"."beat_plans" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."beat_plans" TO "service_role";

GRANT INSERT ON TABLE "public"."audit_logs" TO "postgres";

GRANT SELECT ON TABLE "public"."audit_logs" TO "postgres";

GRANT UPDATE ON TABLE "public"."audit_logs" TO "postgres";

GRANT DELETE ON TABLE "public"."audit_logs" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."audit_logs" TO "postgres";

GRANT REFERENCES ON TABLE "public"."audit_logs" TO "postgres";

GRANT TRIGGER ON TABLE "public"."audit_logs" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."audit_logs" TO "postgres";

GRANT INSERT ON TABLE "public"."audit_logs" TO "anon";

GRANT SELECT ON TABLE "public"."audit_logs" TO "anon";

GRANT UPDATE ON TABLE "public"."audit_logs" TO "anon";

GRANT DELETE ON TABLE "public"."audit_logs" TO "anon";

GRANT TRUNCATE ON TABLE "public"."audit_logs" TO "anon";

GRANT REFERENCES ON TABLE "public"."audit_logs" TO "anon";

GRANT TRIGGER ON TABLE "public"."audit_logs" TO "anon";

GRANT MAINTAIN ON TABLE "public"."audit_logs" TO "anon";

GRANT INSERT ON TABLE "public"."audit_logs" TO "authenticated";

GRANT SELECT ON TABLE "public"."audit_logs" TO "authenticated";

GRANT UPDATE ON TABLE "public"."audit_logs" TO "authenticated";

GRANT DELETE ON TABLE "public"."audit_logs" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."audit_logs" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."audit_logs" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."audit_logs" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."audit_logs" TO "authenticated";

GRANT INSERT ON TABLE "public"."audit_logs" TO "service_role";

GRANT SELECT ON TABLE "public"."audit_logs" TO "service_role";

GRANT UPDATE ON TABLE "public"."audit_logs" TO "service_role";

GRANT DELETE ON TABLE "public"."audit_logs" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."audit_logs" TO "service_role";

GRANT REFERENCES ON TABLE "public"."audit_logs" TO "service_role";

GRANT TRIGGER ON TABLE "public"."audit_logs" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."audit_logs" TO "service_role";

GRANT INSERT ON TABLE "public"."surveys" TO "postgres";

GRANT SELECT ON TABLE "public"."surveys" TO "postgres";

GRANT UPDATE ON TABLE "public"."surveys" TO "postgres";

GRANT DELETE ON TABLE "public"."surveys" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."surveys" TO "postgres";

GRANT REFERENCES ON TABLE "public"."surveys" TO "postgres";

GRANT TRIGGER ON TABLE "public"."surveys" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."surveys" TO "postgres";

GRANT INSERT ON TABLE "public"."surveys" TO "anon";

GRANT SELECT ON TABLE "public"."surveys" TO "anon";

GRANT UPDATE ON TABLE "public"."surveys" TO "anon";

GRANT DELETE ON TABLE "public"."surveys" TO "anon";

GRANT TRUNCATE ON TABLE "public"."surveys" TO "anon";

GRANT REFERENCES ON TABLE "public"."surveys" TO "anon";

GRANT TRIGGER ON TABLE "public"."surveys" TO "anon";

GRANT MAINTAIN ON TABLE "public"."surveys" TO "anon";

GRANT INSERT ON TABLE "public"."surveys" TO "authenticated";

GRANT SELECT ON TABLE "public"."surveys" TO "authenticated";

GRANT UPDATE ON TABLE "public"."surveys" TO "authenticated";

GRANT DELETE ON TABLE "public"."surveys" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."surveys" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."surveys" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."surveys" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."surveys" TO "authenticated";

GRANT INSERT ON TABLE "public"."surveys" TO "service_role";

GRANT SELECT ON TABLE "public"."surveys" TO "service_role";

GRANT UPDATE ON TABLE "public"."surveys" TO "service_role";

GRANT DELETE ON TABLE "public"."surveys" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."surveys" TO "service_role";

GRANT REFERENCES ON TABLE "public"."surveys" TO "service_role";

GRANT TRIGGER ON TABLE "public"."surveys" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."surveys" TO "service_role";

GRANT INSERT ON TABLE "public"."survey_responses" TO "postgres";

GRANT SELECT ON TABLE "public"."survey_responses" TO "postgres";

GRANT UPDATE ON TABLE "public"."survey_responses" TO "postgres";

GRANT DELETE ON TABLE "public"."survey_responses" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."survey_responses" TO "postgres";

GRANT REFERENCES ON TABLE "public"."survey_responses" TO "postgres";

GRANT TRIGGER ON TABLE "public"."survey_responses" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."survey_responses" TO "postgres";

GRANT INSERT ON TABLE "public"."survey_responses" TO "anon";

GRANT SELECT ON TABLE "public"."survey_responses" TO "anon";

GRANT UPDATE ON TABLE "public"."survey_responses" TO "anon";

GRANT DELETE ON TABLE "public"."survey_responses" TO "anon";

GRANT TRUNCATE ON TABLE "public"."survey_responses" TO "anon";

GRANT REFERENCES ON TABLE "public"."survey_responses" TO "anon";

GRANT TRIGGER ON TABLE "public"."survey_responses" TO "anon";

GRANT MAINTAIN ON TABLE "public"."survey_responses" TO "anon";

GRANT INSERT ON TABLE "public"."survey_responses" TO "authenticated";

GRANT SELECT ON TABLE "public"."survey_responses" TO "authenticated";

GRANT UPDATE ON TABLE "public"."survey_responses" TO "authenticated";

GRANT DELETE ON TABLE "public"."survey_responses" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."survey_responses" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."survey_responses" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."survey_responses" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."survey_responses" TO "authenticated";

GRANT INSERT ON TABLE "public"."survey_responses" TO "service_role";

GRANT SELECT ON TABLE "public"."survey_responses" TO "service_role";

GRANT UPDATE ON TABLE "public"."survey_responses" TO "service_role";

GRANT DELETE ON TABLE "public"."survey_responses" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."survey_responses" TO "service_role";

GRANT REFERENCES ON TABLE "public"."survey_responses" TO "service_role";

GRANT TRIGGER ON TABLE "public"."survey_responses" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."survey_responses" TO "service_role";

GRANT INSERT ON TABLE "public"."supervisors" TO "postgres";

GRANT SELECT ON TABLE "public"."supervisors" TO "postgres";

GRANT UPDATE ON TABLE "public"."supervisors" TO "postgres";

GRANT DELETE ON TABLE "public"."supervisors" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."supervisors" TO "postgres";

GRANT REFERENCES ON TABLE "public"."supervisors" TO "postgres";

GRANT TRIGGER ON TABLE "public"."supervisors" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."supervisors" TO "postgres";

GRANT INSERT ON TABLE "public"."supervisors" TO "anon";

GRANT SELECT ON TABLE "public"."supervisors" TO "anon";

GRANT DELETE ON TABLE "public"."supervisors" TO "anon";

GRANT REFERENCES ON TABLE "public"."supervisors" TO "anon";

GRANT TRIGGER ON TABLE "public"."supervisors" TO "anon";

GRANT MAINTAIN ON TABLE "public"."supervisors" TO "anon";

GRANT INSERT ON TABLE "public"."supervisors" TO "authenticated";

GRANT SELECT ON TABLE "public"."supervisors" TO "authenticated";

GRANT DELETE ON TABLE "public"."supervisors" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."supervisors" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."supervisors" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."supervisors" TO "authenticated";

GRANT INSERT ON TABLE "public"."supervisors" TO "service_role";

GRANT SELECT ON TABLE "public"."supervisors" TO "service_role";

GRANT UPDATE ON TABLE "public"."supervisors" TO "service_role";

GRANT DELETE ON TABLE "public"."supervisors" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."supervisors" TO "service_role";

GRANT REFERENCES ON TABLE "public"."supervisors" TO "service_role";

GRANT TRIGGER ON TABLE "public"."supervisors" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."supervisors" TO "service_role";

GRANT INSERT ON TABLE "public"."supervisor_permissions" TO "postgres";

GRANT SELECT ON TABLE "public"."supervisor_permissions" TO "postgres";

GRANT UPDATE ON TABLE "public"."supervisor_permissions" TO "postgres";

GRANT DELETE ON TABLE "public"."supervisor_permissions" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."supervisor_permissions" TO "postgres";

GRANT REFERENCES ON TABLE "public"."supervisor_permissions" TO "postgres";

GRANT TRIGGER ON TABLE "public"."supervisor_permissions" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."supervisor_permissions" TO "postgres";

GRANT INSERT ON TABLE "public"."supervisor_permissions" TO "authenticated";

GRANT SELECT ON TABLE "public"."supervisor_permissions" TO "authenticated";

GRANT UPDATE ON TABLE "public"."supervisor_permissions" TO "authenticated";

GRANT DELETE ON TABLE "public"."supervisor_permissions" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."supervisor_permissions" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."supervisor_permissions" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."supervisor_permissions" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."supervisor_permissions" TO "authenticated";

GRANT INSERT ON TABLE "public"."supervisor_permissions" TO "service_role";

GRANT SELECT ON TABLE "public"."supervisor_permissions" TO "service_role";

GRANT UPDATE ON TABLE "public"."supervisor_permissions" TO "service_role";

GRANT DELETE ON TABLE "public"."supervisor_permissions" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."supervisor_permissions" TO "service_role";

GRANT REFERENCES ON TABLE "public"."supervisor_permissions" TO "service_role";

GRANT TRIGGER ON TABLE "public"."supervisor_permissions" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."supervisor_permissions" TO "service_role";

GRANT INSERT ON TABLE "public"."companies" TO "postgres";

GRANT SELECT ON TABLE "public"."companies" TO "postgres";

GRANT UPDATE ON TABLE "public"."companies" TO "postgres";

GRANT DELETE ON TABLE "public"."companies" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."companies" TO "postgres";

GRANT REFERENCES ON TABLE "public"."companies" TO "postgres";

GRANT TRIGGER ON TABLE "public"."companies" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."companies" TO "postgres";

GRANT INSERT ON TABLE "public"."companies" TO "anon";

GRANT SELECT ON TABLE "public"."companies" TO "anon";

GRANT UPDATE ON TABLE "public"."companies" TO "anon";

GRANT DELETE ON TABLE "public"."companies" TO "anon";

GRANT TRUNCATE ON TABLE "public"."companies" TO "anon";

GRANT REFERENCES ON TABLE "public"."companies" TO "anon";

GRANT TRIGGER ON TABLE "public"."companies" TO "anon";

GRANT MAINTAIN ON TABLE "public"."companies" TO "anon";

GRANT INSERT ON TABLE "public"."companies" TO "authenticated";

GRANT SELECT ON TABLE "public"."companies" TO "authenticated";

GRANT UPDATE ON TABLE "public"."companies" TO "authenticated";

GRANT DELETE ON TABLE "public"."companies" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."companies" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."companies" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."companies" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."companies" TO "authenticated";

GRANT INSERT ON TABLE "public"."companies" TO "service_role";

GRANT SELECT ON TABLE "public"."companies" TO "service_role";

GRANT UPDATE ON TABLE "public"."companies" TO "service_role";

GRANT DELETE ON TABLE "public"."companies" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."companies" TO "service_role";

GRANT REFERENCES ON TABLE "public"."companies" TO "service_role";

GRANT TRIGGER ON TABLE "public"."companies" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."companies" TO "service_role";

GRANT INSERT ON TABLE "public"."app_settings" TO "postgres";

GRANT SELECT ON TABLE "public"."app_settings" TO "postgres";

GRANT UPDATE ON TABLE "public"."app_settings" TO "postgres";

GRANT DELETE ON TABLE "public"."app_settings" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."app_settings" TO "postgres";

GRANT REFERENCES ON TABLE "public"."app_settings" TO "postgres";

GRANT TRIGGER ON TABLE "public"."app_settings" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."app_settings" TO "postgres";

GRANT INSERT ON TABLE "public"."app_settings" TO "anon";

GRANT SELECT ON TABLE "public"."app_settings" TO "anon";

GRANT UPDATE ON TABLE "public"."app_settings" TO "anon";

GRANT DELETE ON TABLE "public"."app_settings" TO "anon";

GRANT TRUNCATE ON TABLE "public"."app_settings" TO "anon";

GRANT REFERENCES ON TABLE "public"."app_settings" TO "anon";

GRANT TRIGGER ON TABLE "public"."app_settings" TO "anon";

GRANT MAINTAIN ON TABLE "public"."app_settings" TO "anon";

GRANT INSERT ON TABLE "public"."app_settings" TO "authenticated";

GRANT SELECT ON TABLE "public"."app_settings" TO "authenticated";

GRANT UPDATE ON TABLE "public"."app_settings" TO "authenticated";

GRANT DELETE ON TABLE "public"."app_settings" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."app_settings" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."app_settings" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."app_settings" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."app_settings" TO "authenticated";

GRANT INSERT ON TABLE "public"."app_settings" TO "service_role";

GRANT SELECT ON TABLE "public"."app_settings" TO "service_role";

GRANT UPDATE ON TABLE "public"."app_settings" TO "service_role";

GRANT DELETE ON TABLE "public"."app_settings" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."app_settings" TO "service_role";

GRANT REFERENCES ON TABLE "public"."app_settings" TO "service_role";

GRANT TRIGGER ON TABLE "public"."app_settings" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."app_settings" TO "service_role";

GRANT INSERT ON TABLE "public"."customers" TO "postgres";

GRANT SELECT ON TABLE "public"."customers" TO "postgres";

GRANT UPDATE ON TABLE "public"."customers" TO "postgres";

GRANT DELETE ON TABLE "public"."customers" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."customers" TO "postgres";

GRANT REFERENCES ON TABLE "public"."customers" TO "postgres";

GRANT TRIGGER ON TABLE "public"."customers" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."customers" TO "postgres";

GRANT INSERT ON TABLE "public"."customers" TO "anon";

GRANT SELECT ON TABLE "public"."customers" TO "anon";

GRANT UPDATE ON TABLE "public"."customers" TO "anon";

GRANT DELETE ON TABLE "public"."customers" TO "anon";

GRANT TRUNCATE ON TABLE "public"."customers" TO "anon";

GRANT REFERENCES ON TABLE "public"."customers" TO "anon";

GRANT TRIGGER ON TABLE "public"."customers" TO "anon";

GRANT MAINTAIN ON TABLE "public"."customers" TO "anon";

GRANT INSERT ON TABLE "public"."customers" TO "authenticated";

GRANT SELECT ON TABLE "public"."customers" TO "authenticated";

GRANT UPDATE ON TABLE "public"."customers" TO "authenticated";

GRANT DELETE ON TABLE "public"."customers" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."customers" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."customers" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."customers" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."customers" TO "authenticated";

GRANT INSERT ON TABLE "public"."customers" TO "service_role";

GRANT SELECT ON TABLE "public"."customers" TO "service_role";

GRANT UPDATE ON TABLE "public"."customers" TO "service_role";

GRANT DELETE ON TABLE "public"."customers" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."customers" TO "service_role";

GRANT REFERENCES ON TABLE "public"."customers" TO "service_role";

GRANT TRIGGER ON TABLE "public"."customers" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."customers" TO "service_role";

GRANT INSERT ON TABLE "public"."competitor_products" TO "postgres";

GRANT SELECT ON TABLE "public"."competitor_products" TO "postgres";

GRANT UPDATE ON TABLE "public"."competitor_products" TO "postgres";

GRANT DELETE ON TABLE "public"."competitor_products" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."competitor_products" TO "postgres";

GRANT REFERENCES ON TABLE "public"."competitor_products" TO "postgres";

GRANT TRIGGER ON TABLE "public"."competitor_products" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."competitor_products" TO "postgres";

GRANT INSERT ON TABLE "public"."competitor_products" TO "anon";

GRANT SELECT ON TABLE "public"."competitor_products" TO "anon";

GRANT UPDATE ON TABLE "public"."competitor_products" TO "anon";

GRANT DELETE ON TABLE "public"."competitor_products" TO "anon";

GRANT TRUNCATE ON TABLE "public"."competitor_products" TO "anon";

GRANT REFERENCES ON TABLE "public"."competitor_products" TO "anon";

GRANT TRIGGER ON TABLE "public"."competitor_products" TO "anon";

GRANT MAINTAIN ON TABLE "public"."competitor_products" TO "anon";

GRANT INSERT ON TABLE "public"."competitor_products" TO "authenticated";

GRANT SELECT ON TABLE "public"."competitor_products" TO "authenticated";

GRANT UPDATE ON TABLE "public"."competitor_products" TO "authenticated";

GRANT DELETE ON TABLE "public"."competitor_products" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."competitor_products" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."competitor_products" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."competitor_products" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."competitor_products" TO "authenticated";

GRANT INSERT ON TABLE "public"."competitor_products" TO "service_role";

GRANT SELECT ON TABLE "public"."competitor_products" TO "service_role";

GRANT UPDATE ON TABLE "public"."competitor_products" TO "service_role";

GRANT DELETE ON TABLE "public"."competitor_products" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."competitor_products" TO "service_role";

GRANT REFERENCES ON TABLE "public"."competitor_products" TO "service_role";

GRANT TRIGGER ON TABLE "public"."competitor_products" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."competitor_products" TO "service_role";

GRANT INSERT ON TABLE "public"."planograms" TO "postgres";

GRANT SELECT ON TABLE "public"."planograms" TO "postgres";

GRANT UPDATE ON TABLE "public"."planograms" TO "postgres";

GRANT DELETE ON TABLE "public"."planograms" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."planograms" TO "postgres";

GRANT REFERENCES ON TABLE "public"."planograms" TO "postgres";

GRANT TRIGGER ON TABLE "public"."planograms" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."planograms" TO "postgres";

GRANT INSERT ON TABLE "public"."planograms" TO "anon";

GRANT SELECT ON TABLE "public"."planograms" TO "anon";

GRANT UPDATE ON TABLE "public"."planograms" TO "anon";

GRANT DELETE ON TABLE "public"."planograms" TO "anon";

GRANT TRUNCATE ON TABLE "public"."planograms" TO "anon";

GRANT REFERENCES ON TABLE "public"."planograms" TO "anon";

GRANT TRIGGER ON TABLE "public"."planograms" TO "anon";

GRANT MAINTAIN ON TABLE "public"."planograms" TO "anon";

GRANT INSERT ON TABLE "public"."planograms" TO "authenticated";

GRANT SELECT ON TABLE "public"."planograms" TO "authenticated";

GRANT UPDATE ON TABLE "public"."planograms" TO "authenticated";

GRANT DELETE ON TABLE "public"."planograms" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."planograms" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."planograms" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."planograms" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."planograms" TO "authenticated";

GRANT INSERT ON TABLE "public"."planograms" TO "service_role";

GRANT SELECT ON TABLE "public"."planograms" TO "service_role";

GRANT UPDATE ON TABLE "public"."planograms" TO "service_role";

GRANT DELETE ON TABLE "public"."planograms" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."planograms" TO "service_role";

GRANT REFERENCES ON TABLE "public"."planograms" TO "service_role";

GRANT TRIGGER ON TABLE "public"."planograms" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."planograms" TO "service_role";

GRANT INSERT ON TABLE "public"."orders" TO "postgres";

GRANT SELECT ON TABLE "public"."orders" TO "postgres";

GRANT UPDATE ON TABLE "public"."orders" TO "postgres";

GRANT DELETE ON TABLE "public"."orders" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."orders" TO "postgres";

GRANT REFERENCES ON TABLE "public"."orders" TO "postgres";

GRANT TRIGGER ON TABLE "public"."orders" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."orders" TO "postgres";

GRANT INSERT ON TABLE "public"."orders" TO "service_role";

GRANT SELECT ON TABLE "public"."orders" TO "service_role";

GRANT UPDATE ON TABLE "public"."orders" TO "service_role";

GRANT DELETE ON TABLE "public"."orders" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."orders" TO "service_role";

GRANT REFERENCES ON TABLE "public"."orders" TO "service_role";

GRANT TRIGGER ON TABLE "public"."orders" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."orders" TO "service_role";

GRANT SELECT ON TABLE "public"."orders" TO "authenticated";

GRANT INSERT ON TABLE "public"."vw_oor_analysis" TO "postgres";

GRANT SELECT ON TABLE "public"."vw_oor_analysis" TO "postgres";

GRANT UPDATE ON TABLE "public"."vw_oor_analysis" TO "postgres";

GRANT DELETE ON TABLE "public"."vw_oor_analysis" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."vw_oor_analysis" TO "postgres";

GRANT REFERENCES ON TABLE "public"."vw_oor_analysis" TO "postgres";

GRANT TRIGGER ON TABLE "public"."vw_oor_analysis" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."vw_oor_analysis" TO "postgres";

GRANT INSERT ON TABLE "public"."vw_oor_analysis" TO "anon";

GRANT UPDATE ON TABLE "public"."vw_oor_analysis" TO "anon";

GRANT DELETE ON TABLE "public"."vw_oor_analysis" TO "anon";

GRANT TRUNCATE ON TABLE "public"."vw_oor_analysis" TO "anon";

GRANT REFERENCES ON TABLE "public"."vw_oor_analysis" TO "anon";

GRANT TRIGGER ON TABLE "public"."vw_oor_analysis" TO "anon";

GRANT MAINTAIN ON TABLE "public"."vw_oor_analysis" TO "anon";

GRANT INSERT ON TABLE "public"."vw_oor_analysis" TO "authenticated";

GRANT SELECT ON TABLE "public"."vw_oor_analysis" TO "authenticated";

GRANT UPDATE ON TABLE "public"."vw_oor_analysis" TO "authenticated";

GRANT DELETE ON TABLE "public"."vw_oor_analysis" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."vw_oor_analysis" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."vw_oor_analysis" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."vw_oor_analysis" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."vw_oor_analysis" TO "authenticated";

GRANT INSERT ON TABLE "public"."vw_oor_analysis" TO "service_role";

GRANT SELECT ON TABLE "public"."vw_oor_analysis" TO "service_role";

GRANT UPDATE ON TABLE "public"."vw_oor_analysis" TO "service_role";

GRANT DELETE ON TABLE "public"."vw_oor_analysis" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."vw_oor_analysis" TO "service_role";

GRANT REFERENCES ON TABLE "public"."vw_oor_analysis" TO "service_role";

GRANT TRIGGER ON TABLE "public"."vw_oor_analysis" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."vw_oor_analysis" TO "service_role";

GRANT INSERT ON TABLE "public"."vw_daily_kpi_supervisor" TO "postgres";

GRANT SELECT ON TABLE "public"."vw_daily_kpi_supervisor" TO "postgres";

GRANT UPDATE ON TABLE "public"."vw_daily_kpi_supervisor" TO "postgres";

GRANT DELETE ON TABLE "public"."vw_daily_kpi_supervisor" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."vw_daily_kpi_supervisor" TO "postgres";

GRANT REFERENCES ON TABLE "public"."vw_daily_kpi_supervisor" TO "postgres";

GRANT TRIGGER ON TABLE "public"."vw_daily_kpi_supervisor" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."vw_daily_kpi_supervisor" TO "postgres";

GRANT INSERT ON TABLE "public"."vw_daily_kpi_supervisor" TO "anon";

GRANT UPDATE ON TABLE "public"."vw_daily_kpi_supervisor" TO "anon";

GRANT DELETE ON TABLE "public"."vw_daily_kpi_supervisor" TO "anon";

GRANT TRUNCATE ON TABLE "public"."vw_daily_kpi_supervisor" TO "anon";

GRANT REFERENCES ON TABLE "public"."vw_daily_kpi_supervisor" TO "anon";

GRANT TRIGGER ON TABLE "public"."vw_daily_kpi_supervisor" TO "anon";

GRANT MAINTAIN ON TABLE "public"."vw_daily_kpi_supervisor" TO "anon";

GRANT INSERT ON TABLE "public"."vw_daily_kpi_supervisor" TO "authenticated";

GRANT SELECT ON TABLE "public"."vw_daily_kpi_supervisor" TO "authenticated";

GRANT UPDATE ON TABLE "public"."vw_daily_kpi_supervisor" TO "authenticated";

GRANT DELETE ON TABLE "public"."vw_daily_kpi_supervisor" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."vw_daily_kpi_supervisor" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."vw_daily_kpi_supervisor" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."vw_daily_kpi_supervisor" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."vw_daily_kpi_supervisor" TO "authenticated";

GRANT INSERT ON TABLE "public"."vw_daily_kpi_supervisor" TO "service_role";

GRANT SELECT ON TABLE "public"."vw_daily_kpi_supervisor" TO "service_role";

GRANT UPDATE ON TABLE "public"."vw_daily_kpi_supervisor" TO "service_role";

GRANT DELETE ON TABLE "public"."vw_daily_kpi_supervisor" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."vw_daily_kpi_supervisor" TO "service_role";

GRANT REFERENCES ON TABLE "public"."vw_daily_kpi_supervisor" TO "service_role";

GRANT TRIGGER ON TABLE "public"."vw_daily_kpi_supervisor" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."vw_daily_kpi_supervisor" TO "service_role";

GRANT INSERT ON TABLE "public"."vw_perfect_store_index" TO "postgres";

GRANT SELECT ON TABLE "public"."vw_perfect_store_index" TO "postgres";

GRANT UPDATE ON TABLE "public"."vw_perfect_store_index" TO "postgres";

GRANT DELETE ON TABLE "public"."vw_perfect_store_index" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."vw_perfect_store_index" TO "postgres";

GRANT REFERENCES ON TABLE "public"."vw_perfect_store_index" TO "postgres";

GRANT TRIGGER ON TABLE "public"."vw_perfect_store_index" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."vw_perfect_store_index" TO "postgres";

GRANT INSERT ON TABLE "public"."vw_perfect_store_index" TO "anon";

GRANT UPDATE ON TABLE "public"."vw_perfect_store_index" TO "anon";

GRANT DELETE ON TABLE "public"."vw_perfect_store_index" TO "anon";

GRANT TRUNCATE ON TABLE "public"."vw_perfect_store_index" TO "anon";

GRANT REFERENCES ON TABLE "public"."vw_perfect_store_index" TO "anon";

GRANT TRIGGER ON TABLE "public"."vw_perfect_store_index" TO "anon";

GRANT MAINTAIN ON TABLE "public"."vw_perfect_store_index" TO "anon";

GRANT INSERT ON TABLE "public"."vw_perfect_store_index" TO "authenticated";

GRANT SELECT ON TABLE "public"."vw_perfect_store_index" TO "authenticated";

GRANT UPDATE ON TABLE "public"."vw_perfect_store_index" TO "authenticated";

GRANT DELETE ON TABLE "public"."vw_perfect_store_index" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."vw_perfect_store_index" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."vw_perfect_store_index" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."vw_perfect_store_index" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."vw_perfect_store_index" TO "authenticated";

GRANT INSERT ON TABLE "public"."vw_perfect_store_index" TO "service_role";

GRANT SELECT ON TABLE "public"."vw_perfect_store_index" TO "service_role";

GRANT UPDATE ON TABLE "public"."vw_perfect_store_index" TO "service_role";

GRANT DELETE ON TABLE "public"."vw_perfect_store_index" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."vw_perfect_store_index" TO "service_role";

GRANT REFERENCES ON TABLE "public"."vw_perfect_store_index" TO "service_role";

GRANT TRIGGER ON TABLE "public"."vw_perfect_store_index" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."vw_perfect_store_index" TO "service_role";

GRANT INSERT ON TABLE "public"."vw_branch_performance" TO "postgres";

GRANT SELECT ON TABLE "public"."vw_branch_performance" TO "postgres";

GRANT UPDATE ON TABLE "public"."vw_branch_performance" TO "postgres";

GRANT DELETE ON TABLE "public"."vw_branch_performance" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."vw_branch_performance" TO "postgres";

GRANT REFERENCES ON TABLE "public"."vw_branch_performance" TO "postgres";

GRANT TRIGGER ON TABLE "public"."vw_branch_performance" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."vw_branch_performance" TO "postgres";

GRANT INSERT ON TABLE "public"."vw_branch_performance" TO "anon";

GRANT UPDATE ON TABLE "public"."vw_branch_performance" TO "anon";

GRANT DELETE ON TABLE "public"."vw_branch_performance" TO "anon";

GRANT TRUNCATE ON TABLE "public"."vw_branch_performance" TO "anon";

GRANT REFERENCES ON TABLE "public"."vw_branch_performance" TO "anon";

GRANT TRIGGER ON TABLE "public"."vw_branch_performance" TO "anon";

GRANT MAINTAIN ON TABLE "public"."vw_branch_performance" TO "anon";

GRANT INSERT ON TABLE "public"."vw_branch_performance" TO "authenticated";

GRANT SELECT ON TABLE "public"."vw_branch_performance" TO "authenticated";

GRANT UPDATE ON TABLE "public"."vw_branch_performance" TO "authenticated";

GRANT DELETE ON TABLE "public"."vw_branch_performance" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."vw_branch_performance" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."vw_branch_performance" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."vw_branch_performance" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."vw_branch_performance" TO "authenticated";

GRANT INSERT ON TABLE "public"."vw_branch_performance" TO "service_role";

GRANT SELECT ON TABLE "public"."vw_branch_performance" TO "service_role";

GRANT UPDATE ON TABLE "public"."vw_branch_performance" TO "service_role";

GRANT DELETE ON TABLE "public"."vw_branch_performance" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."vw_branch_performance" TO "service_role";

GRANT REFERENCES ON TABLE "public"."vw_branch_performance" TO "service_role";

GRANT TRIGGER ON TABLE "public"."vw_branch_performance" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."vw_branch_performance" TO "service_role";

GRANT INSERT ON TABLE "public"."vw_competitor_heatmap" TO "postgres";

GRANT SELECT ON TABLE "public"."vw_competitor_heatmap" TO "postgres";

GRANT UPDATE ON TABLE "public"."vw_competitor_heatmap" TO "postgres";

GRANT DELETE ON TABLE "public"."vw_competitor_heatmap" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."vw_competitor_heatmap" TO "postgres";

GRANT REFERENCES ON TABLE "public"."vw_competitor_heatmap" TO "postgres";

GRANT TRIGGER ON TABLE "public"."vw_competitor_heatmap" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."vw_competitor_heatmap" TO "postgres";

GRANT INSERT ON TABLE "public"."vw_competitor_heatmap" TO "anon";

GRANT UPDATE ON TABLE "public"."vw_competitor_heatmap" TO "anon";

GRANT DELETE ON TABLE "public"."vw_competitor_heatmap" TO "anon";

GRANT TRUNCATE ON TABLE "public"."vw_competitor_heatmap" TO "anon";

GRANT REFERENCES ON TABLE "public"."vw_competitor_heatmap" TO "anon";

GRANT TRIGGER ON TABLE "public"."vw_competitor_heatmap" TO "anon";

GRANT MAINTAIN ON TABLE "public"."vw_competitor_heatmap" TO "anon";

GRANT INSERT ON TABLE "public"."vw_competitor_heatmap" TO "authenticated";

GRANT SELECT ON TABLE "public"."vw_competitor_heatmap" TO "authenticated";

GRANT UPDATE ON TABLE "public"."vw_competitor_heatmap" TO "authenticated";

GRANT DELETE ON TABLE "public"."vw_competitor_heatmap" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."vw_competitor_heatmap" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."vw_competitor_heatmap" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."vw_competitor_heatmap" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."vw_competitor_heatmap" TO "authenticated";

GRANT INSERT ON TABLE "public"."vw_competitor_heatmap" TO "service_role";

GRANT SELECT ON TABLE "public"."vw_competitor_heatmap" TO "service_role";

GRANT UPDATE ON TABLE "public"."vw_competitor_heatmap" TO "service_role";

GRANT DELETE ON TABLE "public"."vw_competitor_heatmap" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."vw_competitor_heatmap" TO "service_role";

GRANT REFERENCES ON TABLE "public"."vw_competitor_heatmap" TO "service_role";

GRANT TRIGGER ON TABLE "public"."vw_competitor_heatmap" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."vw_competitor_heatmap" TO "service_role";

GRANT INSERT ON TABLE "public"."products" TO "postgres";

GRANT SELECT ON TABLE "public"."products" TO "postgres";

GRANT UPDATE ON TABLE "public"."products" TO "postgres";

GRANT DELETE ON TABLE "public"."products" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."products" TO "postgres";

GRANT REFERENCES ON TABLE "public"."products" TO "postgres";

GRANT TRIGGER ON TABLE "public"."products" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."products" TO "postgres";

GRANT INSERT ON TABLE "public"."products" TO "service_role";

GRANT SELECT ON TABLE "public"."products" TO "service_role";

GRANT UPDATE ON TABLE "public"."products" TO "service_role";

GRANT DELETE ON TABLE "public"."products" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."products" TO "service_role";

GRANT REFERENCES ON TABLE "public"."products" TO "service_role";

GRANT TRIGGER ON TABLE "public"."products" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."products" TO "service_role";

GRANT INSERT ON TABLE "public"."products" TO "authenticated";

GRANT SELECT ON TABLE "public"."products" TO "authenticated";

GRANT UPDATE ON TABLE "public"."products" TO "authenticated";

GRANT DELETE ON TABLE "public"."products" TO "authenticated";

GRANT INSERT ON TABLE "public"."visits" TO "postgres";

GRANT SELECT ON TABLE "public"."visits" TO "postgres";

GRANT UPDATE ON TABLE "public"."visits" TO "postgres";

GRANT DELETE ON TABLE "public"."visits" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."visits" TO "postgres";

GRANT REFERENCES ON TABLE "public"."visits" TO "postgres";

GRANT TRIGGER ON TABLE "public"."visits" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."visits" TO "postgres";

GRANT INSERT ON TABLE "public"."visits" TO "anon";

GRANT SELECT ON TABLE "public"."visits" TO "anon";

GRANT UPDATE ON TABLE "public"."visits" TO "anon";

GRANT DELETE ON TABLE "public"."visits" TO "anon";

GRANT TRUNCATE ON TABLE "public"."visits" TO "anon";

GRANT REFERENCES ON TABLE "public"."visits" TO "anon";

GRANT TRIGGER ON TABLE "public"."visits" TO "anon";

GRANT MAINTAIN ON TABLE "public"."visits" TO "anon";

GRANT INSERT ON TABLE "public"."visits" TO "authenticated";

GRANT SELECT ON TABLE "public"."visits" TO "authenticated";

GRANT UPDATE ON TABLE "public"."visits" TO "authenticated";

GRANT DELETE ON TABLE "public"."visits" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."visits" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."visits" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."visits" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."visits" TO "authenticated";

GRANT INSERT ON TABLE "public"."visits" TO "service_role";

GRANT SELECT ON TABLE "public"."visits" TO "service_role";

GRANT UPDATE ON TABLE "public"."visits" TO "service_role";

GRANT DELETE ON TABLE "public"."visits" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."visits" TO "service_role";

GRANT REFERENCES ON TABLE "public"."visits" TO "service_role";

GRANT TRIGGER ON TABLE "public"."visits" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."visits" TO "service_role";

GRANT INSERT ON TABLE "public"."shelf_audit" TO "postgres";

GRANT SELECT ON TABLE "public"."shelf_audit" TO "postgres";

GRANT UPDATE ON TABLE "public"."shelf_audit" TO "postgres";

GRANT DELETE ON TABLE "public"."shelf_audit" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."shelf_audit" TO "postgres";

GRANT REFERENCES ON TABLE "public"."shelf_audit" TO "postgres";

GRANT TRIGGER ON TABLE "public"."shelf_audit" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."shelf_audit" TO "postgres";

GRANT INSERT ON TABLE "public"."shelf_audit" TO "anon";

GRANT SELECT ON TABLE "public"."shelf_audit" TO "anon";

GRANT UPDATE ON TABLE "public"."shelf_audit" TO "anon";

GRANT DELETE ON TABLE "public"."shelf_audit" TO "anon";

GRANT TRUNCATE ON TABLE "public"."shelf_audit" TO "anon";

GRANT REFERENCES ON TABLE "public"."shelf_audit" TO "anon";

GRANT TRIGGER ON TABLE "public"."shelf_audit" TO "anon";

GRANT MAINTAIN ON TABLE "public"."shelf_audit" TO "anon";

GRANT INSERT ON TABLE "public"."shelf_audit" TO "authenticated";

GRANT SELECT ON TABLE "public"."shelf_audit" TO "authenticated";

GRANT UPDATE ON TABLE "public"."shelf_audit" TO "authenticated";

GRANT DELETE ON TABLE "public"."shelf_audit" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."shelf_audit" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."shelf_audit" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."shelf_audit" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."shelf_audit" TO "authenticated";

GRANT INSERT ON TABLE "public"."shelf_audit" TO "service_role";

GRANT SELECT ON TABLE "public"."shelf_audit" TO "service_role";

GRANT UPDATE ON TABLE "public"."shelf_audit" TO "service_role";

GRANT DELETE ON TABLE "public"."shelf_audit" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."shelf_audit" TO "service_role";

GRANT REFERENCES ON TABLE "public"."shelf_audit" TO "service_role";

GRANT TRIGGER ON TABLE "public"."shelf_audit" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."shelf_audit" TO "service_role";

GRANT INSERT ON TABLE "public"."targets" TO "postgres";

GRANT SELECT ON TABLE "public"."targets" TO "postgres";

GRANT UPDATE ON TABLE "public"."targets" TO "postgres";

GRANT DELETE ON TABLE "public"."targets" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."targets" TO "postgres";

GRANT REFERENCES ON TABLE "public"."targets" TO "postgres";

GRANT TRIGGER ON TABLE "public"."targets" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."targets" TO "postgres";

GRANT INSERT ON TABLE "public"."targets" TO "anon";

GRANT SELECT ON TABLE "public"."targets" TO "anon";

GRANT UPDATE ON TABLE "public"."targets" TO "anon";

GRANT DELETE ON TABLE "public"."targets" TO "anon";

GRANT TRUNCATE ON TABLE "public"."targets" TO "anon";

GRANT REFERENCES ON TABLE "public"."targets" TO "anon";

GRANT TRIGGER ON TABLE "public"."targets" TO "anon";

GRANT MAINTAIN ON TABLE "public"."targets" TO "anon";

GRANT INSERT ON TABLE "public"."targets" TO "authenticated";

GRANT SELECT ON TABLE "public"."targets" TO "authenticated";

GRANT UPDATE ON TABLE "public"."targets" TO "authenticated";

GRANT DELETE ON TABLE "public"."targets" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."targets" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."targets" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."targets" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."targets" TO "authenticated";

GRANT INSERT ON TABLE "public"."targets" TO "service_role";

GRANT SELECT ON TABLE "public"."targets" TO "service_role";

GRANT UPDATE ON TABLE "public"."targets" TO "service_role";

GRANT DELETE ON TABLE "public"."targets" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."targets" TO "service_role";

GRANT REFERENCES ON TABLE "public"."targets" TO "service_role";

GRANT TRIGGER ON TABLE "public"."targets" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."targets" TO "service_role";

GRANT INSERT ON TABLE "public"."assets" TO "postgres";

GRANT SELECT ON TABLE "public"."assets" TO "postgres";

GRANT UPDATE ON TABLE "public"."assets" TO "postgres";

GRANT DELETE ON TABLE "public"."assets" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."assets" TO "postgres";

GRANT REFERENCES ON TABLE "public"."assets" TO "postgres";

GRANT TRIGGER ON TABLE "public"."assets" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."assets" TO "postgres";

GRANT INSERT ON TABLE "public"."assets" TO "anon";

GRANT SELECT ON TABLE "public"."assets" TO "anon";

GRANT UPDATE ON TABLE "public"."assets" TO "anon";

GRANT DELETE ON TABLE "public"."assets" TO "anon";

GRANT TRUNCATE ON TABLE "public"."assets" TO "anon";

GRANT REFERENCES ON TABLE "public"."assets" TO "anon";

GRANT TRIGGER ON TABLE "public"."assets" TO "anon";

GRANT MAINTAIN ON TABLE "public"."assets" TO "anon";

GRANT INSERT ON TABLE "public"."assets" TO "authenticated";

GRANT SELECT ON TABLE "public"."assets" TO "authenticated";

GRANT UPDATE ON TABLE "public"."assets" TO "authenticated";

GRANT DELETE ON TABLE "public"."assets" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."assets" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."assets" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."assets" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."assets" TO "authenticated";

GRANT INSERT ON TABLE "public"."assets" TO "service_role";

GRANT SELECT ON TABLE "public"."assets" TO "service_role";

GRANT UPDATE ON TABLE "public"."assets" TO "service_role";

GRANT DELETE ON TABLE "public"."assets" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."assets" TO "service_role";

GRANT REFERENCES ON TABLE "public"."assets" TO "service_role";

GRANT TRIGGER ON TABLE "public"."assets" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."assets" TO "service_role";

GRANT INSERT ON TABLE "public"."asset_tickets" TO "postgres";

GRANT SELECT ON TABLE "public"."asset_tickets" TO "postgres";

GRANT UPDATE ON TABLE "public"."asset_tickets" TO "postgres";

GRANT DELETE ON TABLE "public"."asset_tickets" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."asset_tickets" TO "postgres";

GRANT REFERENCES ON TABLE "public"."asset_tickets" TO "postgres";

GRANT TRIGGER ON TABLE "public"."asset_tickets" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."asset_tickets" TO "postgres";

GRANT INSERT ON TABLE "public"."asset_tickets" TO "anon";

GRANT SELECT ON TABLE "public"."asset_tickets" TO "anon";

GRANT UPDATE ON TABLE "public"."asset_tickets" TO "anon";

GRANT DELETE ON TABLE "public"."asset_tickets" TO "anon";

GRANT TRUNCATE ON TABLE "public"."asset_tickets" TO "anon";

GRANT REFERENCES ON TABLE "public"."asset_tickets" TO "anon";

GRANT TRIGGER ON TABLE "public"."asset_tickets" TO "anon";

GRANT MAINTAIN ON TABLE "public"."asset_tickets" TO "anon";

GRANT INSERT ON TABLE "public"."asset_tickets" TO "authenticated";

GRANT SELECT ON TABLE "public"."asset_tickets" TO "authenticated";

GRANT UPDATE ON TABLE "public"."asset_tickets" TO "authenticated";

GRANT DELETE ON TABLE "public"."asset_tickets" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."asset_tickets" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."asset_tickets" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."asset_tickets" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."asset_tickets" TO "authenticated";

GRANT INSERT ON TABLE "public"."asset_tickets" TO "service_role";

GRANT SELECT ON TABLE "public"."asset_tickets" TO "service_role";

GRANT UPDATE ON TABLE "public"."asset_tickets" TO "service_role";

GRANT DELETE ON TABLE "public"."asset_tickets" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."asset_tickets" TO "service_role";

GRANT REFERENCES ON TABLE "public"."asset_tickets" TO "service_role";

GRANT TRIGGER ON TABLE "public"."asset_tickets" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."asset_tickets" TO "service_role";

GRANT INSERT ON TABLE "public"."asset_types" TO "postgres";

GRANT SELECT ON TABLE "public"."asset_types" TO "postgres";

GRANT UPDATE ON TABLE "public"."asset_types" TO "postgres";

GRANT DELETE ON TABLE "public"."asset_types" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."asset_types" TO "postgres";

GRANT REFERENCES ON TABLE "public"."asset_types" TO "postgres";

GRANT TRIGGER ON TABLE "public"."asset_types" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."asset_types" TO "postgres";

GRANT INSERT ON TABLE "public"."asset_types" TO "anon";

GRANT SELECT ON TABLE "public"."asset_types" TO "anon";

GRANT UPDATE ON TABLE "public"."asset_types" TO "anon";

GRANT DELETE ON TABLE "public"."asset_types" TO "anon";

GRANT TRUNCATE ON TABLE "public"."asset_types" TO "anon";

GRANT REFERENCES ON TABLE "public"."asset_types" TO "anon";

GRANT TRIGGER ON TABLE "public"."asset_types" TO "anon";

GRANT MAINTAIN ON TABLE "public"."asset_types" TO "anon";

GRANT INSERT ON TABLE "public"."asset_types" TO "authenticated";

GRANT SELECT ON TABLE "public"."asset_types" TO "authenticated";

GRANT UPDATE ON TABLE "public"."asset_types" TO "authenticated";

GRANT DELETE ON TABLE "public"."asset_types" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."asset_types" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."asset_types" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."asset_types" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."asset_types" TO "authenticated";

GRANT INSERT ON TABLE "public"."asset_types" TO "service_role";

GRANT SELECT ON TABLE "public"."asset_types" TO "service_role";

GRANT UPDATE ON TABLE "public"."asset_types" TO "service_role";

GRANT DELETE ON TABLE "public"."asset_types" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."asset_types" TO "service_role";

GRANT REFERENCES ON TABLE "public"."asset_types" TO "service_role";

GRANT TRIGGER ON TABLE "public"."asset_types" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."asset_types" TO "service_role";

GRANT INSERT ON TABLE "public"."vw_asset_fleet_health" TO "postgres";

GRANT SELECT ON TABLE "public"."vw_asset_fleet_health" TO "postgres";

GRANT UPDATE ON TABLE "public"."vw_asset_fleet_health" TO "postgres";

GRANT DELETE ON TABLE "public"."vw_asset_fleet_health" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."vw_asset_fleet_health" TO "postgres";

GRANT REFERENCES ON TABLE "public"."vw_asset_fleet_health" TO "postgres";

GRANT TRIGGER ON TABLE "public"."vw_asset_fleet_health" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."vw_asset_fleet_health" TO "postgres";

GRANT INSERT ON TABLE "public"."vw_asset_fleet_health" TO "authenticated";

GRANT SELECT ON TABLE "public"."vw_asset_fleet_health" TO "authenticated";

GRANT UPDATE ON TABLE "public"."vw_asset_fleet_health" TO "authenticated";

GRANT DELETE ON TABLE "public"."vw_asset_fleet_health" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."vw_asset_fleet_health" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."vw_asset_fleet_health" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."vw_asset_fleet_health" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."vw_asset_fleet_health" TO "authenticated";

GRANT INSERT ON TABLE "public"."vw_asset_fleet_health" TO "service_role";

GRANT SELECT ON TABLE "public"."vw_asset_fleet_health" TO "service_role";

GRANT UPDATE ON TABLE "public"."vw_asset_fleet_health" TO "service_role";

GRANT DELETE ON TABLE "public"."vw_asset_fleet_health" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."vw_asset_fleet_health" TO "service_role";

GRANT REFERENCES ON TABLE "public"."vw_asset_fleet_health" TO "service_role";

GRANT TRIGGER ON TABLE "public"."vw_asset_fleet_health" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."vw_asset_fleet_health" TO "service_role";

GRANT INSERT ON TABLE "public"."push_subscriptions" TO "postgres";

GRANT SELECT ON TABLE "public"."push_subscriptions" TO "postgres";

GRANT UPDATE ON TABLE "public"."push_subscriptions" TO "postgres";

GRANT DELETE ON TABLE "public"."push_subscriptions" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."push_subscriptions" TO "postgres";

GRANT REFERENCES ON TABLE "public"."push_subscriptions" TO "postgres";

GRANT TRIGGER ON TABLE "public"."push_subscriptions" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."push_subscriptions" TO "postgres";

GRANT INSERT ON TABLE "public"."push_subscriptions" TO "anon";

GRANT SELECT ON TABLE "public"."push_subscriptions" TO "anon";

GRANT UPDATE ON TABLE "public"."push_subscriptions" TO "anon";

GRANT DELETE ON TABLE "public"."push_subscriptions" TO "anon";

GRANT TRUNCATE ON TABLE "public"."push_subscriptions" TO "anon";

GRANT REFERENCES ON TABLE "public"."push_subscriptions" TO "anon";

GRANT TRIGGER ON TABLE "public"."push_subscriptions" TO "anon";

GRANT MAINTAIN ON TABLE "public"."push_subscriptions" TO "anon";

GRANT INSERT ON TABLE "public"."push_subscriptions" TO "authenticated";

GRANT SELECT ON TABLE "public"."push_subscriptions" TO "authenticated";

GRANT UPDATE ON TABLE "public"."push_subscriptions" TO "authenticated";

GRANT DELETE ON TABLE "public"."push_subscriptions" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."push_subscriptions" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."push_subscriptions" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."push_subscriptions" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."push_subscriptions" TO "authenticated";

GRANT INSERT ON TABLE "public"."push_subscriptions" TO "service_role";

GRANT SELECT ON TABLE "public"."push_subscriptions" TO "service_role";

GRANT UPDATE ON TABLE "public"."push_subscriptions" TO "service_role";

GRANT DELETE ON TABLE "public"."push_subscriptions" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."push_subscriptions" TO "service_role";

GRANT REFERENCES ON TABLE "public"."push_subscriptions" TO "service_role";

GRANT TRIGGER ON TABLE "public"."push_subscriptions" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."push_subscriptions" TO "service_role";

GRANT INSERT ON TABLE "public"."attendance" TO "postgres";

GRANT SELECT ON TABLE "public"."attendance" TO "postgres";

GRANT UPDATE ON TABLE "public"."attendance" TO "postgres";

GRANT DELETE ON TABLE "public"."attendance" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."attendance" TO "postgres";

GRANT REFERENCES ON TABLE "public"."attendance" TO "postgres";

GRANT TRIGGER ON TABLE "public"."attendance" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."attendance" TO "postgres";

GRANT INSERT ON TABLE "public"."attendance" TO "service_role";

GRANT SELECT ON TABLE "public"."attendance" TO "service_role";

GRANT UPDATE ON TABLE "public"."attendance" TO "service_role";

GRANT DELETE ON TABLE "public"."attendance" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."attendance" TO "service_role";

GRANT REFERENCES ON TABLE "public"."attendance" TO "service_role";

GRANT TRIGGER ON TABLE "public"."attendance" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."attendance" TO "service_role";

GRANT SELECT ON TABLE "public"."attendance" TO "authenticated";

GRANT INSERT ON TABLE "public"."survey_photos" TO "postgres";

GRANT SELECT ON TABLE "public"."survey_photos" TO "postgres";

GRANT UPDATE ON TABLE "public"."survey_photos" TO "postgres";

GRANT DELETE ON TABLE "public"."survey_photos" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."survey_photos" TO "postgres";

GRANT REFERENCES ON TABLE "public"."survey_photos" TO "postgres";

GRANT TRIGGER ON TABLE "public"."survey_photos" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."survey_photos" TO "postgres";

GRANT INSERT ON TABLE "public"."survey_photos" TO "anon";

GRANT SELECT ON TABLE "public"."survey_photos" TO "anon";

GRANT UPDATE ON TABLE "public"."survey_photos" TO "anon";

GRANT DELETE ON TABLE "public"."survey_photos" TO "anon";

GRANT TRUNCATE ON TABLE "public"."survey_photos" TO "anon";

GRANT REFERENCES ON TABLE "public"."survey_photos" TO "anon";

GRANT TRIGGER ON TABLE "public"."survey_photos" TO "anon";

GRANT MAINTAIN ON TABLE "public"."survey_photos" TO "anon";

GRANT INSERT ON TABLE "public"."survey_photos" TO "authenticated";

GRANT SELECT ON TABLE "public"."survey_photos" TO "authenticated";

GRANT UPDATE ON TABLE "public"."survey_photos" TO "authenticated";

GRANT DELETE ON TABLE "public"."survey_photos" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."survey_photos" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."survey_photos" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."survey_photos" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."survey_photos" TO "authenticated";

GRANT INSERT ON TABLE "public"."survey_photos" TO "service_role";

GRANT SELECT ON TABLE "public"."survey_photos" TO "service_role";

GRANT UPDATE ON TABLE "public"."survey_photos" TO "service_role";

GRANT DELETE ON TABLE "public"."survey_photos" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."survey_photos" TO "service_role";

GRANT REFERENCES ON TABLE "public"."survey_photos" TO "service_role";

GRANT TRIGGER ON TABLE "public"."survey_photos" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."survey_photos" TO "service_role";

GRANT INSERT ON TABLE "public"."discovered_customers" TO "postgres";

GRANT SELECT ON TABLE "public"."discovered_customers" TO "postgres";

GRANT UPDATE ON TABLE "public"."discovered_customers" TO "postgres";

GRANT DELETE ON TABLE "public"."discovered_customers" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."discovered_customers" TO "postgres";

GRANT REFERENCES ON TABLE "public"."discovered_customers" TO "postgres";

GRANT TRIGGER ON TABLE "public"."discovered_customers" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."discovered_customers" TO "postgres";

GRANT INSERT ON TABLE "public"."discovered_customers" TO "anon";

GRANT SELECT ON TABLE "public"."discovered_customers" TO "anon";

GRANT UPDATE ON TABLE "public"."discovered_customers" TO "anon";

GRANT DELETE ON TABLE "public"."discovered_customers" TO "anon";

GRANT TRUNCATE ON TABLE "public"."discovered_customers" TO "anon";

GRANT REFERENCES ON TABLE "public"."discovered_customers" TO "anon";

GRANT TRIGGER ON TABLE "public"."discovered_customers" TO "anon";

GRANT MAINTAIN ON TABLE "public"."discovered_customers" TO "anon";

GRANT INSERT ON TABLE "public"."discovered_customers" TO "authenticated";

GRANT SELECT ON TABLE "public"."discovered_customers" TO "authenticated";

GRANT UPDATE ON TABLE "public"."discovered_customers" TO "authenticated";

GRANT DELETE ON TABLE "public"."discovered_customers" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."discovered_customers" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."discovered_customers" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."discovered_customers" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."discovered_customers" TO "authenticated";

GRANT INSERT ON TABLE "public"."discovered_customers" TO "service_role";

GRANT SELECT ON TABLE "public"."discovered_customers" TO "service_role";

GRANT UPDATE ON TABLE "public"."discovered_customers" TO "service_role";

GRANT DELETE ON TABLE "public"."discovered_customers" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."discovered_customers" TO "service_role";

GRANT REFERENCES ON TABLE "public"."discovered_customers" TO "service_role";

GRANT TRIGGER ON TABLE "public"."discovered_customers" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."discovered_customers" TO "service_role";

GRANT INSERT ON TABLE "public"."field_surveys" TO "postgres";

GRANT SELECT ON TABLE "public"."field_surveys" TO "postgres";

GRANT UPDATE ON TABLE "public"."field_surveys" TO "postgres";

GRANT DELETE ON TABLE "public"."field_surveys" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."field_surveys" TO "postgres";

GRANT REFERENCES ON TABLE "public"."field_surveys" TO "postgres";

GRANT TRIGGER ON TABLE "public"."field_surveys" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."field_surveys" TO "postgres";

GRANT INSERT ON TABLE "public"."field_surveys" TO "anon";

GRANT SELECT ON TABLE "public"."field_surveys" TO "anon";

GRANT UPDATE ON TABLE "public"."field_surveys" TO "anon";

GRANT DELETE ON TABLE "public"."field_surveys" TO "anon";

GRANT TRUNCATE ON TABLE "public"."field_surveys" TO "anon";

GRANT REFERENCES ON TABLE "public"."field_surveys" TO "anon";

GRANT TRIGGER ON TABLE "public"."field_surveys" TO "anon";

GRANT MAINTAIN ON TABLE "public"."field_surveys" TO "anon";

GRANT INSERT ON TABLE "public"."field_surveys" TO "authenticated";

GRANT SELECT ON TABLE "public"."field_surveys" TO "authenticated";

GRANT UPDATE ON TABLE "public"."field_surveys" TO "authenticated";

GRANT DELETE ON TABLE "public"."field_surveys" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."field_surveys" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."field_surveys" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."field_surveys" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."field_surveys" TO "authenticated";

GRANT INSERT ON TABLE "public"."field_surveys" TO "service_role";

GRANT SELECT ON TABLE "public"."field_surveys" TO "service_role";

GRANT UPDATE ON TABLE "public"."field_surveys" TO "service_role";

GRANT DELETE ON TABLE "public"."field_surveys" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."field_surveys" TO "service_role";

GRANT REFERENCES ON TABLE "public"."field_surveys" TO "service_role";

GRANT TRIGGER ON TABLE "public"."field_surveys" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."field_surveys" TO "service_role";

GRANT INSERT ON TABLE "public"."training_courses" TO "postgres";

GRANT SELECT ON TABLE "public"."training_courses" TO "postgres";

GRANT UPDATE ON TABLE "public"."training_courses" TO "postgres";

GRANT DELETE ON TABLE "public"."training_courses" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."training_courses" TO "postgres";

GRANT REFERENCES ON TABLE "public"."training_courses" TO "postgres";

GRANT TRIGGER ON TABLE "public"."training_courses" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."training_courses" TO "postgres";

GRANT INSERT ON TABLE "public"."training_courses" TO "anon";

GRANT SELECT ON TABLE "public"."training_courses" TO "anon";

GRANT UPDATE ON TABLE "public"."training_courses" TO "anon";

GRANT DELETE ON TABLE "public"."training_courses" TO "anon";

GRANT TRUNCATE ON TABLE "public"."training_courses" TO "anon";

GRANT REFERENCES ON TABLE "public"."training_courses" TO "anon";

GRANT TRIGGER ON TABLE "public"."training_courses" TO "anon";

GRANT MAINTAIN ON TABLE "public"."training_courses" TO "anon";

GRANT INSERT ON TABLE "public"."training_courses" TO "authenticated";

GRANT SELECT ON TABLE "public"."training_courses" TO "authenticated";

GRANT UPDATE ON TABLE "public"."training_courses" TO "authenticated";

GRANT DELETE ON TABLE "public"."training_courses" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."training_courses" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."training_courses" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."training_courses" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."training_courses" TO "authenticated";

GRANT INSERT ON TABLE "public"."training_courses" TO "service_role";

GRANT SELECT ON TABLE "public"."training_courses" TO "service_role";

GRANT UPDATE ON TABLE "public"."training_courses" TO "service_role";

GRANT DELETE ON TABLE "public"."training_courses" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."training_courses" TO "service_role";

GRANT REFERENCES ON TABLE "public"."training_courses" TO "service_role";

GRANT TRIGGER ON TABLE "public"."training_courses" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."training_courses" TO "service_role";

GRANT INSERT ON TABLE "public"."training_lessons" TO "postgres";

GRANT SELECT ON TABLE "public"."training_lessons" TO "postgres";

GRANT UPDATE ON TABLE "public"."training_lessons" TO "postgres";

GRANT DELETE ON TABLE "public"."training_lessons" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."training_lessons" TO "postgres";

GRANT REFERENCES ON TABLE "public"."training_lessons" TO "postgres";

GRANT TRIGGER ON TABLE "public"."training_lessons" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."training_lessons" TO "postgres";

GRANT INSERT ON TABLE "public"."training_lessons" TO "anon";

GRANT SELECT ON TABLE "public"."training_lessons" TO "anon";

GRANT UPDATE ON TABLE "public"."training_lessons" TO "anon";

GRANT DELETE ON TABLE "public"."training_lessons" TO "anon";

GRANT TRUNCATE ON TABLE "public"."training_lessons" TO "anon";

GRANT REFERENCES ON TABLE "public"."training_lessons" TO "anon";

GRANT TRIGGER ON TABLE "public"."training_lessons" TO "anon";

GRANT MAINTAIN ON TABLE "public"."training_lessons" TO "anon";

GRANT INSERT ON TABLE "public"."training_lessons" TO "authenticated";

GRANT SELECT ON TABLE "public"."training_lessons" TO "authenticated";

GRANT UPDATE ON TABLE "public"."training_lessons" TO "authenticated";

GRANT DELETE ON TABLE "public"."training_lessons" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."training_lessons" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."training_lessons" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."training_lessons" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."training_lessons" TO "authenticated";

GRANT INSERT ON TABLE "public"."training_lessons" TO "service_role";

GRANT SELECT ON TABLE "public"."training_lessons" TO "service_role";

GRANT UPDATE ON TABLE "public"."training_lessons" TO "service_role";

GRANT DELETE ON TABLE "public"."training_lessons" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."training_lessons" TO "service_role";

GRANT REFERENCES ON TABLE "public"."training_lessons" TO "service_role";

GRANT TRIGGER ON TABLE "public"."training_lessons" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."training_lessons" TO "service_role";

GRANT INSERT ON TABLE "public"."supervisor_training_progress" TO "postgres";

GRANT SELECT ON TABLE "public"."supervisor_training_progress" TO "postgres";

GRANT UPDATE ON TABLE "public"."supervisor_training_progress" TO "postgres";

GRANT DELETE ON TABLE "public"."supervisor_training_progress" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."supervisor_training_progress" TO "postgres";

GRANT REFERENCES ON TABLE "public"."supervisor_training_progress" TO "postgres";

GRANT TRIGGER ON TABLE "public"."supervisor_training_progress" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."supervisor_training_progress" TO "postgres";

GRANT INSERT ON TABLE "public"."supervisor_training_progress" TO "anon";

GRANT SELECT ON TABLE "public"."supervisor_training_progress" TO "anon";

GRANT UPDATE ON TABLE "public"."supervisor_training_progress" TO "anon";

GRANT DELETE ON TABLE "public"."supervisor_training_progress" TO "anon";

GRANT TRUNCATE ON TABLE "public"."supervisor_training_progress" TO "anon";

GRANT REFERENCES ON TABLE "public"."supervisor_training_progress" TO "anon";

GRANT TRIGGER ON TABLE "public"."supervisor_training_progress" TO "anon";

GRANT MAINTAIN ON TABLE "public"."supervisor_training_progress" TO "anon";

GRANT INSERT ON TABLE "public"."supervisor_training_progress" TO "authenticated";

GRANT SELECT ON TABLE "public"."supervisor_training_progress" TO "authenticated";

GRANT UPDATE ON TABLE "public"."supervisor_training_progress" TO "authenticated";

GRANT DELETE ON TABLE "public"."supervisor_training_progress" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."supervisor_training_progress" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."supervisor_training_progress" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."supervisor_training_progress" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."supervisor_training_progress" TO "authenticated";

GRANT INSERT ON TABLE "public"."supervisor_training_progress" TO "service_role";

GRANT SELECT ON TABLE "public"."supervisor_training_progress" TO "service_role";

GRANT UPDATE ON TABLE "public"."supervisor_training_progress" TO "service_role";

GRANT DELETE ON TABLE "public"."supervisor_training_progress" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."supervisor_training_progress" TO "service_role";

GRANT REFERENCES ON TABLE "public"."supervisor_training_progress" TO "service_role";

GRANT TRIGGER ON TABLE "public"."supervisor_training_progress" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."supervisor_training_progress" TO "service_role";

GRANT INSERT ON TABLE "public"."price_lists" TO "postgres";

GRANT SELECT ON TABLE "public"."price_lists" TO "postgres";

GRANT UPDATE ON TABLE "public"."price_lists" TO "postgres";

GRANT DELETE ON TABLE "public"."price_lists" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."price_lists" TO "postgres";

GRANT REFERENCES ON TABLE "public"."price_lists" TO "postgres";

GRANT TRIGGER ON TABLE "public"."price_lists" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."price_lists" TO "postgres";

GRANT INSERT ON TABLE "public"."price_lists" TO "anon";

GRANT SELECT ON TABLE "public"."price_lists" TO "anon";

GRANT UPDATE ON TABLE "public"."price_lists" TO "anon";

GRANT DELETE ON TABLE "public"."price_lists" TO "anon";

GRANT TRUNCATE ON TABLE "public"."price_lists" TO "anon";

GRANT REFERENCES ON TABLE "public"."price_lists" TO "anon";

GRANT TRIGGER ON TABLE "public"."price_lists" TO "anon";

GRANT MAINTAIN ON TABLE "public"."price_lists" TO "anon";

GRANT INSERT ON TABLE "public"."price_lists" TO "authenticated";

GRANT SELECT ON TABLE "public"."price_lists" TO "authenticated";

GRANT UPDATE ON TABLE "public"."price_lists" TO "authenticated";

GRANT DELETE ON TABLE "public"."price_lists" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."price_lists" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."price_lists" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."price_lists" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."price_lists" TO "authenticated";

GRANT INSERT ON TABLE "public"."price_lists" TO "service_role";

GRANT SELECT ON TABLE "public"."price_lists" TO "service_role";

GRANT UPDATE ON TABLE "public"."price_lists" TO "service_role";

GRANT DELETE ON TABLE "public"."price_lists" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."price_lists" TO "service_role";

GRANT REFERENCES ON TABLE "public"."price_lists" TO "service_role";

GRANT TRIGGER ON TABLE "public"."price_lists" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."price_lists" TO "service_role";

GRANT INSERT ON TABLE "public"."regions" TO "postgres";

GRANT SELECT ON TABLE "public"."regions" TO "postgres";

GRANT UPDATE ON TABLE "public"."regions" TO "postgres";

GRANT DELETE ON TABLE "public"."regions" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."regions" TO "postgres";

GRANT REFERENCES ON TABLE "public"."regions" TO "postgres";

GRANT TRIGGER ON TABLE "public"."regions" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."regions" TO "postgres";

GRANT INSERT ON TABLE "public"."regions" TO "anon";

GRANT SELECT ON TABLE "public"."regions" TO "anon";

GRANT UPDATE ON TABLE "public"."regions" TO "anon";

GRANT DELETE ON TABLE "public"."regions" TO "anon";

GRANT TRUNCATE ON TABLE "public"."regions" TO "anon";

GRANT REFERENCES ON TABLE "public"."regions" TO "anon";

GRANT TRIGGER ON TABLE "public"."regions" TO "anon";

GRANT MAINTAIN ON TABLE "public"."regions" TO "anon";

GRANT INSERT ON TABLE "public"."regions" TO "authenticated";

GRANT SELECT ON TABLE "public"."regions" TO "authenticated";

GRANT UPDATE ON TABLE "public"."regions" TO "authenticated";

GRANT DELETE ON TABLE "public"."regions" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."regions" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."regions" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."regions" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."regions" TO "authenticated";

GRANT INSERT ON TABLE "public"."regions" TO "service_role";

GRANT SELECT ON TABLE "public"."regions" TO "service_role";

GRANT UPDATE ON TABLE "public"."regions" TO "service_role";

GRANT DELETE ON TABLE "public"."regions" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."regions" TO "service_role";

GRANT REFERENCES ON TABLE "public"."regions" TO "service_role";

GRANT TRIGGER ON TABLE "public"."regions" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."regions" TO "service_role";

GRANT UPDATE ("is_read") ON "public"."notifications" TO "authenticated";

GRANT UPDATE ("full_name") ON "public"."supervisors" TO "authenticated";

GRANT UPDATE ("phone") ON "public"."supervisors" TO "authenticated";

GRANT UPDATE ("role") ON "public"."supervisors" TO "authenticated";

GRANT UPDATE ("is_active") ON "public"."supervisors" TO "authenticated";

GRANT UPDATE ("branch_id") ON "public"."supervisors" TO "authenticated";

GRANT UPDATE ("device_id") ON "public"."supervisors" TO "authenticated";

GRANT INSERT ("visit_id") ON "public"."orders" TO "authenticated";

GRANT INSERT ("supervisor_id") ON "public"."orders" TO "authenticated";

GRANT INSERT ("customer_id") ON "public"."orders" TO "authenticated";

GRANT INSERT ("product_id") ON "public"."orders" TO "authenticated";

GRANT INSERT ("quantity") ON "public"."orders" TO "authenticated";

GRANT UPDATE ("quantity") ON "public"."orders" TO "authenticated";

GRANT INSERT ("status") ON "public"."orders" TO "authenticated";

GRANT UPDATE ("status") ON "public"."orders" TO "authenticated";

GRANT INSERT ("notes") ON "public"."orders" TO "authenticated";

GRANT UPDATE ("notes") ON "public"."orders" TO "authenticated";

GRANT INSERT ("company_id") ON "public"."orders" TO "authenticated";

GRANT INSERT ("supervisor_id") ON "public"."attendance" TO "authenticated";

GRANT INSERT ("attendance_date") ON "public"."attendance" TO "authenticated";

GRANT INSERT ("check_in_time") ON "public"."attendance" TO "authenticated";

GRANT INSERT ("check_out_time") ON "public"."attendance" TO "authenticated";

GRANT UPDATE ("check_out_time") ON "public"."attendance" TO "authenticated";

GRANT INSERT ("check_in_lat") ON "public"."attendance" TO "authenticated";

GRANT INSERT ("check_in_lng") ON "public"."attendance" TO "authenticated";

GRANT INSERT ("selfie_url") ON "public"."attendance" TO "authenticated";

GRANT INSERT ("notes") ON "public"."attendance" TO "authenticated";

GRANT UPDATE ("notes") ON "public"."attendance" TO "authenticated";

GRANT INSERT ("company_id") ON "public"."attendance" TO "authenticated";

REVOKE ALL ON FUNCTION "private_rls"."can_access_supervisor"(p_target_supervisor_id uuid, p_target_company_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private_rls"."current_supervisor_id"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."create_default_visit_tasks"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."delete_supervisor_cascade"(p_supervisor_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."get_my_company_id"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."get_my_role"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."get_my_supervisor_id"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."handle_new_company_app_settings"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."manager_set_order_status"(p_order_id uuid, p_new_status text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."mdn_nearest_customers_v1"(p_lat double precision, p_lng double precision, p_limit integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."prevent_supervisor_self_escalation"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_my_company_id"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_company_id"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_my_company_id"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_my_supervisor_id"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_supervisor_id"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_my_supervisor_id"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_my_role"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_role"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_my_role"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private_rls"."current_supervisor_id"() TO "postgres";

GRANT EXECUTE ON FUNCTION "private_rls"."current_supervisor_id"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private_rls"."current_supervisor_id"() TO "service_role";

GRANT EXECUTE ON FUNCTION "private_rls"."can_access_supervisor"(p_target_supervisor_id uuid, p_target_company_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "private_rls"."can_access_supervisor"(p_target_supervisor_id uuid, p_target_company_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private_rls"."can_access_supervisor"(p_target_supervisor_id uuid, p_target_company_id uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."manager_set_order_status"(p_order_id uuid, p_new_status text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."manager_set_order_status"(p_order_id uuid, p_new_status text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."create_default_visit_tasks"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_default_visit_tasks"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."prevent_supervisor_self_escalation"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."prevent_supervisor_self_escalation"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."prevent_supervisor_self_escalation"() TO "anon";

GRANT EXECUTE ON FUNCTION "public"."prevent_supervisor_self_escalation"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."prevent_supervisor_self_escalation"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO "anon";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_company_app_settings"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."handle_new_company_app_settings"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_company_app_settings"() TO "anon";

GRANT EXECUTE ON FUNCTION "public"."handle_new_company_app_settings"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."handle_new_company_app_settings"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."mdn_nearest_customers_v1"(p_lat double precision, p_lng double precision, p_limit integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."mdn_nearest_customers_v1"(p_lat double precision, p_lng double precision, p_limit integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."mdn_nearest_customers_v1"(p_lat double precision, p_lng double precision, p_limit integer) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."mdn_nearest_customers_v1"(p_lat double precision, p_lng double precision, p_limit integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."mdn_nearest_customers_v1"(p_lat double precision, p_lng double precision, p_limit integer) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."delete_supervisor_cascade"(p_supervisor_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_supervisor_cascade"(p_supervisor_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."delete_supervisor_cascade"(p_supervisor_id uuid) TO "service_role";
