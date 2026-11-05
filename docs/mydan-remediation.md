# Mydan remediation record

This is a **local, uncommitted review candidate**, based on repository SHA `9fe0ff54dc4b9feec734d84e4ea852e7103be754`. The owner approved local repair after the read-only audit, then confirmed that Mydan stays independent and sales/prices should be hidden while preserving historical code and data. No Corona database was accessed.

Implementation started 2026-11-04. This record supersedes product claims in older root notes. The original audit remains a separate, unchanged artifact. Local fixes do not establish production remediation.

## What changed

The existing React application is retained. The changes focus on authorization, truthful results, persistent execution, accurate measurements and maintainability. See [the current engineering contract](mydan-engineering-contract.md) and [user manual](Mydan_End_User_Manual.md).

The corrective SQL is a reviewed-source **draft only**. It creates private receipt/session/AI-lease/invitation ledgers, replaces affected RLS policies, restricts profile grants, guards role boundaries and parent/company links, supplies guarded RPCs and aggregates, and adds the Auth password-change trigger. It also makes known private buckets private. None of those changes have been applied to an external database.

## Finding-by-finding record

Severity is the original audit severity or the equivalent impact level for this remediation. **VERIFIED (LOCAL)** means observed in source/tests only. Every production outcome remains **NOT VERIFIED**. Partial items are deliberately not marked closed.

