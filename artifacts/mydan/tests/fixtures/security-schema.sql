-- Synthetic test schema only. This is NOT a production baseline or an export of either application database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TABLE auth.users(id uuid PRIMARY KEY,encrypted_password text,raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated;
CREATE TABLE public.companies(id uuid PRIMARY KEY,name text,is_active boolean DEFAULT true,expires_at timestamptz,max_supervisors integer DEFAULT 20);
CREATE TABLE public.branches(id uuid PRIMARY KEY,company_id uuid REFERENCES companies(id),name text,region_id uuid,is_active boolean DEFAULT true,latitude float8,longitude float8);
CREATE TABLE public.supervisors(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),company_id uuid REFERENCES companies(id),branch_id uuid REFERENCES branches(id),
  full_name text,phone text,role text NOT NULL DEFAULT 'supervisor',is_active boolean NOT NULL DEFAULT true,device_id text,
  force_password_change boolean NOT NULL DEFAULT false,password_changed_at timestamptz,supervisor_code text);
CREATE TABLE public.app_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid UNIQUE REFERENCES companies(id),app_name text,logo_url text,
  geofence_radius_m float8 DEFAULT 100,ai_audit_enabled boolean DEFAULT true,target_brand_name text,competitor_brands text[] DEFAULT '{}');
CREATE TABLE public.customers(id uuid PRIMARY KEY,company_id uuid REFERENCES companies(id),supervisor_id uuid REFERENCES supervisors(id),name text,customer_type text,address text,customer_code text,
  latitude float8,longitude float8,is_active boolean DEFAULT true);
CREATE TABLE public.visits(id uuid PRIMARY KEY,company_id uuid REFERENCES companies(id),supervisor_id uuid REFERENCES supervisors(id),customer_id uuid REFERENCES customers(id),
  visit_date date,status text,check_in_time timestamptz,check_out_time timestamptz,latitude float8,longitude float8,geo_distance float8,on_beat boolean,notes text,visit_outcome text);
CREATE TABLE public.visit_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid REFERENCES companies(id),visit_id uuid REFERENCES visits(id),task_type text,
  title_ar text,is_completed boolean DEFAULT false,is_mandatory boolean DEFAULT true,order_num integer DEFAULT 1,completed_at timestamptz);
CREATE TABLE public.attendance(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid REFERENCES companies(id),supervisor_id uuid REFERENCES supervisors(id),
  attendance_date date,check_in_time timestamptz,check_out_time timestamptz,check_in_lat float8,check_in_lng float8);
CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid REFERENCES companies(id),supervisor_id uuid REFERENCES supervisors(id),
  type text,title_ar text,body_ar text,is_read boolean DEFAULT false,created_at timestamptz DEFAULT now());
CREATE TABLE public.targets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid REFERENCES companies(id),supervisor_id uuid REFERENCES supervisors(id),branch_id uuid,
  target_date date,month integer,year integer,visits_target integer DEFAULT 0,audit_target integer DEFAULT 0,actual_visits integer DEFAULT 0,actual_audits integer DEFAULT 0);
CREATE TABLE public.shelf_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid REFERENCES companies(id),supervisor_id uuid REFERENCES supervisors(id),visit_id uuid REFERENCES visits(id),
  photo_url text,status text DEFAULT 'pending',audit_score numeric,ai_detailed_report jsonb,audit_summary_ar text,audited_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE public.supervisor_permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid REFERENCES companies(id),supervisor_id uuid REFERENCES supervisors(id),screen_key text,is_enabled boolean,UNIQUE(supervisor_id,screen_key));
CREATE TABLE public.beat_plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid REFERENCES companies(id),supervisor_id uuid REFERENCES supervisors(id),customer_id uuid,customer_ids_ordered uuid[],plan_date date,day_of_week integer);
CREATE TABLE public.audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,table_name text,action text,performed_by uuid REFERENCES supervisors(id),old_data jsonb,new_data jsonb);
CREATE TABLE public.products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,name text,is_active boolean DEFAULT true);
CREATE TABLE public.price_list(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,product_id uuid,unit_price numeric);
CREATE TABLE public.price_lists(LIKE price_list INCLUDING ALL);
CREATE TABLE public.regions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,name text);
CREATE TABLE public.assets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,is_active boolean DEFAULT true);
CREATE TABLE public.asset_types(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid);
CREATE TABLE public.asset_tickets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,status text);
CREATE TABLE public.orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,supervisor_id uuid,customer_id uuid,visit_id uuid,status text,delivered_at timestamptz);
CREATE TABLE public.field_surveys(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,supervisor_id uuid,photo_url text,status text DEFAULT 'pending',ai_raw_result jsonb,created_at timestamptz DEFAULT now(),stores_found integer);
CREATE TABLE public.surveys(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,is_active boolean DEFAULT true,questions jsonb);
CREATE TABLE public.survey_responses(id uuid PRIMARY KEY,company_id uuid,supervisor_id uuid,survey_id uuid,visit_id uuid,answers jsonb,submitted_at timestamptz);
CREATE TABLE public.competitor_products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,visit_id uuid,brand_name text);
CREATE TABLE public.training_courses(id uuid PRIMARY KEY,company_id uuid,is_published boolean DEFAULT true);
CREATE TABLE public.training_lessons(id uuid PRIMARY KEY,company_id uuid,course_id uuid,is_published boolean DEFAULT true);
CREATE TABLE public.supervisor_training_progress(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,supervisor_id uuid,lesson_id uuid,is_completed boolean,last_watched_seconds integer,UNIQUE(supervisor_id,lesson_id));
CREATE TABLE public.push_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,supervisor_id uuid,endpoint text,p256dh text,auth text,UNIQUE(supervisor_id,endpoint));
CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean DEFAULT false);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_open_storage ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
CREATE POLICY legacy_open_settings ON public.app_settings FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
GRANT ALL ON ALL TABLES IN SCHEMA public,storage TO anon,authenticated;
INSERT INTO storage.buckets VALUES('shelf-photos',true),('survey-photos',true),('training-materials',true),('company-logos',true),('unrelated',false);

ALTER TABLE public.targets ADD COLUMN criteria text;

CREATE VIEW public.vw_daily_kpi_supervisor AS SELECT company_id,supervisor_id FROM public.visits;
GRANT SELECT ON public.vw_daily_kpi_supervisor TO anon,authenticated;

-- Standard Auth session shape used only in the isolated model tests.
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);
ALTER TABLE public.customers ADD COLUMN survey_id uuid;
ALTER TABLE public.branches ADD COLUMN manager_id uuid;

ALTER TABLE public.training_lessons ADD COLUMN video_url text, ADD COLUMN attachment_url text;
