#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
container_name="mydan-security-test-${RANDOM}-$$"
schema_fixture="scripts/testing/database/fixture.sql"
if [[ "${1:-}" == "--full-schema" ]]; then
  schema_fixture="scripts/testing/database/full-schema.sql"
elif [[ -n "${1:-}" ]]; then
  echo 'Usage: run.sh [--full-schema]' >&2
  exit 2
fi
docker_local() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
trap 'docker_local rm -f "$container_name" >/dev/null 2>&1 || true' EXIT
# No host ports, host data mounts or real credentials. The database is disposable.
docker_local run -d --name "$container_name" --network none --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine@sha256:562a6e0a66b5136bc28bef5944bbc2ddddf8ea0058d4016b96cee63f2edaf143 >/dev/null
for attempt in $(seq 1 30); do
  if docker_local exec "$container_name" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
for script in "$schema_fixture" supabase/proposals/20261105_pre_release_hardening.sql scripts/testing/database/assertions.sql supabase/rollback/20261106_authorization.sql scripts/testing/database/rollback-assertions.sql supabase/proposals/20261105_pre_release_hardening.sql; do
  docker_local exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres < "$script"
done
