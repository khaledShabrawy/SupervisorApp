# Unreviewed SQL Files

These SQL files were found in the repository root and moved here for safe keeping.
They have NOT been reviewed, approved, or applied to any database.

**DO NOT RUN** these files against any database (staging or production)
without explicit owner review and sign-off.

## Files

### fix_public_branding.sql
- Makes `app_settings` readable to `anon` role with `USING (true)` — no company_id filter
- Makes `company-logos` storage bucket public
- **Risk**: the `USING (true)` policy on `app_settings` exposes all company settings to unauthenticated users, violating tenant isolation

### migration4_academy.sql
- Adds a Training Academy module with new tables (`training_courses`, etc.)
- Not part of the v1.0 scope defined in CLAUDE.md (24-table contract)
- Adds a `training-materials` storage bucket (500 MB limit, public)
- **Risk**: out-of-scope schema expansion; requires product owner decision before any consideration

## Action Required
Owner must review each file and either:
1. Move to `supabase/proposals/` with a proper review and sign-off, OR
2. Mark as rejected and document the reason
