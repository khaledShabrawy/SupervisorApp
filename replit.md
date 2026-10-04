# Mydan

Arabic FMCG field-supervisor app. React 18 + Vite Web PWA, using Supabase.

## Required platform

- The user explicitly corrected the scope: “This must be a React Web PWA, NOT Expo/React Native.”
- Keep only the browser PWA. Never add a native app, Expo, React Native, QR-code launch flow, or app-store requirement.
- **Why:** the user requires direct access from Chrome/Safari on mobile, as a website.
- Preserve the existing Arabic RTL screens, active contexts, hooks, and components when changing tooling.

## First intended customer

- The user states: «أول شركة هنبيع لها الأبلكشن هى شركة زينة للورقيات».
- Company website supplied by the user: https://www.zeinagroup.com/
- This identifies the first intended customer, not a decision to limit the product permanently to one company.
- The user requires company-matched colors now and buyer-specific branding configurable later; keep presentation branding separate from authentication and data isolation.

## Mydan execution boundaries

- نطاق المنتج مؤكد من المستخدم: «الأبلكشن لايوجد به أى تعاملات مالية ولا فواتير ولا تحصيل».
- التطبيق لتنفيذ الزيارات ومراجعات الرف وتسجيل كميات أوامر البيع فقط. لا أسعار أو عملات أو مبالغ أو إيرادات أو مدفوعات أو تقارير مالية في أي نسخة.
- أوامر البيع تعرض العميل والمنتج والكمية والحالة فقط؛ الأهداف هي الزيارات ومراجعات الرف وأوامر البيع، وليست أهدافًا مالية. وجود أعمدة قديمة في قاعدة البيانات لا يبرر إعادتها إلى التطبيق.

- Preserve Supabase data, identifiers, and the working web flows. The user explicitly authorized removal of the native app and its dependencies.
- Do not execute SQL, migrations, schema pushes, external data writes, account creation, role elevation, publishing, or deployment as part of implementation/testing. External changes require separate explicit approval.
- Never expose secret values. The client uses VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY only. Service credentials and AI-provider secrets must never reach browser bundles.
- Do not invent tables, columns, RPCs, or permission grants. Checked-in SQL is evidence about the local contract, not proof of the live database.
- Unknown/failed authorization must deny access. Do not weaken RLS to bypass loading failures.
- Single-company versus multi-tenant launch is an unresolved product decision; do not activate tenants or apply the supplied multi-tenant migration automatically.
- Use synthetic fixtures and intercepted requests for authentication tests; no live test accounts, production writes, or AI requests.
- See `docs/mydan-data-contract.md` for the reviewed local contract and remaining verification gates.

## Run & Operate

- `pnpm --filter @workspace/mydan run dev` — standard Vite web server, managed by the artifact workflow
- `pnpm exec tsc --noEmit` — TypeScript check
- `pnpm build` — Vite production build
- `pnpm preview` — Vite preview of the production build
- `node --test artifacts/mydan/tests/*.test.ts artifacts/mydan/tests/*.test.mjs` — regression checks
- Database schema push/SQL/migration commands are not authorized by the implementation plan.
- Public client configuration: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- React 18, React DOM, React Router, TanStack Query, Supabase client
- Vite, TypeScript, Tailwind CSS, vite-plugin-pwa
- Application: artifacts/mydan, served at /
- Entry: index.html → src/main.tsx → src/App.tsx
- AI remains server-side in Supabase functions; no AI provider key in the frontend.

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
