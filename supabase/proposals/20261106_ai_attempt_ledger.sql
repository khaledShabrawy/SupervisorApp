-- PROSPECTIVE, REVIEW REQUIRED. This new ledger/RPC contract is NOT deployed.
-- Apply only to a reviewed staging schema before any production approval.
-- Every provider request/fallback gets a fresh attempt. Failed and expired
-- reservations remain counted; expiry releases only the concurrent slot.
BEGIN;
CREATE TABLE IF NOT EXISTS public.mdn_ai_attempts_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 supervisor_id uuid NOT NULL, -- requester UUID snapshot; profile deletion does not erase accounting
 record_supervisor_id uuid NOT NULL, -- immutable source-owner UUID snapshot, checked at claim
 operation text NOT NULL CHECK (operation IN ('analyze-shelf','discover-customers')),
 record_id uuid NOT NULL,
 provider text NOT NULL CHECK (provider IN ('google-gemini','anthropic')),
 status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','uncertain','expired')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_expires_at timestamptz NOT NULL,
 finished_at timestamptz,
 CONSTRAINT mdn_ai_attempt_terminal_time_v1 CHECK (
   (status='running' AND finished_at IS NULL) OR (status<>'running' AND finished_at IS NOT NULL)),
 CONSTRAINT mdn_ai_attempt_lease_v1 CHECK (lease_expires_at > started_at)
);
CREATE INDEX IF NOT EXISTS mdn_ai_attempt_company_day_v1 ON public.mdn_ai_attempts_v1(company_id,started_at);
CREATE INDEX IF NOT EXISTS mdn_ai_attempt_user_hour_v1 ON public.mdn_ai_attempts_v1(company_id,supervisor_id,started_at);
CREATE INDEX IF NOT EXISTS mdn_ai_attempt_record_v1 ON public.mdn_ai_attempts_v1(operation,record_id);
CREATE INDEX IF NOT EXISTS mdn_ai_attempt_live_lease_v1 ON public.mdn_ai_attempts_v1(company_id,lease_expires_at)
 WHERE status IN ('running','uncertain');
CREATE UNIQUE INDEX IF NOT EXISTS mdn_ai_attempt_running_record_v1
 ON public.mdn_ai_attempts_v1(operation,record_id) WHERE status IN ('running','uncertain');
