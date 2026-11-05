# Isolated browser regression checks

Run the standard checks from the repository root with its pinned pnpm:

```sh
corepack pnpm run typecheck
corepack pnpm test
corepack pnpm run build
```

`review-smoke.cjs` is a Chromium integration suite run by CI; it can also be run locally with optional browser tooling. It uses synthetic accounts, intercepts backend requests, and rejects a non-loopback server. It does not verify production RLS, email delivery, camera/GPS hardware, or a deployed Edge Function. The invitation function also has SDK-mocked regression tests in the standard Node test suite.

Install the optional browser driver outside the checkout; use an installed Chromium browser:

```sh
npm install --prefix /tmp/mydan-browser-tools --no-package-lock playwright
```

In one terminal, start a separate server with intentionally synthetic public configuration:

```sh
PORT=5174 VITE_SUPABASE_URL=https://review.invalid VITE_SUPABASE_ANON_KEY=public-synthetic-review-key corepack pnpm dev
```

In another terminal:

```sh
NODE_PATH=/tmp/mydan-browser-tools/node_modules node scripts/testing/review-smoke.cjs
```

`CHROMIUM_PATH` defaults to `/usr/bin/chromium`; `REVIEW_BASE_URL` defaults to `http://127.0.0.1:5174`; `REVIEW_OUTPUT_DIR` defaults to `/tmp/mydan-review-fixes`. Results and screenshots are written there. Managed cloud environments may require the normal execution approval for browser startup, network access, or listening sockets. Preserve the supplied proxy and CA trust. In this environment, set `COREPACK_HOME=/workspace/.cache/corepack` to reuse its writable package-manager cache.

Covered scenarios include recovery links in fresh tabs, forced password changes, explicit screen grants, settings/subscription/device failure and retry, enqueueing during upload within and across tabs, rejected update retention, storage quota failures, CSV formulas, modal focus management, and admin empty states. Existing pending queues are read without importing other accounts' records. New actions use independent storage keys, and successful uploads acknowledge only their own records. Web Locks serializes uploads across supporting browsers; same-tab calls are coalesced on all browsers.


The CI workflow also checks the actual built service worker and performs a separate synthetic production build for `pwa-smoke.cjs`. The latter waits for every expected shell asset, disables networking, and verifies that the app shell renders. This does not establish authenticated cold-start access while offline.

For the read-only live checks, configure `STAGING_SUPABASE_PROJECT_REF`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, and short-lived `STAGING_SUPERVISOR_ACCESS_TOKEN`, `STAGING_ADMIN_ACCESS_TOKEN`, `STAGING_OTHER_TENANT_ACCESS_TOKEN` securely, then run:

```sh
node scripts/testing/staging-readiness.mjs
```

The admin and supervisor belong to one test company; the third identity belongs to another. Use synthetic fixtures with existing customers, visits, orders, settings and permissions. The script performs GET requests only and does not create fixtures or validate write permissions or email delivery. A separate staging project has not been supplied; do not label the selected production project as staging without deciding that explicitly.

Use `corepack pnpm install --frozen-lockfile` for this repository. The workspace's tested glob overrides and deepmerge security patch require pnpm. `pnpm audit --prod` is clean; `pnpm audit --audit-level=moderate` passes with one version-based low deepmerge finding that is locally patched and exploit-tested. The audit finding is retained rather than ignored.

## Disposable database authorization tests

Run `bash scripts/testing/database/run.sh` with Docker socket access. It runs a digest-pinned PostgreSQL 17 image without network or host data mounts, restores a synthetic eight-table catalog subset, applies the proposed SQL, checks role/device/password protections and actual cross-tenant order reads/writes, then removes the container. It is not a full Supabase restore or a live acceptance test. CI runs this as a separate job.

The catalog snapshot is `supabase/schema-contract.json`; `scripts/sql` contains historical scripts, not a baseline to replay. `python3 scripts/audit_live_db.py` reads metadata through the Management API with `read_only=true` using configured credentials. Do not commit real business rows, backups, or token-bearing output.
