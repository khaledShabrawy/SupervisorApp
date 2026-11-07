-- Synthetic disposable database only. The ledger is reset between independent cases.
SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM 1 FROM public.mdn_ai_attempts_v1; RAISE EXCEPTION 'Client read ledger'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.mdn_ai_attempts_v1(company_id) VALUES(NULL); RAISE EXCEPTION 'Client forged ledger'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','analyze-shelf','56000000-0000-4000-8000-000000000001','google-gemini',100,100,5); RAISE EXCEPTION 'Client claimed quota'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.mdn_finish_ai_attempt_v1(gen_random_uuid(),'failed','50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'Client finished ledger'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','public.mdn_claim_ai_attempt_v1(uuid,uuid,text,uuid,text,integer,integer,integer)','EXECUTE') OR has_function_privilege('authenticated','public.mdn_finish_ai_attempt_v1(uuid,text,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Untrusted RPC grant'; END IF;
 IF NOT has_function_privilege('service_role','public.mdn_claim_ai_attempt_v1(uuid,uuid,text,uuid,text,integer,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'Service claim unavailable'; END IF;
END $$;
SET ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM 1 FROM public.mdn_ai_attempts_v1; RAISE EXCEPTION 'Service bypassed RPC via direct ledger read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000007','analyze-shelf','56000000-0000-4000-8000-000000000001','google-gemini',100,100,5); RAISE EXCEPTION 'Inactive actor allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000006','analyze-shelf','56000000-0000-4000-8000-000000000001','google-gemini',100,100,5); RAISE EXCEPTION 'Foreign actor allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','analyze-shelf','56000000-0000-4000-8000-000000000002','google-gemini',100,100,5); RAISE EXCEPTION 'Peer record allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','other','56000000-0000-4000-8000-000000000001','google-gemini',100,100,5); RAISE EXCEPTION 'Unknown operation allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','analyze-shelf','56000000-0000-4000-8000-000000000001','google-gemini',NULL,100,5); RAISE EXCEPTION 'Null cap allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
-- Failed provider calls and every subsequent fallback retain distinct counted rows.
DO $$ DECLARE attempt uuid; second uuid; BEGIN
 attempt:=public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','analyze-shelf','56000000-0000-4000-8000-000000000001','google-gemini',100,100,5);
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','analyze-shelf','56000000-0000-4000-8000-000000000001','anthropic',100,100,5); RAISE EXCEPTION 'Duplicate in-flight record allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'AI_ATTEMPT_IN_PROGRESS' THEN RAISE; END IF; END;
 IF public.mdn_finish_ai_attempt_v1(attempt,'failed','60000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Foreign company finish accepted'; END IF;
 IF public.mdn_finish_ai_attempt_v1(attempt,'failed','50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Wrong requester finish accepted'; END IF;
 IF NOT public.mdn_finish_ai_attempt_v1(attempt,'failed','50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Failed attempt not acknowledged'; END IF;
 IF NOT public.mdn_finish_ai_attempt_v1(attempt,'failed','50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Completion receipt not idempotent'; END IF;
 IF public.mdn_finish_ai_attempt_v1(attempt,'succeeded','50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Terminal outcome overwritten'; END IF;
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','discover-customers','58000000-0000-4000-8000-000000000001','google-gemini',1,100,5); RAISE EXCEPTION 'Failed attempt disappeared from day cap'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'AI_QUOTA_COMPANY_DAY' THEN RAISE; END IF; END;
 second:=public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','analyze-shelf','56000000-0000-4000-8000-000000000001','anthropic',100,100,5);
 IF attempt=second THEN RAISE EXCEPTION 'Fallback reused a paid attempt'; END IF;
 PERFORM public.mdn_finish_ai_attempt_v1(second,'succeeded','50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001');
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','discover-customers','58000000-0000-4000-8000-000000000001','google-gemini',100,2,5); RAISE EXCEPTION 'Cross-operation user cap bypassed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'AI_QUOTA_USER_HOUR' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
TRUNCATE public.mdn_ai_attempts_v1;
-- A network timeout is not a definite provider failure. Its lease remains
-- reserved; a later failed receipt cannot release it early or admit fallback.
SET ROLE service_role;
DO $$ DECLARE attempt uuid; BEGIN
 attempt:=public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','discover-customers','58000000-0000-4000-8000-000000000001','google-gemini',100,100,1);
 IF NOT public.mdn_finish_ai_attempt_v1(attempt,'uncertain','50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Uncertain receipt not acknowledged'; END IF;
 IF NOT public.mdn_finish_ai_attempt_v1(attempt,'uncertain','50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Uncertain receipt not idempotent'; END IF;
 IF public.mdn_finish_ai_attempt_v1(attempt,'failed','50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Unknown provider outcome rewritten as definite failure'; END IF;
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','discover-customers','58000000-0000-4000-8000-000000000001','anthropic',100,100,5); RAISE EXCEPTION 'Uncertain same-record fallback admitted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'AI_ATTEMPT_IN_PROGRESS' THEN RAISE; END IF; END;
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','discover-customers','58000000-0000-4000-8000-000000000002','anthropic',100,100,1); RAISE EXCEPTION 'Uncertain concurrent slot released'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'AI_QUOTA_CONCURRENT' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
UPDATE public.mdn_ai_attempts_v1 SET started_at=clock_timestamp()-interval '200 seconds',lease_expires_at=clock_timestamp()-interval '20 seconds';
SET ROLE service_role;
SELECT public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','discover-customers','58000000-0000-4000-8000-000000000002','anthropic',100,100,1);
DO $$ BEGIN
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','discover-customers','58000000-0000-4000-8000-000000000003','anthropic',100,1,5); RAISE EXCEPTION 'Expired uncertain attempt disappeared from user budget'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'AI_QUOTA_USER_HOUR' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM mdn_ai_attempts_v1 WHERE status='expired')<>1 OR (SELECT count(*) FROM mdn_ai_attempts_v1)<>2 THEN RAISE EXCEPTION 'Uncertain expiry lost history'; END IF;
END $$;
TRUNCATE public.mdn_ai_attempts_v1;
-- An admin analyzes a colleague's row, but its own user budget is charged.
SET ROLE service_role;
SELECT public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000004','analyze-shelf','56000000-0000-4000-8000-000000000002','google-gemini',100,100,5);
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM mdn_ai_attempts_v1 WHERE supervisor_id='50000000-0000-4000-8000-000000000004' AND record_supervisor_id='50000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Admin actor/owner accounting confused'; END IF;
END $$;
UPDATE public.mdn_ai_attempts_v1 SET started_at=clock_timestamp()-interval '200 seconds',lease_expires_at=clock_timestamp()-interval '20 seconds';
SET ROLE service_role;
SELECT public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','discover-customers','58000000-0000-4000-8000-000000000001','google-gemini',100,100,1);
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM mdn_ai_attempts_v1)<>2 OR (SELECT count(*) FROM mdn_ai_attempts_v1 WHERE status='expired')<>1 THEN RAISE EXCEPTION 'Expiry released paid history instead of only its slot'; END IF;
END $$;
-- Closed or expired companies cannot allocate a new provider request.
UPDATE public.companies SET expires_at=clock_timestamp()-interval '1 second' WHERE id='50000000-0000-4000-8000-000000000000';
SET ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','discover-customers','58000000-0000-4000-8000-000000000002','google-gemini',100,100,5); RAISE EXCEPTION 'Expired company charged AI'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.companies SET expires_at=NULL WHERE id='50000000-0000-4000-8000-000000000000';
UPDATE public.companies SET is_active=false WHERE id='50000000-0000-4000-8000-000000000000';
SET ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','discover-customers','58000000-0000-4000-8000-000000000002','google-gemini',100,100,5); RAISE EXCEPTION 'Inactive company charged AI'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.companies SET is_active=true WHERE id='50000000-0000-4000-8000-000000000000';
UPDATE public.supervisors SET role=NULL WHERE id='50000000-0000-4000-8000-000000000009';
SET ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000009','discover-customers','58000000-0000-4000-8000-000000000002','google-gemini',100,100,5); RAISE EXCEPTION 'Null role charged AI'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.supervisors SET role='super_admin' WHERE id='50000000-0000-4000-8000-000000000009';
-- Deleting an admin requester with no business ownership must not delete/block
-- its historical operational accounting. A missing actor cannot reserve again.
DELETE FROM public.supervisors WHERE id='50000000-0000-4000-8000-000000000004';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.mdn_ai_attempts_v1 WHERE supervisor_id='50000000-0000-4000-8000-000000000004') THEN RAISE EXCEPTION 'Requester deletion erased accounting'; END IF;
END $$;
SET ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000004','analyze-shelf','56000000-0000-4000-8000-000000000002','google-gemini',100,100,5); RAISE EXCEPTION 'Deleted actor reserved AI'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'AI ledger authorization, failed-attempt accounting and lease tests passed' AS result;