ALTER TABLE public.mdn_ai_attempts_v1 ENABLE ROW LEVEL SECURITY;
-- Supabase default privileges may otherwise grant a newly created table broadly.
REVOKE ALL ON TABLE public.mdn_ai_attempts_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.mdn_claim_ai_attempt_v1(
 p_company_id uuid,p_supervisor_id uuid,p_operation text,p_record_id uuid,p_provider text,
 p_max_company_day integer,p_max_user_hour integer,p_max_concurrent integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
 actor public.supervisors%ROWTYPE;
 source_owner uuid;
 source_company uuid;
 v_now timestamptz;
 attempt_id uuid;
BEGIN
 IF p_company_id IS NULL OR p_supervisor_id IS NULL OR p_record_id IS NULL
   OR p_operation IS NULL OR p_operation NOT IN ('analyze-shelf','discover-customers')
   OR p_provider IS NULL OR p_provider NOT IN ('google-gemini','anthropic')
   OR p_max_company_day IS NULL OR p_max_company_day < 0
   OR p_max_user_hour IS NULL OR p_max_user_hour < 0
   OR p_max_concurrent IS NULL OR p_max_concurrent < 0 THEN
   RAISE EXCEPTION 'Invalid AI accounting parameters' USING ERRCODE='22023';
 END IF;
 -- One lock covers both operations/providers and every actor in the company.
 -- The timestamp is sampled AFTER waiting for the lock (including day boundaries).
 PERFORM pg_advisory_xact_lock(hashtextextended('mydan-ai-company-v1:'||p_company_id::text,0));
 v_now := clock_timestamp();
 SELECT * INTO actor FROM public.supervisors WHERE id=p_supervisor_id;
 IF NOT FOUND OR actor.is_active IS DISTINCT FROM true OR actor.company_id IS DISTINCT FROM p_company_id
   OR actor.role IS NULL OR actor.role NOT IN ('supervisor','senior_supervisor','branch_manager','admin','super_admin')
   OR NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id=p_company_id AND c.is_active IS TRUE
      AND (c.expires_at IS NULL OR c.expires_at>v_now)) THEN
   RAISE EXCEPTION 'AI actor is outside active company scope' USING ERRCODE='42501';
 END IF;
 IF p_operation='analyze-shelf' THEN
   SELECT company_id,supervisor_id INTO source_company,source_owner FROM public.shelf_audit
    WHERE id=p_record_id FOR SHARE;
 ELSE
   SELECT company_id,supervisor_id INTO source_company,source_owner FROM public.field_surveys
    WHERE id=p_record_id FOR SHARE;
 END IF;
 IF NOT FOUND OR source_company IS DISTINCT FROM p_company_id OR source_owner IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.supervisors s WHERE s.id=source_owner AND s.company_id=p_company_id)
   OR (source_owner<>actor.id AND actor.role NOT IN ('admin','super_admin')) THEN
   RAISE EXCEPTION 'AI record is outside actor scope' USING ERRCODE='42501';
 END IF;
 IF EXISTS (SELECT 1 FROM public.mdn_ai_attempts_v1 a WHERE a.operation=p_operation AND a.record_id=p_record_id
   AND (a.company_id IS DISTINCT FROM p_company_id OR a.record_supervisor_id IS DISTINCT FROM source_owner)) THEN
   RAISE EXCEPTION 'AI record identity changed since its first attempt' USING ERRCODE='42501';
 END IF;
 UPDATE public.mdn_ai_attempts_v1 SET status='expired',finished_at=coalesce(finished_at,v_now)
  WHERE company_id=p_company_id AND status IN ('running','uncertain') AND lease_expires_at<=v_now;
 IF EXISTS (SELECT 1 FROM public.mdn_ai_attempts_v1 a WHERE a.operation=p_operation
   AND a.record_id=p_record_id AND a.status IN ('running','uncertain')) THEN
   RAISE EXCEPTION 'AI_ATTEMPT_IN_PROGRESS';
 END IF;
 IF (SELECT count(*) FROM public.mdn_ai_attempts_v1 a WHERE a.company_id=p_company_id
   AND a.started_at >= (date_trunc('day',v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) >= p_max_company_day THEN
   RAISE EXCEPTION 'AI_QUOTA_COMPANY_DAY';
 END IF;
 IF (SELECT count(*) FROM public.mdn_ai_attempts_v1 a WHERE a.company_id=p_company_id
   AND a.supervisor_id=p_supervisor_id AND a.started_at>v_now-interval '1 hour') >= p_max_user_hour THEN
   RAISE EXCEPTION 'AI_QUOTA_USER_HOUR';
 END IF;
 IF (SELECT count(*) FROM public.mdn_ai_attempts_v1 a WHERE a.company_id=p_company_id
   AND a.status IN ('running','uncertain') AND a.lease_expires_at>v_now) >= p_max_concurrent THEN
   RAISE EXCEPTION 'AI_QUOTA_CONCURRENT';
 END IF;
 INSERT INTO public.mdn_ai_attempts_v1(company_id,supervisor_id,record_supervisor_id,operation,record_id,provider,started_at,lease_expires_at)
 VALUES(p_company_id,p_supervisor_id,source_owner,p_operation,p_record_id,p_provider,v_now,v_now+interval '180 seconds')
 RETURNING id INTO attempt_id;
 RETURN attempt_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mdn_claim_ai_attempt_v1(uuid,uuid,text,uuid,text,integer,integer,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mdn_claim_ai_attempt_v1(uuid,uuid,text,uuid,text,integer,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.mdn_finish_ai_attempt_v1(p_attempt_id uuid,p_status text,p_company_id uuid,p_supervisor_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target_company uuid; v_now timestamptz;
BEGIN
 IF p_attempt_id IS NULL OR p_company_id IS NULL OR p_supervisor_id IS NULL
   OR p_status IS NULL OR p_status NOT IN ('succeeded','failed','uncertain') THEN
   RAISE EXCEPTION 'Invalid AI attempt completion' USING ERRCODE='22023';
 END IF;
 SELECT company_id INTO target_company FROM public.mdn_ai_attempts_v1 WHERE id=p_attempt_id AND company_id=p_company_id AND supervisor_id=p_supervisor_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mydan-ai-company-v1:'||target_company::text,0));
 v_now := clock_timestamp();
 -- Expiration releases only the reservation, never its counted history.
 UPDATE public.mdn_ai_attempts_v1 SET status='expired',finished_at=coalesce(finished_at,v_now)
 WHERE id=p_attempt_id AND company_id=p_company_id AND supervisor_id=p_supervisor_id
   AND status IN ('running','uncertain') AND lease_expires_at<=v_now;
 UPDATE public.mdn_ai_attempts_v1 SET status=p_status,finished_at=v_now
 WHERE id=p_attempt_id AND company_id=p_company_id AND supervisor_id=p_supervisor_id
   AND status='running' AND lease_expires_at>v_now;
 -- A definite terminal receipt is idempotent. Uncertain receipts keep their
 -- lease and may not be rewritten as failed/succeeded to admit an early retry.
 RETURN EXISTS(SELECT 1 FROM public.mdn_ai_attempts_v1
   WHERE id=p_attempt_id AND company_id=p_company_id AND supervisor_id=p_supervisor_id
     AND status=p_status AND (p_status<>'uncertain' OR lease_expires_at>v_now));
END;
$$;
REVOKE ALL ON FUNCTION public.mdn_finish_ai_attempt_v1(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mdn_finish_ai_attempt_v1(uuid,text,uuid,uuid) TO service_role;
COMMIT;
