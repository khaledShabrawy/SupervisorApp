# Rejected SQL Files

These SQL files were formally reviewed by the product owner on **2026-11-08** and **rejected**.
They must NOT be applied to any database environment.

---

## fix_public_branding.sql — REJECTED

**Rejected by:** Khaled Mahmoud (product owner)
**Date:** 2026-11-08
**Reason:** Critical security violation — tenant isolation breach.

The file adds an RLS policy on `app_settings` with `USING (true)` and no `company_id` filter,
exposing all companies' settings (branding, colors, AI config, geofence radius, WhatsApp number)
to anonymous unauthenticated users. This directly violates CLAUDE.md Phase 0 Security rule #4:

> "Tenant isolation must be strictly enforced on `app_settings` and `price_list` via `company_id`."

Also makes the `company-logos` storage bucket fully public with no access control.

**Correct approach (if branding needs to be public):** Expose only a narrow, tenant-scoped
read-only RPC function (e.g. `get_public_branding(company_id uuid)`) with explicit column selection,
not a blanket anon policy on the entire table.

---

## migration4_academy.sql — REJECTED (v1.0 scope)

**Rejected by:** Khaled Mahmoud (product owner)
**Date:** 2026-11-08
**Reason:** Out of scope for Mydan v1.0.

Adds a Training Academy module (`training_courses` table, related tables, `training-materials`
storage bucket 500 MB public) which is NOT part of the verified 24-table contract defined in
CLAUDE.md Section 3.

**Decision:** Deferred to v2.0 backlog. If reconsidered, must go through proper proposal review
in `supabase/proposals/` with full RLS design, tenant isolation review, and product owner sign-off.
