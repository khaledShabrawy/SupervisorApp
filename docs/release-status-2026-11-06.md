# Release status — 2026-11-06

## Product reconciliation completed

The product scope in `replit.md` explicitly excludes sales orders, including quantity-only orders. The earlier readiness note incorrectly treated a quantity-only sales flow as a possible launch option. This release removes the sales screens, routes, admin report, hooks, financial product fields, financial target fields and CSV examples. Historical database rows are retained. Legacy queued sales actions remain locally available for reconciliation but are never sent to the server.

The field journey remains attendance, geofenced visits, manager-defined tasks, shelf audits, surveys, training and checkout. Catalog products and visit/audit targets remain available without pricing. Administrative profile deletion now requires the checked server RPC; it cannot fall back to a less restricted direct DELETE.

## Truthful shelf analysis

The former client fallback wrote fixed scores, facings and shelf shares after a failed AI call. It has been removed. A failed real analysis remains an error with retry, and it never creates a completed substitute report. Manual review is explicitly labelled and writes no AI score; its update is scoped to the authenticated supervisor and company and requires an updated-row receipt.

## Database change prepared, not applied

`supabase/proposals/20261105_pre_release_hardening.sql` now:

- Limits direct supervisor updates to name/phone, and routes privileged edits and device reset through a checked RPC.
- Adds first-device binding and a trusted Auth password-change trigger.
- Revokes client table and column privileges on historical orders, revokes the order-status RPC, and removes the permissive legacy orders policy. It does not delete historical rows or tables.
- Requires checked RPC deletion of supervisors and enforces the branch-manager role ceiling.

`supabase/rollback/20261106_authorization.sql` was generated from a read-only snapshot of the exact original grants, policy and function definitions. Local PostgreSQL tests passed forward application, authorization checks, rollback checks, and reapplication. The rollback restores the original authorization weaknesses and is for emergency recovery only. This is a configuration rollback, not a full business-data backup. Supabase's backup API still reports no available backups and PITR disabled.

A guarded live execution was prepared to reject catalog drift inside the transaction. Automatic approval review rejected its application to production because it needs approval explicitly covering this authorization change and its impact. **No live SQL was executed.** Do not work around the rejection or deploy the dependent frontend to production before this step is resolved.

## Verification

- TypeScript and 75 automated tests passed. The obsolete sales KPI test was removed with the sales module.
- 17 isolated Chromium scenarios passed, including the task-focused field journey, rejected sales routes/retained legacy queues, and AI outage without a fabricated report.
- Production build passed. Nine built service-worker tests and an actual offline PWA smoke passed; 57 public cache entries, no private API data.
- Disposable PostgreSQL forward/rollback/reapply tests passed, including a NULL administrator role failing closed.
- Cloudflare preview and production public keys both returned HTTP 200 from the intended Supabase Auth endpoint. The Codex runtime public variable remains distinct from those verified Cloudflare settings.
- Live `analyze-shelf` v14 and `invite-supervisor` v9 are ACTIVE with JWT verification enabled. No live AI requests, test accounts or business writes were used.
- GitHub CI was fully green on the previous review commit. The latest code must receive its own successful CI run before merge.

## Release sequence after approval

1. Recheck that live configuration still matches the captured snapshot; apply the reviewed transaction. Read back RPC, trigger, policy and effective privilege metadata.
2. Deploy only the reviewed invite-supervisor function with JWT verification kept enabled. Do not deploy all functions, prune or push unrelated SQL.
3. Merge the reviewed branch only after its CI passes, then verify the resulting Cloudflare production deployment and public login shell.
4. Retain the previous Cloudflare production deployment ID and the configuration rollback. Reverting the web deployment alone does not revert database authorization.

No merge to main, production web deployment, production function deployment or production SQL application has occurred in this pass. Existing Git integrations build branch previews automatically.
