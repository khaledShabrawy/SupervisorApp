-- Disable the new accounting API without discarding its paid-attempt history.
-- The ledger deliberately remains RLS-protected and inaccessible to every API
-- role. Reapplication reuses its rows so rollback cannot reset daily budgets.
-- Do not DROP/TRUNCATE this table as an emergency rollback.
BEGIN;
DROP FUNCTION IF EXISTS public.mdn_finish_ai_attempt_v1(uuid,text,uuid,uuid);
DROP FUNCTION IF EXISTS public.mdn_claim_ai_attempt_v1(uuid,uuid,text,uuid,text,integer,integer,integer);
ALTER TABLE public.mdn_ai_attempts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mdn_ai_attempts_v1 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
