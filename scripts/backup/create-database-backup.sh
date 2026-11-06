#!/usr/bin/env bash
# Run on a trusted machine with pg_dump/pg_dumpall 17+ and permitted PostgreSQL access.
# No password/connection string is accepted on the command line or printed.
set -euo pipefail
umask 077
if [[ $# -ne 2 ]]; then
  echo 'Usage: create-database-backup.sh OUTPUT_DIRECTORY ENCRYPTION_KEY_FILE' >&2
  exit 2
fi
script_dir="$(cd "$(dirname "$0")" && pwd)"
: "${SUPABASE_PROJECT_REF:?Set the explicitly selected project ref.}"
: "${PGHOST:?Configure the session-pooler/direct PostgreSQL host securely.}"
: "${PGUSER:?Configure the PostgreSQL user securely.}"
: "${PGPASSWORD:?Configure the database password securely; never paste it into chat.}"
: "${PGDATABASE:=postgres}"
: "${PGPORT:=5432}"
if [[ ! "$SUPABASE_PROJECT_REF" =~ ^[a-z]{20}$ ]] || \
   { [[ "$PGHOST" != "db.${SUPABASE_PROJECT_REF}.supabase.co" ]] && [[ "$PGUSER" != "postgres.${SUPABASE_PROJECT_REF}" ]]; }; then
  echo 'Database connection does not match the explicitly selected project.' >&2
  exit 1
fi
if [[ "$PGPORT" != 5432 ]]; then
  echo 'Use the direct connection or session pooler on port 5432, not a transaction pooler.' >&2
  exit 1
fi
export PGDATABASE PGPORT PGSSLMODE=verify-full
export PGSSLROOTCERT="${PGSSLROOTCERT:-system}"
export PGOPTIONS="${PGOPTIONS:-} -c default_transaction_read_only=on"
for executable in pg_dump pg_dumpall python3; do command -v "$executable" >/dev/null; done
python3 -c 'import cryptography'
# Fail before contacting the database if the key is absent or unsafe.
python3 - "$script_dir" "$2" <<'PY'
import pathlib,sys
sys.path.insert(0,sys.argv[1])
from encrypted_stream import read_key
read_key(pathlib.Path(sys.argv[2]))
PY
backup_dir="$1"
mkdir "$backup_dir"
chmod 700 "$backup_dir"
trap 'echo "Backup stopped before completion. Do not use an archive without a complete manifest." >&2' ERR
pg_dump --no-password --format=custom --serializable-deferrable \
  2> "$backup_dir/database-export.log" | \
  python3 "$script_dir/encrypted_stream.py" encrypt --key-file "$2" --output "$backup_dir/database.dump.enc.partial"
pg_dumpall --no-password --roles-only --no-role-passwords \
  2> "$backup_dir/roles-export.log" | \
  python3 "$script_dir/encrypted_stream.py" encrypt --key-file "$2" --output "$backup_dir/roles.sql.enc.partial"
python3 "$script_dir/encrypted_stream.py" verify --key-file "$2" "$backup_dir/database.dump.enc.partial"
python3 "$script_dir/encrypted_stream.py" verify --key-file "$2" "$backup_dir/roles.sql.enc.partial"
mv "$backup_dir/database.dump.enc.partial" "$backup_dir/database.dump.enc"
mv "$backup_dir/roles.sql.enc.partial" "$backup_dir/roles.sql.enc"
python3 - "$backup_dir" <<'PY'
import datetime,hashlib,json,os,pathlib,sys
p=pathlib.Path(sys.argv[1])
manifest={'status':'export-complete-restore-not-yet-tested','project_ref':os.environ['SUPABASE_PROJECT_REF'],
 'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'includes':['database schema/data/ACLs','role definitions without role passwords'],
 'excludes':['Storage object file bytes','Edge Function secrets','provider project settings'],
 'files':{n:hashlib.file_digest((p/n).open('rb'),'sha256').hexdigest() for n in ['database.dump.enc','roles.sql.enc']}}
(p/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Encrypted database export completed. A restore test and separate offsite copy are still required.')
PY
