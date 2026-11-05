# Mydan development instructions

Read [the engineering contract](docs/mydan-engineering-contract.md) and [the remediation record](docs/mydan-remediation.md) before changing behavior.

The supervisor deliverable is an installable Android APK using Capacitor; the admin panel remains web-based. Mydan remains independent from Corona. Keep task execution and visits; hide sales and prices while preserving historical code/data. Company isolation and company-wide customer discovery are required.

The active admin implementation is `artifacts/mydan/src/admin`; the `src/modules/admin` paths are compatibility exports. Preserve Arabic/English RTL flows and the existing web PWA/Capacitor shell. Do not claim remote Android OTA or continuous live location tracking.

Unknown authorization, settings and subscription failures deny access. Never put server/provider credentials in client code. Use synthetic fixtures and intercepted browser requests for verification. The database correction is a local draft; no checked-in note establishes what is deployed.

No remote SQL, account changes, Supabase configuration changes, paid requests, deployments, commits, pushes or PRs without the owner's explicit authorization for that action. Local fixes and checks are authorized by the current remediation task.
