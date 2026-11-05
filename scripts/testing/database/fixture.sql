-- Synthetic local security fixture derived from the reviewed catalog subset.

CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth; CREATE SCHEMA private_rls;

CREATE TABLE auth.users (id uuid PRIMARY KEY, encrypted_password text);

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

GRANT USAGE ON SCHEMA public,auth,private_rls TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;

CREATE TABLE public."companies" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"max_supervisors" integer DEFAULT 50,
"is_active" boolean DEFAULT true,
"activated_at" timestamp with time zone,
"expires_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now(),
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
"woo_order_id" text,
"subscription_plan" text);

CREATE TABLE public."branches" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"manager_id" uuid,
"latitude" double precision,
"longitude" double precision,
"is_active" boolean DEFAULT true,
"created_at" timestamp with time zone DEFAULT now(),
"company_id" uuid,
"region_id" uuid,
"name" text NOT NULL,
"region" text);

CREATE TABLE public."supervisors" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid,
"is_active" boolean DEFAULT true,
"created_at" timestamp with time zone DEFAULT now(),
"updated_at" timestamp with time zone DEFAULT now(),
"branch_id" uuid,
"company_id" uuid,
"force_password_change" boolean DEFAULT false NOT NULL,
"password_changed_at" timestamp with time zone DEFAULT now(),
"full_name" text NOT NULL,
"phone" text,
"branch" text,
"role" text DEFAULT 'supervisor'::text,
"device_id" text,
"supervisor_code" text);

CREATE TABLE public."customers" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"latitude" double precision,
"longitude" double precision,
"is_active" boolean DEFAULT true,
"created_by" uuid,
"created_at" timestamp with time zone DEFAULT now(),
"company_id" uuid,
"supervisor_id" uuid,
"survey_id" uuid,
"customer_type" text,
"status" text DEFAULT 'active'::text,
"customer_code" text,
"name" text NOT NULL,
"type" text,
"owner_name" text,
"phone" text,
"address" text,
"branch" text);

CREATE TABLE public."products" ("units_per_carton" integer DEFAULT 1,
"carton_price" numeric DEFAULT 0,
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"is_active" boolean DEFAULT true,
"created_at" timestamp with time zone DEFAULT now(),
"company_id" uuid,
"price" numeric DEFAULT 0,
"name" text NOT NULL,
"category" text,
"sku_code" text,
"image_url" text,
"item_code" text,
"master_brand" text,
"sub_brand" text,
"unit" text DEFAULT 'قطعة'::text);

CREATE TABLE public."visits" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"supervisor_id" uuid,
"customer_id" uuid,
"latitude" double precision,
"longitude" double precision,
"geo_distance" double precision,
"on_beat" boolean DEFAULT false,
"visit_date" timestamp with time zone DEFAULT now(),
"created_at" timestamp with time zone DEFAULT now(),
"company_id" uuid,
"check_in_time" timestamp with time zone,
"check_out_time" timestamp with time zone,
"status" text DEFAULT 'pending'::text,
"visit_outcome" text,
"notes" text);

CREATE TABLE public."orders" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"visit_id" uuid,
"supervisor_id" uuid,
"customer_id" uuid,
"product_id" uuid,
"quantity" integer DEFAULT 0,
"unit_price" numeric,
"total_price" numeric,
"created_at" timestamp with time zone DEFAULT now(),
"company_id" uuid,
"items" jsonb DEFAULT '[]'::jsonb,
"total_amount" numeric DEFAULT 0,
"order_date" date DEFAULT CURRENT_DATE,
"delivered_at" timestamp with time zone,
"status" text DEFAULT 'pending'::text,
"notes" text);

CREATE TABLE public."supervisor_permissions" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,
"supervisor_id" uuid,
"is_enabled" boolean DEFAULT true,
"updated_at" timestamp with time zone DEFAULT now(),
"company_id" uuid,
"screen_key" text NOT NULL);

ALTER TABLE public."branches" ADD CONSTRAINT "branches_pkey" PRIMARY KEY (id);

ALTER TABLE public."supervisors" ADD CONSTRAINT "supervisors_pkey" PRIMARY KEY (id);

ALTER TABLE public."supervisors" ADD CONSTRAINT "supervisors_role_check" CHECK ((role = ANY (ARRAY['supervisor'::text, 'senior_supervisor'::text, 'branch_manager'::text, 'admin'::text, 'super_admin'::text])));

ALTER TABLE public."supervisor_permissions" ADD CONSTRAINT "supervisor_permissions_pkey" PRIMARY KEY (id);

ALTER TABLE public."supervisor_permissions" ADD CONSTRAINT "supervisor_permissions_supervisor_id_screen_key_key" UNIQUE (supervisor_id, screen_key);

