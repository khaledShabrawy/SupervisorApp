# Mydan

Primary deliverable: an installable Android APK for supervisors, using the existing Capacitor shell. The admin panel remains web-based. See docs/mydan-android-launch-plan.md.

Standalone Arabic/English RTL supervisor task and visit application. React 18, TypeScript, Vite, Tailwind, Supabase, TanStack Query, React Router and Leaflet. Existing Capacitor Android artifacts are preserved.

The owner has confirmed Mydan stays separate from Corona and sales/prices must be hidden. Retain historical code and data. Multi-company isolation is required; customers remain discoverable within their company.

Use [the engineering contract](docs/mydan-engineering-contract.md) as the current product, architecture and safety reference. [The remediation record](docs/mydan-remediation.md) distinguishes locally tested fixes from unverified external state.

Run the root frozen install, typecheck, tests, intercepted browser tests and build. No live database, external account mutation, emails, paid AI, deployment or repository publishing is part of local verification.
