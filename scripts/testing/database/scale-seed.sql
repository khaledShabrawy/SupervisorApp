-- Synthetic identities/data only; intended for the disposable full-schema fixture.
SELECT set_config('request.jwt.claim.sub','',false);
INSERT INTO auth.users(id,encrypted_password) SELECT ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'synthetic-hash' FROM generate_series(1,9) n;
INSERT INTO companies(id,name,is_active) VALUES
 ('50000000-0000-4000-8000-000000000000','Scale Synthetic A',true),
 ('60000000-0000-4000-8000-000000000000','Scale Synthetic B',true);
INSERT INTO branches(id,name,company_id) VALUES
 ('51000000-0000-4000-8000-000000000001','Scale A1','50000000-0000-4000-8000-000000000000'),
 ('51000000-0000-4000-8000-000000000002','Scale A2','50000000-0000-4000-8000-000000000000'),
 ('61000000-0000-4000-8000-000000000001','Scale B1','60000000-0000-4000-8000-000000000000');
INSERT INTO supervisors(id,user_id,full_name,role,is_active,company_id,branch_id) SELECT
 ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'Scale synthetic '||n,
 CASE n WHEN 4 THEN 'admin' WHEN 5 THEN 'branch_manager' WHEN 8 THEN 'senior_supervisor' WHEN 9 THEN 'super_admin' ELSE 'supervisor' END,
 n<>7,
 CASE WHEN n=6 THEN '60000000-0000-4000-8000-000000000000'::uuid ELSE '50000000-0000-4000-8000-000000000000'::uuid END,
 CASE WHEN n=6 THEN '61000000-0000-4000-8000-000000000001'::uuid WHEN n=3 THEN '51000000-0000-4000-8000-000000000002'::uuid ELSE '51000000-0000-4000-8000-000000000001'::uuid END
 FROM generate_series(1,9) n;
INSERT INTO visits(id,company_id,supervisor_id,status) SELECT
 ('52000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n=6 THEN '60000000-0000-4000-8000-000000000000'::uuid ELSE '50000000-0000-4000-8000-000000000000'::uuid END,
 ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'pending' FROM unnest(ARRAY[1,2,3,6]) n;
INSERT INTO surveys(id,company_id,title) VALUES
 ('53000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000000','Scale A questionnaire'),
 ('63000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000000','Scale B questionnaire');
INSERT INTO field_surveys(id,company_id,supervisor_id,visit_id,status) SELECT
 ('54000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n=6 THEN '60000000-0000-4000-8000-000000000000'::uuid ELSE '50000000-0000-4000-8000-000000000000'::uuid END,
 ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('52000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'pending' FROM unnest(ARRAY[1,2,3,6]) n;
INSERT INTO survey_responses(id,company_id,supervisor_id,visit_id,survey_id) SELECT
 ('55000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n=6 THEN '60000000-0000-4000-8000-000000000000'::uuid ELSE '50000000-0000-4000-8000-000000000000'::uuid END,
 ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('52000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n=6 THEN '63000000-0000-4000-8000-000000000001'::uuid ELSE '53000000-0000-4000-8000-000000000001'::uuid END
 FROM unnest(ARRAY[1,2,3,6]) n;
INSERT INTO shelf_audit(id,company_id,supervisor_id,visit_id,status) VALUES
 ('56000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','pending'),
 ('56000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000002','pending');
-- Separate records allow quota contention tests without confusing same-record exclusion.
INSERT INTO field_surveys(id,company_id,supervisor_id,visit_id,status) SELECT
 ('58000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001',
 '52000000-0000-4000-8000-000000000001','pending' FROM generate_series(1,40) n;
