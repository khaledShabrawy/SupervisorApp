# Prospective survey ownership and AI-admission contracts

These files are review proposals, not migrations that have run on Supabase.
They do not change Auth settings, activate tenants, create real users or introduce
sales/financial features. Tests use the captured full application schema and
synthetic records inside network-isolated PostgreSQL containers.

## Survey ownership

`supabase/proposals/20261106_survey_ownership.sql` replaces the two broad captured
policies on `field_surveys` and `survey_responses`.

- Active `supervisor` accounts read and write their own records only.
- `senior_supervisor` may read the same branch scope already implemented by
  `private_rls.can_access_supervisor`, but cannot edit/delete a colleague's record.
- `admin`/`super_admin` manage their own company. `branch_manager` can manage only
  its own/explicitly assigned branches according to the existing helper.
- Inserts belong to the current active actor, including administrative actors;
  this does not add an administrative “submit for someone else” capability.
- Unknown/NULL/legacy `manager` roles receive no new permission. Inactive actors
  and anonymous requests cannot access records.
- Record ID, company and supervisor are immutable. Visit links must match the
  record's company and supervisor; questionnaire links must match the company.
- Existing rows are not rewritten or deleted. Invalid historic relationships may
  require a separately reviewed repair; the client cannot transfer ownership to
  repair them silently.

Rollback restores the exact captured original policies, including their known
broad scope. It removes only the new policies, helpers and identity triggers.
No table data is removed and no field-survey status constraint is widened. The
live status vocabulary remains `pending/in_progress/completed/rejected`; Edge/UI
must conform to it.

## Durable AI admission

`supabase/proposals/20261106_ai_attempt_ledger.sql` introduces the **new** private
operational ledger `public.mdn_ai_attempts_v1` and two service-only functions.
It tracks provider-request reservations, not invoices or sales activity. No new
client table grant or public reporting endpoint is added.

```text
mdn_claim_ai_attempt_v1(
  p_company_id uuid, p_supervisor_id uuid,
  p_operation text, p_record_id uuid, p_provider text,
  p_max_company_day integer, p_max_user_hour integer, p_max_concurrent integer
) -> uuid

mdn_finish_ai_attempt_v1(
  p_attempt_id uuid, p_status text,
  p_company_id uuid, p_supervisor_id uuid
) -> boolean
```

The Edge helper supplies company/requester IDs from its verified actor scope,
not request-body fields. Limits come from server configuration. Only the service
role can execute the functions; even authenticated administrators cannot call
them or read/write the ledger directly.

`p_operation` is `analyze-shelf` or `discover-customers`; provider is
`google-gemini` or `anthropic`. The actual source row must belong to the supplied
company and an existing owner. An active requester can analyze its own record;
only `admin/super_admin` can analyze another owner's row in that company. The
company must be active and unexpired. NULL/unknown/inactive/deleted actors fail
closed. The ledger separately snapshots the requester UUID and source-owner UUID
so an admin's action is charged to its own hourly admission budget, not the
worker's. A record cannot be reused under another company/source owner.

A transaction-scoped advisory lock serializes admissions and completion within
each company across **both** operations/providers. The server samples time after
acquiring the lock. UTC-day/user-hour counters include every reserved attempt,
including failures, expiry and uncertain outcomes; they do not count only
successful output rows. Each candidate model or fallback request requires a new
reservation. Refused admissions insert no row because no provider request may
start without its confirmed receipt.

A running attempt has a fixed 180-second lease. Provider requests use the shorter
25-second deadline in the Edge helper. Definite `failed` or `succeeded` outcomes
release the concurrent slot. `uncertain` means the client stopped waiting without
a definite provider outcome; it records the end of that wait but retains its
company slot and same-record reservation until lease expiry. It cannot be
rewritten to `failed` just to admit a fallback. Expiry releases only reservations,
not quota history. The lease is an admission bound, not proof that a provider
canceled work after a disconnected client.

Definite receipts are idempotent for the same status/company/requester. Wrong
company/requester, a different terminal status or an expired attempt returns
false. Missing/ambiguous receipts stop further provider calls.

Requester and owner UUIDs are immutable snapshots without profile foreign keys:
normal user deletion does not erase accounting or gain a new deletion obstacle.
A deleted requester cannot claim again. The company foreign key intentionally has
no cascading deletion: a company with operational history needs an explicit
retention/deletion workflow; ordinary deactivation is unaffected.

The rollback drops the accounting RPCs but deliberately retains the locked ledger
and all its history. Reapplication reuses those rows, so rollback cannot reset a
budget. It is not an exact empty-schema rollback and must not be followed by a
casual DROP/TRUNCATE of the ledger. Restoring the old survey policies has its own
independent rollback and does not alter this ledger.

## Local acceptance sequence

The shared runner is maintained by the parent task. The tested isolated sequence
for these files is:

1. `full-schema.sql`, then original `20261105_pre_release_hardening.sql`.
2. `scale-seed.sql` (synthetic identities only).
3. Apply `20261106_survey_ownership.sql` and `20261106_ai_attempt_ledger.sql`.
4. Run `survey-scope-assertions.sql` and `ai-ledger-assertions.sql`.
5. Run `ai-ledger-concurrency.py <disposable-container>`; it accepts only local
   `mydan-security-test-*`/`mydan-scale-test-*` containers, not connection URLs.
6. Apply ledger rollback, then survey rollback, then
   `scale-rollback-assertions.sql`.
7. Reapply both proposals and run `scale-reapply-assertions.sql`.

The concurrent test sends 75 synthetic claim requests, including a deliberately
uncommitted first reservation. It verifies only three admissions for a cap of
three, at most four attempts for a day cap of four even when every call fails,
one active attempt per record, and retained uncertain reservations/paid history
through expiry. It reports no real user data or credentials.

This does not establish a production backup, hosted Auth/Storage acceptance,
provider billing amounts, or a completed production deployment.
