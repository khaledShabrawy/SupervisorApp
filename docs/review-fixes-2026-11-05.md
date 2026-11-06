# Review fixes — 2026-11-05

Implemented after local source review and isolated Chromium reproduction. No production database migration, application deployment, or live account operation was performed.

## Reliability and authorization

- Store new pending actions independently, preserve additions made during uploads (including from another tab), and coalesce concurrent upload requests. Read existing array queues without deleting another account's records. Surface local storage failures instead of reporting a successful save.
- Verify the current authenticated supervisor and tenant before synchronization. Preserve failed actions and require an updated row for visit-status/outcome updates. Accept the scoped queue payloads actually emitted by the application, which do not duplicate `company_id` inside the payload.
- Restore persisted sessions instead of signing out whenever a new tab opens. Revalidate supervisor authorization on authentication updates and load `force_password_change` and `supervisor_code`.
- Verify all password-change steps, refresh the loaded supervisor before navigation, and keep the recovery form available for fresh recovery sessions.
- Require explicit screen grants. **Existing accounts with missing permission rows now need an administrator to save their intended screen permissions.** No automatic permission grants or live backfill was applied.
- Block operations when company settings, subscription status, or device binding cannot be confirmed. Provide retries. Verify the saved device after its binding RPC.

## Data safety and user experience

- Neutralize spreadsheet formulas in CSV text cells, while preserving numeric values and CSV escaping.
- Keep notification navigation on app-relative paths, including rejecting encoded backslash/protocol-relative redirects. React Router is now pinned to 7.18.5 in both packages. The obsolete v6 future flags were removed, and route behavior was retested. The production dependency audit now reports zero advisories.
- Correct meter units in out-of-range notification text and actually execute the lazy alert insert after a successful visit.
- Return an email-delivery error rather than generating an unused recovery link and claiming success. Persist all invite screen permissions explicitly; surface persistence failures and forced-password-change flag errors. These Edge Function changes require a separate deployment before affecting a live backend.
- Replace unmeasured AI accuracy/latency guarantees and static server-health claims with factual feature descriptions. Describe offline upload as an explicit user action.
- Use neutral empty-data wording and distinguish an unset target from poor performance. Reduce competing dashboard action colors and improve mobile secondary-text contrast.
- Associate form labels correctly and add keyboard focus trapping/restoration plus Escape support to shared sheets and confirmation dialogs. This is not a complete WCAG certification of every custom admin modal.

## Validation

See `scripts/testing/README.md` for the repeatable commands and isolated browser setup. The final task report records the observed counts and results. React Router 7.18.5, Vite 7.3.7 and Capacitor CLI 7.6.10 are recorded in the manifests and lockfiles. Use the pinned pnpm installation: workspace overrides and the integrity-tracked deepmerge patch are applied by pnpm, not by the legacy standalone npm lockfile.

Before release, validate on staging with the real schema, configured public Supabase settings, dedicated test users, and two isolated companies. Confirm RLS, deployed device-binding RPC, password-change column grants, invitation delivery/redirect settings, and an entire attendance → visit → order → completion journey. Test physical GPS/camera, offline restart and PWA update behavior, Android packaging, and live AI/push integrations separately. The checked-in SQL contains the newly selected supervisor columns; live schema availability was not assumed or modified.

## Follow-up completion

- Added complete synthetic attendance → geofenced visit → required task → order total → checkout browser coverage, and preserved online attendance coordinates. Corrected queued-attendance messages and modal accessibility.
- Corrected real offline shell handling: a failed worker install leaves the previous release active; navigation cannot mix fresh HTML with uncached chunks; public immutable assets ignore transport Vary headers; admin HTML remains online-only.
- Updated compatible transitive build dependencies. Scoped glob 14 overrides are covered against Workbox's sync API and rimraf's deletion behavior. The upstream deepmerge release has no fixed version; a pnpm package patch uses data-property definitions to prevent prototype poisoning, with a regression test against the actual installed dependency. The version-based scanner still reports this one low-severity advisory. No finding is suppressed.
- Added CI browser/PWA checks and a manually selected release workflow, plus read-only live schema/identity/read-isolation checks. Empty fixtures produce an incomplete result, not a false pass.
- Prepared the user-selected Supabase project and Cloudflare Pages target in `scripts/deploy/targets.json`. Real deployment verifies endpoint/key pairing and the Cloudflare account/project/production branch before changes. The release function list is explicit; it does not push database migrations, disable JWT verification, or prune functions.
- Deployment CLI authentication is unavailable in the current instance. Neither hosted application deployment nor live RLS acceptance is claimed. See `docs/release-readiness-2026-11-05.md` for target details and the exact secure prerequisites.

## Final pre-release pass

- Assign and persist UUIDs before the first write; recover matching scoped receipts after a dropped response. Replay inserts without UPSERT so completed visits and delivered orders cannot be reset. Check attendance by its existing day uniqueness and preserve its original check-in timestamp.
- Make profile edits atomic through a checked administrative RPC, including supervisor code, and route device reset through it. Read the trusted password-change acknowledgement instead of attempting to clear protected flags from a client.
- Replace ten duplicate admin module implementations with compatibility re-exports of the maintained admin screens. Group navigation into monitoring, teams/data and system settings.
- Add a sanitized eight-table schema contract and isolated PostgreSQL authorization tests. The SQL proposal is intentionally outside automatic migrations and was not applied live.
- Read-only live inspection found missing RPCs, an overbroad orders policy, a quantity-only schema/legacy price-bearing UI conflict, and no API-visible database backups/PITR. See the current release-readiness document for evidence and remaining acceptance work; earlier access-blocked notes in this log describe the earlier environment only.

## 2026-11-06 release preparation

The product scope was rechecked and sales flows were removed entirely, including their routes, pricing forms/imports, financial targets and offline submission. Legacy queued sales are retained without uploading. Removed the fabricated shelf-analysis fallback and explicitly labelled manual review. Added a real browser test for each behavior. Prepared and tested an exact configuration rollback, narrowed cascade-delete authorization, and added NULL-role denial. See `release-status-2026-11-06.md` for the current deployment state and the automatic approval review block; the SQL remains unapplied.
