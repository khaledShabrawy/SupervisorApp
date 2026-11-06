# Backup and staging workflow

Current production project: `ywdlrrdkjbtpfgacuuoy`. Export/restore preparation does **not** authorize applying the security proposal to production. The earlier automatic approval rejection remains in effect.

## What is available now

- A read-only catalog export of the complete **application** schema: 33 tables, 6 views, 20 functions/helpers, 137 constraints, 36 additional indexes, 5 triggers and 89 application policies.
- `scripts/testing/database/full-schema.sql` recreates that application catalog in a **fresh disposable PostgreSQL database**. Auth has only a synthetic `auth.users` stub and captured helper functions. Storage file bytes, managed service internals and real users/business rows are not copied.
- `bash scripts/testing/database/run.sh --full-schema` applies the proposal, tests authorization, rolls it back, verifies the original grants/policy, and reapplies it. This is local schema compatibility testing, not a hosted Supabase staging project.
- `python3 scripts/testing/database/backup-roundtrip.py` performs a genuine `pg_dump` of this synthetic fixture, encrypts it, verifies tamper/wrong-key/truncation rejection, restores it into a second network-isolated database, compares every synthetic table checksum, and checks restored authorization.

## Metadata export

The configured Management API token can read catalogs over HTTPS. It is not the PostgreSQL password and cannot be substituted for `PGPASSWORD`.

```sh
python3 scripts/backup/export_catalog.py --output /secure/path/application-catalog.json
python3 scripts/backup/render_catalog.py /secure/path/application-catalog.json /secure/path/application-schema.sql
```

The catalog script sends `read_only=true` and a catalog-only SELECT. It exports no business rows, user identities, password hashes or API keys. The renderer refuses unsupported types/sequences/partitions rather than silently omitting them. The generated SQL refuses a database with an existing Auth schema. Never run the fixture against a hosted project.

## Complete database export prerequisites

Run the exporter on a trusted machine with **PostgreSQL client 17 or newer**, Python, and the isolated dependency below. Use the direct connection or **session** pooler on port 5432 shown by the project's **Connect** panel. Do not use the transaction pooler.

Required environment names: `SUPABASE_PROJECT_REF`, `PGHOST`, `PGUSER`, `PGPASSWORD`. `PGDATABASE` defaults to `postgres`, `PGPORT` to `5432`. Provide secrets through the machine's secure credential mechanism, never chat, Git, command arguments or source files. `SUPABASE_ACCESS_TOKEN`, browser publishable keys, and Cloudflare tokens do not replace the database password.

TLS uses `sslmode=verify-full`; the default root store is `system`. If Supabase requires its downloadable database root CA, configure `PGSSLROOTCERT` to that certificate path. Do not disable TLS verification. The managed Codex environment currently has **no PostgreSQL TCP grants**, so merely adding a password here does not establish a usable connection; this export must wait for supported PostgreSQL access or run on the owner's trusted machine.

```sh
python3 -m venv /secure/path/mydan-backup-tools
/secure/path/mydan-backup-tools/bin/pip install -r scripts/backup/requirements.txt
```

Activate that environment using your shell's normal method. Generate a random encryption key once:

```sh
python3 scripts/backup/encrypted_stream.py init-key --output /secure/separate-location/mydan.backup-key
bash scripts/backup/create-database-backup.sh /secure/backups/mydan-YYYYMMDD /secure/separate-location/mydan.backup-key
```

The exporter streams `pg_dump --format=custom --serializable-deferrable` and password-free role definitions directly into AES-256-GCM encryption. Plaintext dumps are not saved. Failures leave no successful manifest. A completed export is labelled **restore not yet tested** until a separate restore succeeds.

Copy the encrypted archives and manifest to a separate private destination. Keep the key in a separate secure location; losing it makes recovery impossible. Do not put the key beside the offsite archive or upload either to GitHub. This execution workspace alone is not an offsite backup.

## Restore acceptance

Authenticate the **whole** encrypted file before any restore command sees plaintext. `verified_plaintext` provides an unlinked temporary file only after GCM verification; do not pipe unauthenticated decrypted bytes into a SQL interpreter. Restore only into a new, explicitly selected disposable/staging database with compatible Supabase extensions/services and role definitions. Never restore over production to test a backup.

Acceptance must compare table counts/data checksums, constraints, policies, effective grants, functions and triggers. Then test Auth sign-in/recovery, device binding, supervisor/admin tenant isolation and representative writes using **synthetic staging accounts**. A successful synthetic test here does not prove that a real production export can be restored or that Supabase Auth/Storage/Edge services work end to end.

Database export does not include Storage object **file bytes**, Edge Function secret values or provider project settings. Plan a separate protected Storage export and secure recovery of server secrets before describing the whole project as backed up. Do not publish or copy real business rows into the test fixtures.

## Current blocker

No PostgreSQL password/connection credential, native TCP grant, hosted staging project, or external backup destination is available in the current environment. The live backup API lists zero backups and PITR disabled. **No production database backup has been created or tested.** Do not confuse the application catalog snapshot or synthetic archive test with one.