ALTER TABLE public."companies" ADD CONSTRAINT "companies_license_key_key" UNIQUE (license_key);

ALTER TABLE public."companies" ADD CONSTRAINT "companies_license_type_check" CHECK ((license_type = ANY (ARRAY['standard'::text, 'pro'::text, 'enterprise'::text])));

ALTER TABLE public."companies" ADD CONSTRAINT "companies_pkey" PRIMARY KEY (id);

ALTER TABLE public."companies" ADD CONSTRAINT "companies_subscription_plan_check" CHECK ((subscription_plan = ANY (ARRAY['monthly'::text, 'yearly'::text])));

ALTER TABLE public."customers" ADD CONSTRAINT "customers_pkey" PRIMARY KEY (id);

ALTER TABLE public."customers" ADD CONSTRAINT "customers_type_check" CHECK ((type = ANY (ARRAY['بقالة'::text, 'سوبر ماركت'::text, 'هايبر ماركت'::text, 'ميني ماركت'::text, 'كافيه'::text, 'مطعم'::text, 'أخرى'::text])));

ALTER TABLE public."orders" ADD CONSTRAINT "orders_pkey" PRIMARY KEY (id);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'delivered'::text, 'cancelled'::text])));

ALTER TABLE public."products" ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);

ALTER TABLE public."products" ADD CONSTRAINT "products_sku_code_key" UNIQUE (sku_code);

ALTER TABLE public."visits" ADD CONSTRAINT "visits_pkey" PRIMARY KEY (id);

ALTER TABLE public."visits" ADD CONSTRAINT "visits_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text])));

ALTER TABLE public."visits" ADD CONSTRAINT "visits_visit_outcome_check" CHECK ((visit_outcome = ANY (ARRAY['متعامل'::text, 'غير متعامل'::text, 'غير موجود'::text])));

ALTER TABLE public."branches" ADD CONSTRAINT "branches_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public."branches" ADD CONSTRAINT "branches_manager_id_fkey" FOREIGN KEY (manager_id) REFERENCES supervisors(id);

ALTER TABLE public."supervisors" ADD CONSTRAINT "supervisors_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE public."supervisors" ADD CONSTRAINT "supervisors_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public."supervisors" ADD CONSTRAINT "supervisors_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."supervisor_permissions" ADD CONSTRAINT "supervisor_permissions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public."supervisor_permissions" ADD CONSTRAINT "supervisor_permissions_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE CASCADE;

ALTER TABLE public."customers" ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public."customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES supervisors(id);

ALTER TABLE public."customers" ADD CONSTRAINT "customers_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE SET NULL;

ALTER TABLE public."orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id);

ALTER TABLE public."orders" ADD CONSTRAINT "orders_visit_id_fkey" FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE;

ALTER TABLE public."products" ADD CONSTRAINT "products_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public."visits" ADD CONSTRAINT "visits_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE public."visits" ADD CONSTRAINT "visits_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE public."visits" ADD CONSTRAINT "visits_supervisor_id_fkey" FOREIGN KEY (supervisor_id) REFERENCES supervisors(id) ON DELETE CASCADE;

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

CREATE OR REPLACE FUNCTION private_rls.can_access_supervisor(p_target_supervisor_id uuid, p_target_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT EXISTS ( SELECT 1 FROM public.supervisors AS me JOIN public.supervisors AS target ON target.id = p_target_supervisor_id WHERE me.user_id = (SELECT auth.uid()) AND me.is_active = true AND target.company_id = p_target_company_id AND ( target.id = me.id OR ( me.role IN ('admin', 'super_admin') AND me.company_id = p_target_company_id ) OR ( me.role = 'senior_supervisor' AND me.company_id = p_target_company_id AND me.branch_id IS NOT NULL AND target.branch_id = me.branch_id ) OR ( me.role = 'branch_manager' AND me.company_id = p_target_company_id AND ( (me.branch_id IS NOT NULL AND target.branch_id = me.branch_id) OR EXISTS ( SELECT 1 FROM public.branches AS b WHERE b.manager_id = me.id AND b.id = target.branch_id AND b.company_id = p_target_company_id ) ) ) ) ) $function$
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

CREATE OR REPLACE FUNCTION private_rls.current_supervisor_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT s.id FROM public.supervisors AS s WHERE s.user_id = (SELECT auth.uid()) AND s.is_active = true LIMIT 1 $function$
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

CREATE FUNCTION public.get_my_supervisor_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT id FROM public.supervisors WHERE user_id=auth.uid() AND is_active LIMIT 1 $$;

ALTER TABLE public."companies" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."branches" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."supervisors" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."customers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."visits" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."orders" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."supervisor_permissions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branches_admin" ON public."branches" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (s.company_id = branches.company_id)))));

CREATE POLICY "branches_read" ON public."branches" FOR SELECT TO public USING ((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "supervisor_read_own" ON public."supervisors" FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "supervisors_admin_delete" ON public."supervisors" FOR DELETE TO authenticated USING (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text, 'manager'::text])) AND (role <> 'super_admin'::text)));

