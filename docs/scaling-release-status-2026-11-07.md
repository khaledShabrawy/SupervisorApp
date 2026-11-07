# Scaling release status — 2026-11-07

## Hosting and release control

Cloudflare Pages is the hosting target; Netlify is retired. The Supabase Auth
Site URL now uses `https://mydan.digityoucan.com`, and retired Netlify redirect
entries were removed. The previous Auth configuration and the change receipt
were saved outside the repository. Email delivery has not been tested.

Cloudflare Pages automatic production deployments from Git are disabled while
the release is being prepared. Preview deployments remain enabled and the
previous production deployment remains active. A merge to `main` therefore does
not by itself publish the new version. Use the reviewed release process after
the prerequisites below are complete.

## Proposed changes

The new SQL proposals cover survey ownership and scoped access, a shared AI
attempt ledger and limits, and manager task planning with checkout safeguards.
The separate earlier pre-release hardening proposal is also required. See
`scripts/testing/database/SCALE-CONTRACT.md` for the business rules, proposal
order, and rollback details. Rollback of the AI ledger preserves and locks its
history. Application and Edge Function changes depend on these contracts;
they must be deployed as a coordinated release.

The deployment script checks the database contract and Cloudflare/Auth origin
before it deploys the four explicitly listed Edge Functions and the website.
It never applies SQL. Missing AI ledger functions cause the updated AI handlers
to fail closed. Push delivery requires a matching existing VAPID key pair and a
real `VAPID_SUBJECT`; do not rotate keys without a subscription migration plan.
Provider acceptance does not prove a notification reached a device.

Disposable PostgreSQL tests cover the proposed policies, concurrency, rollback
and reapplication with synthetic data. Browser tests also use synthetic data.
These checks do not substitute for a hosted staging test, real email delivery,
real device push delivery, or a tested production backup.

## Remaining release prerequisites

The owner subsequently requested production deployment without taking a backup.
No production backup has been created; a restore of production data cannot be
promised. Production SQL application was rejected by automatic approval review
because the authorization, policy and trigger changes need specific approval
with their effects understood. The local synthetic checks still do not establish
hosted staging acceptance.

1. Create an actual encrypted production database backup using a secure
   PostgreSQL connection and verify a restore in isolation. The management API
   token is not a database password. No production backup has been created by
   these local synthetic backup tests. Database dumps do not include object
   storage bytes or Edge Function secrets; cover those separately.
2. Provide a separate hosted staging project and validate the full migration,
   rollback, Edge Functions, permission matrix and end-user workflows there.
   No staging project was created: the available account permissions do not
   establish that creation is allowed or free.
3. Review the exact production SQL and its effects, obtain the necessary specific
   authorization, and follow the tested rollout and rollback sequence. No
   proposed SQL in this change has been applied to production.
4. Confirm runtime secrets and VAPID configuration securely, deploy through
   the gated Cloudflare release path, and verify the live end-user journeys.

The live site and existing deployment remain available. No test result can
guarantee that a production system is free of every defect.