| Finding | Severity | Status | Change and impact | Source evidence | Verification |
|---|---|---|---|---|---|
| F01 | High | Local fix | No fabricated AI completion; legacy synthetic reports excluded | [artifacts/mydan/src/lib/screen-audit.ts:21](../artifacts/mydan/src/lib/screen-audit.ts#L21) | remediation.test.ts + SQL forgery/result tests |
| F02 | High | Local fix + SQL draft | Public branding is a three-field RPC; unrestricted root script retired | [artifacts/mydan/src/contexts/AppSettingsContext.tsx:28](../artifacts/mydan/src/contexts/AppSettingsContext.tsx#L28) | anonymous settings/projection SQL test |
| F03 | High | Local fix | Role/tenant/self guards protect password actions; UI uses the same pure policy | [supabase/functions/_shared/authorization.ts:7](../supabase/functions/_shared/authorization.ts#L7) | invitation.test.ts + browser password flow |
| F04 | High | SQL draft | Settings/price policies replace legacy permissive policies with explicit writes | [supabase/migrations/20261104195745_audit_remediation.sql:259](../supabase/migrations/20261104195745_audit_remediation.sql#L259) | ordinary-role DELETE and role-write SQL tests |
| F05 | High | Local fix + SQL draft; attestation remains outside scope | Fail-closed binding; session registry and revocation; direct device writes denied | [artifacts/mydan/src/lib/device-binding.ts:36](../artifacts/mydan/src/lib/device-binding.ts#L36) | browser false-binding + SQL mismatch/reset tests |
| F06 | High | Local fix + SQL draft | Both manager spellings enforce branch and lower-role ceilings | [supabase/migrations/20261104195745_audit_remediation.sql:147](../supabase/migrations/20261104195745_audit_remediation.sql#L147) | both-role branch/tenant negative SQL tests |
| F07 | High | Local fix + SQL draft | Trusted forced-change/time fields loaded; hash-change trigger and optional expiry enforced | [artifacts/mydan/src/contexts/AuthContext.tsx:84](../artifacts/mydan/src/contexts/AuthContext.tsx#L84) | browser forced change/expiry + SQL hash-change/expiry tests |
| F08 | High | Local fix | Cold-start listener remains active; profile failures clear authorization; token refresh revalidates; recovery callback survives old inactivity | [artifacts/mydan/src/contexts/AuthContext.tsx:59](../artifacts/mydan/src/contexts/AuthContext.tsx#L59) | mounted AuthProvider browser lifecycle + recovery tests |
| F09 | High | Local fix + SQL draft | Missing screen rows deny; explicit invitation permissions; server capability checks | [artifacts/mydan/src/lib/screen-policy.ts:11](../artifacts/mydan/src/lib/screen-policy.ts#L11) | remediation.test.ts + invitation permission SQL test |
| F10 | Medium | Local fix + SQL draft | Atomic guarded profile command, checked result, no direct-delete fallback; preserve historical work | [artifacts/mydan/src/lib/admin-data.ts:753](../artifacts/mydan/src/lib/admin-data.ts#L753) | atomic update/branch rejection SQL tests |
| F11 | High | Local fix + SQL draft | Authenticated settings/subscription failures block operational entry | [artifacts/mydan/src/contexts/AppSettingsContext.tsx:69](../artifacts/mydan/src/contexts/AppSettingsContext.tsx#L69) | browser settings failure + inactive-server SQL tests |
| F12 | High | Local fix + SQL draft | Persist before first request; one action receipt; individual acknowledgement and serialized replay | [artifacts/mydan/src/lib/offline-sync.ts:74](../artifacts/mydan/src/lib/offline-sync.ts#L74) | outbox.test.ts + browser unconfirmed receipt + SQL retry tests |
| F13 | High | Local fix; legacy recovery remains | Encrypted payload records; owner/session checks; owner-filtered legacy conversion retains foreign/malformed work | [artifacts/mydan/src/lib/outbox-store.ts:55](../artifacts/mydan/src/lib/outbox-store.ts#L55) | concurrent append, failed replay, encryption and legacy IDB tests |
| F14 | Medium | Local fix + SQL draft | Operational inbox notifications commit with their originating command; remove ineffective void inserts | [supabase/migrations/20261104195745_audit_remediation.sql:553](../supabase/migrations/20261104195745_audit_remediation.sql#L553) | SQL out-of-range and AI alert single-commit tests |
| F15 | Medium | Local fix + SQL draft | Database KPI aggregates; monthly period filters; errors propagate; full affected shelf/map scans | [artifacts/mydan/src/lib/admin-data.ts:54](../artifacts/mydan/src/lib/admin-data.ts#L54) | 2,505+ visit aggregation and target-period SQL test |
| F16 | Medium | Local fix | Canonical explicit share percentage; no invented competitor facings or audit-score substitution | [artifacts/mydan/src/lib/shelf-metrics.ts:10](../artifacts/mydan/src/lib/shelf-metrics.ts#L10) | 44% contract and legacy missing-measurement tests |
| F17 | Medium | Local fix + SQL draft; GPS authenticity unverified | Server distance in meters, separate dated route membership, GPS evidence/time bounds; no guessed per-store coordinates | [supabase/migrations/20261104195745_audit_remediation.sql:473](../supabase/migrations/20261104195745_audit_remediation.sql#L473) | SQL 0m/1,112m/route and event validation tests |
| F18 | High | Local fix + SQL draft; real email delivery unverified | Target company honored, protected credentials, real recovery email API, serialized seat reservation, atomic profile/permissions | [supabase/functions/invite-supervisor/handler.ts:67](../supabase/functions/invite-supervisor/handler.ts#L67) | injected handler tests + SQL reservation/seat tests |
| F19 | Medium | Local fix + SQL draft; real push/media delivery unverified | Owner paths and signed reads, checked push upsert, unsubscribe on logout, validated provider endpoints and maintained Web Push implementation | [artifacts/mydan/src/lib/push.ts:17](../artifacts/mydan/src/lib/push.ts#L17) | push allowlist and media-path tests; real-device acceptance still required |
| F20 | High | Local fix + SQL draft | Private training objects, tenant write guards, published-course/lesson reads | [artifacts/mydan/src/lib/training-data.ts:105](../artifacts/mydan/src/lib/training-data.ts#L105) | SQL private storage and unpublished training tests |
| F21 | Medium | Local consolidation | Active admin implementation retained; duplicate admin tree becomes compatibility exports | [artifacts/mydan/src/modules/admin/AdminLayout.tsx:1](../artifacts/mydan/src/modules/admin/AdminLayout.tsx#L1) | typecheck and both web bundles |
| F22 | Medium | Local fix | CSV text neutralizes formula prefixes while retaining actual numeric values | [artifacts/mydan/src/lib/csv-cell.ts:2](../artifacts/mydan/src/lib/csv-cell.ts#L2) | formula/control/quoting unit cases |
| F23 | High | Local scope fix | Sales routes/navigation/pricing/financial targets and report fields hidden; legacy code/data preserved | [artifacts/mydan/src/App.tsx:70](../artifacts/mydan/src/App.tsx#L70) | browser legacy sales URL test; active product/target forms reviewed |
| F24 | Medium | Local correction; advanced capabilities remain future work | Truthful PWA/Android/map/training claims, no forced form reload, mandatory-task guard and real shelf evidence | [artifacts/mydan/public/sw.js:9](../artifacts/mydan/public/sw.js#L9) | worker install/restart/failure tests + mandatory-task SQL tests |
| F25 | Medium | Local CI improvement; new remote run not executed | Frozen install, Node 24, SQL/IDB/browser suites and locked Edge checks; remove false always-success review comments | [.github/workflows/ci.yml:30](../.github/workflows/ci.yml#L30) | local full validation; remote GitHub results apply only to original audited SHA |
| DB01 | High | PARTIAL / live schema NOT VERIFIED | Helpers and corrective contract supplied, synthetic replay proven; complete current baseline/generated types still need reviewed schema | [supabase/migrations/20261104195745_audit_remediation.sql:6](../supabase/migrations/20261104195745_audit_remediation.sql#L6) | schema inventory template; scratch migration twice; actual baseline remains a release gate |
| DB02 | High | Local prevention + SQL draft | Legacy manual replay blocked after new contract; effective policies replaced rather than OR-composed | [scripts/sql/99_fix_prospects_and_orders.sql:2](../scripts/sql/99_fix_prospects_and_orders.sql#L2) | reapply corrective migration twice; review actual old functions/policies before rollout |
| DB03 | Medium | SQL draft / external verification pending | Active membership, child-parent company guards and route-array consistency | [supabase/migrations/20261104195745_audit_remediation.sql:566](../supabase/migrations/20261104195745_audit_remediation.sql#L566) | two-company direct API-equivalent SQL negative tests |
| DB04 | Medium | PARTIAL / actual BI role NOT VERIFIED | Unsafe BYPASSRLS reader recipe removed; known views set invoker; actual BI identities and definitions need owner review | [scripts/sql/05_phase_e_powerbi.sql:43](../scripts/sql/05_phase_e_powerbi.sql#L43) | two-company BI role acceptance still required; no reporting role changed |

## Local checks and their limits

Use Node 24, pnpm 10.26.1 and Deno 2.5.6. Root commands:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run test:browser
pnpm run build
MYDAN_TEST_BUILT_SW=1 node --test artifacts/mydan/tests/service-worker.test.mjs
pnpm --filter @workspace/mydan run build:android
deno check --frozen --config supabase/functions/deno.json supabase/functions/invite-supervisor/index.ts supabase/functions/analyze-shelf/index.ts supabase/functions/discover-customers/index.ts supabase/functions/push-notify/index.ts supabase/functions/purchase-webhook/index.ts
```

The local PostgreSQL tests use PGlite (real PostgreSQL engine, synthetic schema and data). They install and reapply the corrective migration and exercise anonymous, ordinary field, both manager spellings, tenant admin and platform admin contexts across two companies. They prove the tested policy/command behavior, not compatibility with a production Supabase project. This environment cannot use its Docker daemon, so a full local Supabase/GoTrue/Storage stack was not run.

Browser tests mount the actual AuthProvider and actual application screens against an intercepted `.invalid` backend. They verify lifecycle events, failed revalidation, token refresh, forced-password and recovery flows, binding denial, missing settings, hidden sales URLs, and unconfirmed visit replay. They never create external accounts or call production APIs. SQL tests separately verify the server receipt and authorization semantics.

CI source was updated but not pushed. Any GitHub success attached to the original main commit is **not** a result for these changes. A Vite Android web bundle is not a native Gradle, signing, installation or field-device test. Real email, AI, push, private Storage delivery, backups, load/latency and deployment remain **NOT VERIFIED**.

Final command outcomes are recorded below after verification. No paid provider was called.

## Release blockers and residual work

1. **High — current database contract.** Obtain an owner-approved schema-only export/configuration inventory. The read-only template is [security-inventory.sql](../scripts/diagnostics/security-inventory.sql). Do not run it automatically. Compare every required column, type, enum, trigger, overload, grant, bucket and view to the draft. In particular check generated versus writable target month/year, audit actor foreign keys, one Auth user to one profile, branch roles, any custom policies, and previously applied default-task triggers. The synthetic fixture is not a substitute. Generate typed clients from the approved schema afterward.
2. **High — rollout compatibility.** The client requires the new RPCs and server checks. Do not deploy this client alone or apply SQL against an unreviewed existing project. Existing field sessions need registration, existing users need explicit permission rows, old admins must satisfy any enabled password-expiry policy, and completed synthetic audits need controlled review/reanalysis. Do not silently delete or reclassify historical evidence.
3. **High — real Supabase acceptance.** The Auth trigger touches `auth.users` after a real password-hash change. Verify migration ownership, GoTrue permissions, invitation/SMTP redirects, existing triggers, session claims, account revocation and a full email recovery on an isolated approved staging environment before release. Model tests cannot establish these service interactions.
4. **Medium — historical private files/legacy queues.** Old `company/competitors` paths, orphan media, public URLs and foreign or malformed localStorage records need a reviewed recovery policy. New code does not relabel ownership or destroy them. Signed links expire; long training sessions may need to reload a lesson. Offline records marked as rejected remain visible as pending; a richer recovery/review UI and full offline read model are future work.
5. **Medium — device and location trust.** Browser UUIDs and GPS metadata are not hardware attestation. Server distance validation cannot prove physical presence. Real Android devices, spoofing controls, screen lock/storage policy and mobile permissions need field testing.
6. **Medium — BI and performance.** Inspect actual reporting roles, materialized views, foreign tables and all remaining definer functions. A pre-existing BYPASSRLS reader is not fixed by changing view options. No role was changed. Browser keyset scans fix the identified capped results but are not a replacement for bounded aggregate endpoints, PostGIS nearest-neighbor indexing, representative query plans or load tests at larger scale.
7. **Medium — non-core integrations.** The existing WooCommerce SaaS purchase webhook is distinct from field sales. Its imports are pinned and email logging reduced; its partial provisioning/reconciliation and concurrent delivery behavior are not certified here. Do not enable or expand this integration based on the field-execution test results.
8. **Low/Medium — remaining architecture and product extensions.** Handwritten database types and legacy `any` remain. Admin role-specific UI capabilities, formal survey submission/approval workflows, server-verifiable training assessments, general business offline reads and larger report export pagination are separate improvements. Their absence is not concealed by a UI label or counted as enterprise-ready functionality.

## Proposed rollout after explicit owner approval

1. Review the local diff and this status record. Preserve the original branch; do not merge or publish as part of review.
2. Review the schema-only inventory, resolve contract differences, produce a complete sanitized baseline and schema-derived client types. Review historical data exceptions and exact permission defaults with the owner.
3. On an isolated, explicitly authorized staging project, take/verify a backup and test restore, apply a forward migration, deploy the matching Edge Functions, then the matching client. Complete the two-company/branch/role and real Auth/email/Storage acceptance matrix. Use a controlled provider budget only if separately approved.
4. Test web update waiting with an unfinished form, lost responses across tabs, device reset, account suspension, company expiry, private media links and Android installations. Record measured performance and production-specific restrictions.
5. Obtain explicit production rollout approval for the concrete artifacts and operational plan. Never roll the database back by replaying broad legacy policies; use a reviewed forward repair and retain receipts/history.

Mydan remains independent throughout. No source or database merge with Corona is proposed by this remediation.

## Final verification outcomes

| Check | Outcome |
|---|---|
| `pnpm install --frozen-lockfile` | PASS with pnpm 10.26.1; lockfile unchanged by install |
| `pnpm run typecheck` | PASS |
| `pnpm test` | PASS: 16 test files, including Android CORS and 22 SQL subcases and IndexedDB fault/replay tests |
| Intercepted Playwright/Chromium | PASS: 8 tests; no external application requests allowed |
| Production web build | PASS; synthetic `.invalid` Supabase URL/key |
| Built service worker | PASS: 8 behavior cases against generated worker |
| Android APK | PASS: native `assembleDebug`, Preview package, v1/v2 signature, ZIP integrity and zipalign; owner Release key not used |
| Deno locked check | PASS: all 5 Edge Function entrypoints; none invoked |
| Gitleaks 8.24.3 source snapshot | PASS after removing a checked-in public anon token and a truncated example; no server/provider secret found. Text snapshot only, no Git history or binary/APK scan |
| `git diff --check` | PASS |
| Remote GitHub CI for this candidate | NOT RUN: no commit/push/PR |
| Live Supabase, real Auth/email/AI/push, device runtime or production rollout | NOT RUN / NOT VERIFIED |

The source snapshot excludes generated builds, dependencies, binaries and files larger than 2 MB. Local scan results do not establish secret hygiene in history, compiled APKs or deployed configuration. The old live-database audit helper now requires explicit environment configuration; it was not executed.

These results support reviewing the local change. They do not close the release blockers above or authorize applying the SQL draft.

## Owner clarification: Android APK delivery

The supervisor application must be delivered as an installable Android APK. Capacitor remains the packaging path; the web admin remains separate. [The current build guide](mydan-android-launch-plan.md) supplies cross-platform doctor/prepare/debug/release commands. The old APK repackaging helper is retired; signing values are no longer embedded in it. No signing key was created, read, changed or replaced.

The local environment has Java Runtime 21 but lacks the Java compiler and Android SDK, so native APK assembly remains blocked by missing tools. The earlier Android result was a web-assets build only. No old APK is presented as a new deliverable, and no production-capable APK has been certified.

Android packaging follow-up verification: `android:prepare` passed locally with synthetic backend settings; the 15 test files passed again. The portable runner syntax check passed, and generated native public assets contain no APK/AAB/service-worker files. `android:doctor` reports the missing JDK compiler and Android SDK. This remains preparation, not native APK assembly or release signing.

APK execution follow-up: verified JDK 21 and Gradle 8.11.1 are installed locally; Gradle project configuration passed. Native SDK package installation awaits the requested owner acceptance of the Google SDK license. Preview identity is isolated as `.preview`. Android-origin CORS handling and 3 dedicated cases were added; 16 test files pass. No APK assembly or release-signing success is claimed. See [the current APK build status](mydan-apk-build-status.md).

## Current APK outcome after SDK approval

The owner explicitly accepted the Google Android SDK license before installation. A full native Preview APK was built and verified on 2026-11-05. It is available locally as `/workspace/Mydan-Preview.apk`, package `com.mydan.supervisor.preview`, with a Debug signature. Earlier missing-tool/license-blocked notes above describe prior stages; they are superseded by [the current APK verification record](mydan-apk-build-status.md). No owner Release key or external database/service deployment was used. Phone runtime and the reviewed backend rollout remain outstanding.

Native Android `:app:lintDebug` and TypeScript checks also passed after the APK build. The APK remains a Debug preview; these checks do not replace phone runtime or backend deployment acceptance.


## Full frontend/backend re-review before private APK delivery — 2026-11-05

Owner requested another complete source review before the approved private Notion delivery. See `mydan-full-review-2026-11-05.md` for current findings, coverage, unresolved gates and exact source evidence. Historical stage notes above are not current verification results.

Additional local corrections: Auth session revocation/expiry lookup, missing-session denial, peer-admin demotion/reset protection, AI field-survey customer parent mapping, branch-manager parent validation, immediate logout with bounded push cleanup and captured-owner deletion, validated analysis JSON receipts, published-linked training-file reads, non-forgeable initial survey counts, filtered team quotas and explicit company asset scope. Personal progress excludes unassigned team quotas. Netlify source configuration now matches frozen pnpm/Node24. Android excludes every admin route import, including the map.

The legacy WooCommerce provisioning flow is **disabled by default**, not certified as fixed: do not enable its environment flag until durable provisioning recovery/concurrency has been implemented and reviewed. OS pushes use generic text; authenticated inboxes hold business content. React Router 6.30.6 still has two moderate registry advisories; observed BrowserRouter use does not prove an exploitable route or SSR hydration path. Training analytics pagination/denominator semantics and legacy public APK distribution remain review backlog items.

Current checks: frozen install PASS; typecheck PASS; 16 local test files PASS; isolated PostgreSQL 27 subcases PASS (28 including parent); 9 intercepted-browser cases PASS; all five Edge entrypoints locked Deno-check PASS; web build and eight built-worker cases PASS; native Preview APK assembly/signature/zipalign/integrity PASS; Android lint 0 errors/18 warnings. Dependency production audit: 0 critical, 0 high, 2 moderate. Source snapshot secret scan: 337 text files, 0 matches; excluded dependencies/history/binaries. Compiled APK separately checked for private-key patterns/privileged tokens and unwanted nested packages; one public anon token only.

No SQL or Edge Function deployment, production account/data access, commit, push, PR, paid provider call, or public sharing occurred. The file is a Debug Preview, not an approved production release, and its new backend contract has not been deployed. Phone camera/GPS/runtime, current schema compatibility and real email/AI/push remain NOT VERIFIED.
