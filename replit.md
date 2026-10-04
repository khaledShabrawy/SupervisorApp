# Mydan

Arabic field-supervisor app built on the existing Expo / React Native / Expo Router client and Supabase.

## First intended customer

- The user states: «أول شركة هنبيع لها الأبلكشن هى شركة زينة للورقيات».
- Company website supplied by the user: https://www.zeinagroup.com/
- This identifies the first intended customer, not a decision to limit the product permanently to one company.

## Mydan execution boundaries

- Implement the supplied plan incrementally in this project; preserve the existing framework, data, identifiers, and working flows.
- Do not execute SQL, migrations, schema pushes, external data writes, account creation, role elevation, publishing, or deployment as part of implementation/testing. External changes require separate explicit approval.
- Never expose secret values. The client may use only the Supabase URL and publishable/anon key. Service credentials and AI-provider secrets must never reach Expo/browser bundles.
- Do not invent tables, columns, RPCs, or permission grants. Checked-in SQL is evidence about the local contract, not proof of the live database.
- Unknown/failed authorization must deny access. Do not weaken RLS to bypass loading failures.
- Single-company versus multi-tenant launch is an unresolved product decision; do not activate tenants or apply the supplied multi-tenant migration automatically.
- Use synthetic fixtures and intercepted requests for authentication tests; no live test accounts, production writes, or AI requests.
- See `docs/mydan-data-contract.md` for the reviewed local contract and remaining verification gates.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Database schema push/SQL/migration commands are not authorized by the implementation plan.
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
