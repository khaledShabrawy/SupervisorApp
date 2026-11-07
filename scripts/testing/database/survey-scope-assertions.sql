SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM field_surveys WHERE id='54000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Owner cannot read own survey'; END IF;
 IF EXISTS(SELECT 1 FROM field_surveys WHERE id IN ('54000000-0000-4000-8000-000000000002','54000000-0000-4000-8000-000000000006')) THEN RAISE EXCEPTION 'Field worker saw peer/foreign survey'; END IF;
 IF EXISTS(SELECT 1 FROM survey_responses WHERE id IN ('55000000-0000-4000-8000-000000000002','55000000-0000-4000-8000-000000000006')) THEN RAISE EXCEPTION 'Field worker saw peer/foreign response'; END IF;
 UPDATE field_surveys SET notes='owner update' WHERE id='54000000-0000-4000-8000-000000000001';
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner write denied'; END IF;
 UPDATE field_surveys SET notes='forged peer' WHERE id='54000000-0000-4000-8000-000000000002';
 IF FOUND THEN RAISE EXCEPTION 'Field worker updated peer'; END IF;
 DELETE FROM survey_responses WHERE id='55000000-0000-4000-8000-000000000002';
 IF FOUND THEN RAISE EXCEPTION 'Field worker deleted peer response'; END IF;
 BEGIN UPDATE field_surveys SET supervisor_id='50000000-0000-4000-8000-000000000002' WHERE id='54000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'Ownership transfer allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE survey_responses SET company_id='60000000-0000-4000-8000-000000000000' WHERE id='55000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'Tenant transfer allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE field_surveys SET visit_id='52000000-0000-4000-8000-000000000002' WHERE id='54000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'Peer visit link allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE survey_responses SET survey_id='63000000-0000-4000-8000-000000000001' WHERE id='55000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'Foreign questionnaire allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO field_surveys(company_id,supervisor_id) VALUES('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000002'); RAISE EXCEPTION 'Peer insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000005',false);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM field_surveys WHERE id='54000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Branch manager cannot see own branch'; END IF;
 IF EXISTS(SELECT 1 FROM field_surveys WHERE id='54000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Branch manager saw another branch'; END IF;
 UPDATE survey_responses SET answers='{"checked":true}' WHERE id='55000000-0000-4000-8000-000000000002';
 IF NOT FOUND THEN RAISE EXCEPTION 'Scoped manager edit denied'; END IF;
 UPDATE survey_responses SET answers='{"forged":true}' WHERE id='55000000-0000-4000-8000-000000000003';
 IF FOUND THEN RAISE EXCEPTION 'Manager edited other branch'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000008',false);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM survey_responses WHERE id='55000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Senior read helper scope lost'; END IF;
 UPDATE survey_responses SET answers='{"forged":true}' WHERE id='55000000-0000-4000-8000-000000000002';
 IF FOUND THEN RAISE EXCEPTION 'Senior edited peer response'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000004',false);
DO $$ BEGIN
 UPDATE field_surveys SET notes='admin managed' WHERE id='54000000-0000-4000-8000-000000000003';
 IF NOT FOUND THEN RAISE EXCEPTION 'Company admin edit denied'; END IF;
 IF EXISTS(SELECT 1 FROM field_surveys WHERE id='54000000-0000-4000-8000-000000000006') THEN RAISE EXCEPTION 'Admin read other company'; END IF;
 BEGIN UPDATE field_surveys SET id=gen_random_uuid() WHERE id='54000000-0000-4000-8000-000000000003'; RAISE EXCEPTION 'Admin moved record identity'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000007',false);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM field_surveys) OR EXISTS(SELECT 1 FROM survey_responses) THEN RAISE EXCEPTION 'Inactive actor saw survey data'; END IF;
END $$;
RESET ROLE;
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM field_surveys) OR EXISTS(SELECT 1 FROM survey_responses) THEN RAISE EXCEPTION 'Anonymous actor saw surveys'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',false);
UPDATE branches SET manager_id='50000000-0000-4000-8000-000000000005' WHERE id='51000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000005',false);
DO $$ BEGIN
 UPDATE survey_responses SET answers='{"managed_branch":true}' WHERE id='55000000-0000-4000-8000-000000000003';
 IF NOT FOUND THEN RAISE EXCEPTION 'Assigned-branch helper scope not honored'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',false);
UPDATE branches SET manager_id=NULL WHERE id='51000000-0000-4000-8000-000000000002';
UPDATE supervisors SET role=NULL WHERE id='50000000-0000-4000-8000-000000000008';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000008',false);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM field_surveys) OR EXISTS(SELECT 1 FROM survey_responses) THEN RAISE EXCEPTION 'Null role saw survey data'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',false);
UPDATE supervisors SET role='senior_supervisor' WHERE id='50000000-0000-4000-8000-000000000008';
SELECT 'survey ownership, active-role and relation checks passed' AS result;
