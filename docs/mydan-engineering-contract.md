# Mydan engineering contract

Owner decision: Mydan is delivered to field supervisors as an installable Android APK and stays an independent application. The administration panel remains web-based. Its scope is supervisor tasks, visits, field evidence and monitoring. Corona is a separate product and database; do not import its hierarchy, tables, sales channels or sales transaction requirements into Mydan.

This document replaces conflicting product, platform and deployment claims in older repository notes. Source code and local tests describe a proposed implementation; they do not establish the deployed database or service configuration.

## Product boundary

- Visits, attendance, customer discovery, customer records, beat plans, shelf audits, competitor observations, task targets, notifications, reports and training remain in scope.
- Orders, pricing, financial targets, invoicing, collections, returns and financial reporting are hidden from the active application. Preserve historical code, tables and data. The versioned command rejects new sales execution. Do not silently convert an order to a task.
- Customers are discoverable across the user's company. Tenant boundaries remain mandatory; mutation rights and manager scope are narrower than discovery rights.
- Training quizzes and decision scenarios are local practice, not professional certification. Video completion is a self-reported learning record.
- The map shows recorded visit locations, refreshed periodically. It does not measure continuous movement. Geofence proximity in meters and membership of a dated beat plan are distinct.

## Platforms

The primary supervisor deliverable is an Android APK, built from current source with Capacitor. See [the Android build guide](mydan-android-launch-plan.md). Web builds and PWA checks are supporting verification; they do not complete APK acceptance.

React 18, TypeScript, Vite, Tailwind, TanStack Query, React Router, Supabase, Leaflet and the existing Capacitor Android shell remain. Android uses bundled web assets. There is no implemented remote OTA updater. A web bundle build does not prove that a signed APK works on devices.

The PWA stores public application assets. Updates wait while an existing app window is open. APIs, tokens and private media are not stored in service-worker caches. A persistent, encrypted operation outbox is separate from those caches; this is not a complete offline read model.

## Authoritative boundaries

- Auth users and supervisor profiles are separate identities joined by a unique `supervisors.user_id`. Every business record belongs to a company. Active membership, company status/expiry, forced password changes, optional password expiry and registered field sessions are enforced on the server.
- `admin` and `super_admin` are privileged roles; `manager` and `branch_manager` share a branch-limited management boundary over lower field roles. An admin may not reset a platform administrator or change/demote a peer admin to bypass credential protection. Auth session existence and optional session expiry are checked against auth.sessions; JWT expiry alone is insufficient. The server remains authoritative when a control is hidden.
- Device UUIDs identify a browser installation. They are not hardware attestation and cannot prove that a location or device is genuine. Direct profile writes cannot change the binding. Device reset revokes registered field sessions.
- Missing permissions deny access. Existing users need an explicit, reviewed permission matrix before rollout; never backfill every capability as enabled to suppress failures.
- Settings failures and missing subscription information block operational entry. Public branding exposes only company ID, app name and logo through a projection RPC.
- Online and queued visit/attendance commands use the same receipt-based RPC. A confirmed receipt acknowledges one immutable action, never an entire queue snapshot. User/session/company identity is checked during replay.
- The outbox uses IndexedDB and AES-GCM payload encryption with a non-extractable key stored by that origin. An origin compromise can still use that key; identifiers remain metadata. Auth session persistence is managed by the Supabase SDK. Never describe this as protection from XSS or physical device compromise.
- Legacy queues are converted only for the authenticated owner. Foreign/malformed records remain for controlled recovery rather than being assigned or deleted. Rejected actions remain pending and require review; do not report them as synchronized.
- AI results require a successful provider response and committed server result. Synthetic historical results are excluded from the affected analytics. Provider output still requires human review. Both AI functions share server-side attempt budgets and leases; do not run paid or live provider requests in local tests.
- Personal progress uses assigned individual targets; shared team targets are not personal quotas. Filtered admin aggregates include only matching branch quotas; asset/ticket totals explicitly describe the company scope.
- OS push envelopes contain generic text only; the authenticated inbox holds the business message. Browser push cleanup is bounded and cannot delay local logout. Native Android background push still requires a dedicated implementation.
- WooCommerce auto-provisioning is disabled by default (`ENABLE_WOOCOMMERCE_PROVISIONING` must remain unset/false). Its old multi-step flow is retained for review, not approved for activation. Durable atomic reservation/recovery must precede enabling it.
- Private photos and training files store object paths and use expiring signed URLs. Unpublished/unlinked training objects are unavailable to field users even if an object path is known. Old files with non-owner folders or full URLs need a reviewed reconciliation. Do not move files or widen storage access automatically.

## Source ownership

`src/admin` is the active admin implementation. `src/modules/admin` contains compatibility exports only. Screens under `src/modules` own their feature views; hooks and legacy business access remain in `src/lib`. Incremental extraction is preferable to a repository-wide rewrite.

The SQL migration `supabase/migrations/20261104195745_audit_remediation.sql` defines the proposed corrective contract. It is not a complete database bootstrap. The synthetic test schema is not a production export. Full generated client types, unknown existing functions/policies, actual BI identities and historical data quality require the reviewed current schema.

## Development and release rules

Use Node 24 and pnpm 10.26.1 with the frozen lockfile. Root checks are `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm test`, `pnpm run test:browser`, `pnpm run build`. Browser tests use a synthetic `.invalid` backend and intercept all external requests. Edge Functions are checked with the committed Deno lockfile, not invoked.

Do not run historical SQL files in filename order. Legacy scripts stop after the corrective contract is installed. Do not rewrite already-applied timestamped migrations. Use a new forward migration for changes.

Local implementation/testing does not authorize remote SQL, Supabase configuration changes, emails/pushes, paid providers, deployment, commits, pushes or pull requests. Prepare a reviewable change and obtain the owner's explicit approval for the specific external action. See [remediation and rollout gates](mydan-remediation.md).
