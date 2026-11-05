-- READ-ONLY INVENTORY TEMPLATE. Not run against any external database during remediation.
-- Returns schema/configuration metadata only, no customer, profile or Auth user rows.
SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_schema IN('public','auth') AND table_name<>'users'
ORDER BY table_schema,table_name,ordinal_position;
SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.reloptions
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN('r','p','v') ORDER BY c.relname;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname IN('public','storage') ORDER BY schemaname,tablename,policyname;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef,p.proconfig,p.proacl,md5(p.prosrc) AS source_fingerprint
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname;
SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN('anon','authenticated','service_role','powerbi_reader') ORDER BY table_name,grantee;
SELECT rolname,rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN('anon','authenticated','service_role','powerbi_reader');
SELECT c.relname,conname,pg_get_constraintdef(p.oid) AS definition
FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' ORDER BY c.relname,conname;
SELECT id,name,public FROM storage.buckets ORDER BY id;