CREATE POLICY "supervisors_admin_read" ON public."supervisors" FOR SELECT TO authenticated USING (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'branch_manager'::text, 'super_admin'::text]))));

CREATE POLICY "supervisors_admin_update" ON public."supervisors" FOR UPDATE TO authenticated USING (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text, 'manager'::text])))) WITH CHECK (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text, 'manager'::text]))));

CREATE POLICY "supervisors_self_update" ON public."supervisors" FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "supervisor_permissions_delete_admin" ON public."supervisor_permissions" FOR DELETE TO authenticated USING (((company_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM supervisors actor
  WHERE ((actor.user_id = ( SELECT auth.uid() AS uid)) AND (actor.is_active IS TRUE) AND ((actor.role = 'super_admin'::text) OR ((actor.role = 'admin'::text) AND (actor.company_id = supervisor_permissions.company_id))))))));

CREATE POLICY "supervisor_permissions_insert_admin" ON public."supervisor_permissions" FOR INSERT TO authenticated WITH CHECK (((supervisor_id IS NOT NULL) AND (company_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM supervisors actor
  WHERE ((actor.user_id = ( SELECT auth.uid() AS uid)) AND (actor.is_active IS TRUE) AND ((actor.role = 'super_admin'::text) OR ((actor.role = 'admin'::text) AND (actor.company_id = supervisor_permissions.company_id)))))) AND (EXISTS ( SELECT 1
   FROM supervisors target
  WHERE ((target.id = supervisor_permissions.supervisor_id) AND (target.company_id = supervisor_permissions.company_id))))));

CREATE POLICY "supervisor_permissions_read_scoped" ON public."supervisor_permissions" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM supervisors actor
  WHERE ((actor.user_id = ( SELECT auth.uid() AS uid)) AND (actor.is_active IS TRUE) AND (((actor.id = supervisor_permissions.supervisor_id) AND (actor.company_id = supervisor_permissions.company_id)) OR ((actor.role = 'admin'::text) AND (actor.company_id = supervisor_permissions.company_id)) OR (actor.role = 'super_admin'::text))))));

CREATE POLICY "supervisor_permissions_update_admin" ON public."supervisor_permissions" FOR UPDATE TO authenticated USING (((company_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM supervisors actor
  WHERE ((actor.user_id = ( SELECT auth.uid() AS uid)) AND (actor.is_active IS TRUE) AND ((actor.role = 'super_admin'::text) OR ((actor.role = 'admin'::text) AND (actor.company_id = supervisor_permissions.company_id)))))))) WITH CHECK (((supervisor_id IS NOT NULL) AND (company_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM supervisors actor
  WHERE ((actor.user_id = ( SELECT auth.uid() AS uid)) AND (actor.is_active IS TRUE) AND ((actor.role = 'super_admin'::text) OR ((actor.role = 'admin'::text) AND (actor.company_id = supervisor_permissions.company_id)))))) AND (EXISTS ( SELECT 1
   FROM supervisors target
  WHERE ((target.id = supervisor_permissions.supervisor_id) AND (target.company_id = supervisor_permissions.company_id))))));

CREATE POLICY "companies_own" ON public."companies" FOR SELECT TO public USING ((id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))));

CREATE POLICY "companies_own_read" ON public."companies" FOR SELECT TO authenticated USING (((id = get_my_company_id()) OR (get_my_role() = 'super_admin'::text)));

CREATE POLICY "companies_super_admin" ON public."companies" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.role = 'super_admin'::text)))));

CREATE POLICY "companies_super_admin_write" ON public."companies" FOR ALL TO authenticated USING ((get_my_role() = 'super_admin'::text)) WITH CHECK ((get_my_role() = 'super_admin'::text));

CREATE POLICY "customers_company_read" ON public."customers" FOR SELECT TO authenticated USING (((company_id = get_my_company_id()) AND ((get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text])) OR (supervisor_id = get_my_supervisor_id()) OR (supervisor_id IS NULL))));

CREATE POLICY "customers_insert" ON public."customers" FOR INSERT TO authenticated WITH CHECK ((company_id = get_my_company_id()));

CREATE POLICY "customers_read" ON public."customers" FOR SELECT TO authenticated USING ((company_id = get_my_company_id()));

CREATE POLICY "customers_supervisor_insert" ON public."customers" FOR INSERT TO authenticated WITH CHECK ((company_id = get_my_company_id()));

CREATE POLICY "customers_supervisor_update" ON public."customers" FOR UPDATE TO authenticated USING (((company_id = get_my_company_id()) AND ((supervisor_id = get_my_supervisor_id()) OR (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text, 'manager'::text]))))) WITH CHECK ((company_id = get_my_company_id()));

