DO $$ BEGIN
 IF to_regprocedure('public.mdn_claim_ai_attempt_v1(uuid,uuid,text,uuid,text,integer,integer,integer)') IS NOT NULL THEN RAISE EXCEPTION 'Claim RPC remained after rollback'; END IF;
 IF to_regprocedure('public.mdn_finish_ai_attempt_v1(uuid,text,uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'Finish RPC remained after rollback'; END IF;
 IF NOT EXISTS(SELECT 1 FROM mdn_ai_attempts_v1) THEN RAISE EXCEPTION 'Rollback discarded paid attempt history'; END IF;
 IF has_table_privilege('authenticated','public.mdn_ai_attempts_v1','SELECT') OR has_table_privilege('service_role','public.mdn_ai_attempts_v1','INSERT') THEN RAISE EXCEPTION 'Retained ledger is externally writable/readable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='field_surveys' AND policyname='field_surveys_tenant') OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='survey_responses' AND policyname='survey_responses_own') THEN RAISE EXCEPTION 'Captured survey policies not restored'; END IF;
END $$;
SELECT 'scale configuration rollback retains paid history and restores captured policies' AS result;
