#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
name="mydan-scale-test-${RANDOM}-$$"
docker_local() { env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"; }
trap 'docker_local rm -f "$name" >/dev/null 2>&1 || true' EXIT
docker_local run -d --name "$name" --network none --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine@sha256:562a6e0a66b5136bc28bef5944bbc2ddddf8ea0058d4016b96cee63f2edaf143 >/dev/null
for attempt in $(seq 1 30); do
  if docker_local exec "$name" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
run_sql() { docker_local exec -i "$name" psql -X -q -v ON_ERROR_STOP=1 -U postgres < "$1"; }
for script in scripts/testing/database/full-schema.sql supabase/proposals/20261105_pre_release_hardening.sql supabase/proposals/20261106_manager_tasks.sql scripts/testing/database/manager-task-assertions.sql; do run_sql "$script"; done
python3 scripts/testing/database/manager-task-concurrency.py "$name"
for script in scripts/testing/database/scale-seed.sql supabase/proposals/20261106_survey_ownership.sql supabase/proposals/20261106_ai_attempt_ledger.sql scripts/testing/database/survey-scope-assertions.sql scripts/testing/database/ai-ledger-assertions.sql; do run_sql "$script"; done
# Exercise the exact read-only release gate against the synthesized schema.
contract_query=$(python3 -c 'from pathlib import Path; s=Path("scripts/deploy/release.mjs").read_text(); print(s.split("const query = `", 1)[1].split("`;", 1)[0])')
contract_ready=$(printf '%s\n' "$contract_query" | docker_local exec -i "$name" psql -X -q -t -A -v ON_ERROR_STOP=1 -U postgres)
if [[ "$contract_ready" != t ]]; then
  printf '%s\n' 'Release server contract rejected the proposed schema.' >&2
  exit 1
fi
python3 scripts/testing/database/ai-ledger-concurrency.py "$name"
for script in supabase/rollback/20261106_ai_attempt_ledger.sql supabase/rollback/20261106_survey_ownership.sql scripts/testing/database/scale-rollback-assertions.sql supabase/proposals/20261106_survey_ownership.sql supabase/proposals/20261106_ai_attempt_ledger.sql scripts/testing/database/scale-reapply-assertions.sql supabase/rollback/20261106_manager_tasks.sql; do run_sql "$script"; done
printf '%s\n' "DO \$\$ BEGIN IF to_regprocedure('public.mdn_save_visit_task_v1(uuid,uuid,text,text,boolean)') IS NOT NULL THEN RAISE EXCEPTION 'Task RPC remained after rollback'; END IF; IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visits' AND policyname='visits_own') THEN RAISE EXCEPTION 'Original visits policy missing'; END IF; END \$\$;" | docker_local exec -i "$name" psql -X -q -v ON_ERROR_STOP=1 -U postgres
run_sql supabase/proposals/20261106_manager_tasks.sql
printf '%s\n' 'Scaling SQL forward/rollback/reapplication tests passed.'