CREATE POLICY "customers_update" ON public."customers" FOR UPDATE TO authenticated USING ((company_id = get_my_company_id()));

CREATE POLICY "orders_company_all" ON public."orders" FOR ALL TO authenticated USING (((company_id IS NULL) OR (company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE ((supervisors.user_id = auth.uid()) OR (supervisors.id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM supervisors
  WHERE (((supervisors.user_id = auth.uid()) OR (supervisors.id = auth.uid())) AND (supervisors.role = 'super_admin'::text)))))) WITH CHECK (((company_id IS NULL) OR (company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE ((supervisors.user_id = auth.uid()) OR (supervisors.id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM supervisors
  WHERE (((supervisors.user_id = auth.uid()) OR (supervisors.id = auth.uid())) AND (supervisors.role = 'super_admin'::text))))));

CREATE POLICY "orders_insert_self_pending" ON public."orders" FOR INSERT TO authenticated WITH CHECK (((supervisor_id = ( SELECT private_rls.current_supervisor_id() AS current_supervisor_id)) AND (company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = 'supervisor'::text) AND (status = 'pending'::text) AND (quantity > 0) AND (unit_price IS NULL) AND (total_price IS NULL) AND (visit_id IS NOT NULL) AND (customer_id IS NOT NULL) AND (product_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM visits v
  WHERE ((v.id = orders.visit_id) AND (v.company_id = orders.company_id) AND (v.supervisor_id = orders.supervisor_id) AND (v.customer_id = orders.customer_id)))) AND (EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = orders.customer_id) AND (c.company_id = orders.company_id) AND (c.is_active = true)))) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = orders.product_id) AND (p.company_id = orders.company_id) AND (p.is_active = true))))));

CREATE POLICY "orders_read_scoped" ON public."orders" FOR SELECT TO authenticated USING (((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND private_rls.can_access_supervisor(supervisor_id, company_id)));

CREATE POLICY "orders_update_self_pending" ON public."orders" FOR UPDATE TO authenticated USING (((supervisor_id = ( SELECT private_rls.current_supervisor_id() AS current_supervisor_id)) AND (company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = 'supervisor'::text) AND (status = 'pending'::text))) WITH CHECK (((supervisor_id = ( SELECT private_rls.current_supervisor_id() AS current_supervisor_id)) AND (company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = 'supervisor'::text) AND (status = ANY (ARRAY['pending'::text, 'cancelled'::text])) AND (quantity > 0)));

CREATE POLICY "products_admin_update" ON public."products" FOR UPDATE TO authenticated USING (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text, 'manager'::text])))) WITH CHECK (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text, 'manager'::text]))));

CREATE POLICY "products_admin_write" ON public."products" FOR INSERT TO authenticated WITH CHECK (((company_id = get_my_company_id()) AND (get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'branch_manager'::text, 'manager'::text]))));

CREATE POLICY "products_company_read" ON public."products" FOR SELECT TO authenticated USING ((company_id = get_my_company_id()));

CREATE POLICY "products_delete_admin" ON public."products" FOR DELETE TO authenticated USING (((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'super_admin'::text]))));

CREATE POLICY "products_insert_admin" ON public."products" FOR INSERT TO authenticated WITH CHECK (((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'super_admin'::text]))));

CREATE POLICY "products_read_company" ON public."products" FOR SELECT TO authenticated USING ((company_id = ( SELECT get_my_company_id() AS get_my_company_id)));

CREATE POLICY "products_update_admin" ON public."products" FOR UPDATE TO authenticated USING (((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'super_admin'::text])))) WITH CHECK (((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT get_my_role() AS get_my_role) = ANY (ARRAY['admin'::text, 'super_admin'::text]))));

CREATE POLICY "visits_insert" ON public."visits" FOR INSERT TO authenticated WITH CHECK (((company_id = get_my_company_id()) AND ((supervisor_id = get_my_supervisor_id()) OR (get_my_role() = ANY (ARRAY['admin'::text, 'branch_manager'::text, 'super_admin'::text])))));

CREATE POLICY "visits_own" ON public."visits" FOR ALL TO public USING (((company_id IN ( SELECT supervisors.company_id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))) AND ((supervisor_id IN ( SELECT supervisors.id
   FROM supervisors
  WHERE (supervisors.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM supervisors s
  WHERE ((s.user_id = auth.uid()) AND (s.role = ANY (ARRAY['admin'::text, 'branch_manager'::text, 'super_admin'::text]))))))));

GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

CREATE TRIGGER supervisor_self_escalation_guard BEFORE UPDATE ON public.supervisors FOR EACH ROW EXECUTE FUNCTION public.prevent_supervisor_self_escalation();
