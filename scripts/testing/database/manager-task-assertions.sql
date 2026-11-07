-- Synthetic task-planning acceptance; requires full-schema.sql and manager_tasks proposal.
SELECT set_config('request.jwt.claim.sub','',false);
INSERT INTO auth.users(id) VALUES
 ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004'),
 ('10000000-0000-4000-8000-000000000005');
INSERT INTO companies(id,name) VALUES ('20000000-0000-4000-8000-000000000001','Task synthetic A'),('20000000-0000-4000-8000-000000000002','Task synthetic B');
INSERT INTO branches(id,name,company_id) VALUES
 ('30000000-0000-4000-8000-000000000001','Task branch A','20000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','Task branch A2','20000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000003','Task branch B','20000000-0000-4000-8000-000000000002');
INSERT INTO supervisors(id,user_id,company_id,branch_id,full_name,role,is_active) VALUES
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Task worker','supervisor',true),
 ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Task admin','admin',true),
 ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Task manager','branch_manager',true),
 ('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','Task other branch','supervisor',true),
 ('10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','Task foreign','supervisor',true);
INSERT INTO customers(id,name,company_id) VALUES
 ('40000000-0000-4000-8000-000000000001','Task customer A','20000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','Task customer B','20000000-0000-4000-8000-000000000002');
INSERT INTO visits(id,supervisor_id,company_id,customer_id,status) VALUES
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','pending'),
 ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','pending'),
 ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','pending');
INSERT INTO visit_tasks(id,visit_id,company_id,title_ar,task_type,is_completed,completed_at) VALUES
 ('60000000-0000-4000-8000-000000000009','50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Completed history','other',true,now());
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
SELECT mdn_save_visit_task_v1('50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','  Manager task  ','other',true);
-- Same stable identity replays as an update, never a duplicate task.
SELECT mdn_save_visit_task_v1('50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','Manager task','other',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM visit_tasks WHERE id='60000000-0000-4000-8000-000000000001')<>1 THEN RAISE EXCEPTION 'Task replay duplicated'; END IF;
 BEGIN PERFORM mdn_save_visit_task_v1('50000000-0000-4000-8000-000000000002',gen_random_uuid(),'Other branch','other',true); RAISE EXCEPTION 'Branch manager edited another branch'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE visits SET supervisor_id='10000000-0000-4000-8000-000000000001' WHERE id='50000000-0000-4000-8000-000000000002'; RAISE EXCEPTION 'Visit reassignment bypassed branch scope'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE visits SET notes='forged' WHERE id='50000000-0000-4000-8000-000000000002';
 IF FOUND THEN RAISE EXCEPTION 'Other-branch visit update allowed'; END IF;
 BEGIN PERFORM mdn_save_visit_task_v1('50000000-0000-4000-8000-000000000003',gen_random_uuid(),'Foreign task','other',true); RAISE EXCEPTION 'Foreign company task allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM mdn_save_visit_task_v1('50000000-0000-4000-8000-000000000001',gen_random_uuid(),'Sales task','order',true); RAISE EXCEPTION 'Financial task type allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM mdn_save_visit_task_v1('50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000009','Rewrite completed','other',true); RAISE EXCEPTION 'Completed history changed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
DO $$ BEGIN
 BEGIN INSERT INTO visit_tasks(visit_id,company_id,title_ar) VALUES ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Forged'); RAISE EXCEPTION 'Direct task INSERT allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM visit_tasks WHERE id='60000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'Direct task DELETE allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE visit_tasks SET visit_id='50000000-0000-4000-8000-000000000002' WHERE id='60000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'Task identity changed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE visit_tasks SET is_mandatory=true WHERE id='60000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'Worker changed mandatory flag'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE visits SET customer_id='40000000-0000-4000-8000-000000000002' WHERE id='50000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'Foreign customer link allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM mdn_save_visit_task_v1('50000000-0000-4000-8000-000000000001',gen_random_uuid(),'Worker forged','other',true); RAISE EXCEPTION 'Worker manager RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE visits SET status='in_progress',check_in_time='2026-11-06T08:00:00Z' WHERE id='50000000-0000-4000-8000-000000000001';
 IF NOT FOUND THEN RAISE EXCEPTION 'Ordinary field check-in failed'; END IF;
 UPDATE visits SET visit_outcome='متعامل' WHERE id='50000000-0000-4000-8000-000000000001';
 BEGIN UPDATE visits SET status='completed',check_out_time='2026-11-06T09:00:00Z' WHERE id='50000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'Mandatory tasks were bypassed at checkout'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 UPDATE visit_tasks SET is_completed=true,completed_at='1999-01-01' WHERE id='60000000-0000-4000-8000-000000000001';
 IF NOT FOUND THEN RAISE EXCEPTION 'Ordinary task completion failed'; END IF;
 IF (SELECT completed_at < '2026-01-01'::timestamptz FROM visit_tasks WHERE id='60000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Client completion time trusted'; END IF;
 UPDATE visit_tasks SET is_completed=true,completed_at='2999-01-01' WHERE id='60000000-0000-4000-8000-000000000001';
 IF FOUND THEN RAISE EXCEPTION 'Completed task timestamp changed on replay'; END IF;
 UPDATE visit_tasks SET is_completed=false WHERE id='60000000-0000-4000-8000-000000000001';
 IF FOUND THEN RAISE EXCEPTION 'Completed task reopened'; END IF;
 BEGIN UPDATE visits SET status='pending',check_in_time=NULL WHERE id='50000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'Started visit reopened for planning'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE visit_tasks SET is_completed=true,completed_at='1999-01-01' WHERE visit_id='50000000-0000-4000-8000-000000000001' AND is_mandatory IS TRUE AND is_completed IS FALSE;
 UPDATE visits SET status='completed',check_out_time='2026-11-06T09:00:00Z' WHERE id='50000000-0000-4000-8000-000000000001';
 IF NOT FOUND THEN RAISE EXCEPTION 'Ordinary checkout failed'; END IF;
 UPDATE visits SET status='pending',check_out_time=NULL WHERE id='50000000-0000-4000-8000-000000000001';
 IF FOUND THEN RAISE EXCEPTION 'Completed visit reopened'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
DO $$ BEGIN
 BEGIN UPDATE visits SET company_id='20000000-0000-4000-8000-000000000002' WHERE id='50000000-0000-4000-8000-000000000002'; RAISE EXCEPTION 'Admin changed identity'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM mdn_save_visit_task_v1('50000000-0000-4000-8000-000000000001',gen_random_uuid(),'Edit after checkout','other',true); RAISE EXCEPTION 'Manager edited started/completed visit'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',false);
UPDATE supervisors SET is_active=false WHERE id='10000000-0000-4000-8000-000000000003';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
DO $$ BEGIN
 BEGIN PERFORM mdn_save_visit_task_v1('50000000-0000-4000-8000-000000000002',gen_random_uuid(),'Inactive manager','other',true); RAISE EXCEPTION 'Inactive manager RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',false);
UPDATE visits SET status='in_progress',check_in_time='2026-11-06T08:00:00Z',visit_outcome='غير متعامل' WHERE id='50000000-0000-4000-8000-000000000003';
UPDATE visits SET status='completed',check_out_time='2026-11-06T09:00:00Z' WHERE id='50000000-0000-4000-8000-000000000003';
RESET ROLE;
SELECT 'manager task planning and scoped visit identity tests passed' AS result;
