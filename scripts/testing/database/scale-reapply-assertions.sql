DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.mdn_ai_attempts_v1) THEN RAISE EXCEPTION 'Reapply discarded paid attempt history'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='field_surveys' AND policyname='mdn_field_surveys_read_v1') THEN RAISE EXCEPTION 'Scoped policies did not reapply'; END IF;
END $$;
SET ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM public.mdn_claim_ai_attempt_v1('50000000-0000-4000-8000-000000000000','50000000-0000-4000-8000-000000000001','discover-customers','58000000-0000-4000-8000-000000000040','google-gemini',1,100,100); RAISE EXCEPTION 'Reapply reset paid history quota'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'AI_QUOTA_COMPANY_DAY' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT 'reapplication preserves paid history and restored protections' AS result;
