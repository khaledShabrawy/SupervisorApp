# Changelog — ميدان (Mydan)

All notable changes to this project are documented in this file.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.1.0] — 2026-11-08

### Security
- **Migration 26:** Revoke `anon` access to `app_settings`; enforce strict tenant isolation via `get_my_company_id()` on all SELECT/ALL policies — eliminates cross-company settings exposure
- **Migration 26:** Enforce unique attendance per supervisor per day (`idx_attendance_unique_day`) — prevents duplicate offline check-ins
- **Migration 26:** Add `idx_visits_dedup_lookup` composite index — fast deduplication for offline sync replay
- **Migration 26:** `visits_branch_manager_scope` policy — branch managers see only their own branch's visits
- VAPID_SUBJECT secret configured for Web Push authentication

### Tests
- Add 13 unit tests for `purchase-webhook` `detectPlan` logic covering live WooCommerce slugs, slug-over-name priority, keyword fallback, normalisation edge cases, and plan-map completeness (suite: **66 tests, 0 failures**)

### Refactor
- Migrate `src/admin/AdminSections.tsx` and `AdminDashboard.tsx` to thin re-exports; actual implementations live under `src/modules/admin/` (10 files, improved maintainability)
- Full screen modules consolidated under `src/modules/` (auth, customers, dashboard, orders, shelf-audit, surveys, training, visits)

---

## [1.0.0] — 2026-11-02

### Added — Mobile App (Supervisor PWA)
- **Login & Set Password** — Supabase Auth with email link confirmation; Arabic RTL layout
- **Dashboard** — Daily KPIs, attendance widget (selfie + GPS), recent visits feed, target progress gauges
- **Beat Plan** — Optimised daily route with live geofencing proximity radar; Google Maps deep-link per outlet; OOR (Out of Route) workflow
- **New Visit** — GPS check-in with Haversine distance validation, geofence `on_beat` flag, visit outcome enum (متعامل / غير متعامل / غير موجود)
- **Visit Detail** — Task checklist, shelf audit launcher, competitor check, order entry, field survey, notes
- **Shelf Audit** — Claude Vision AI (multi-model); share-of-shelf percentage, facings count, FMCG KPI scoring, planogram comparison, photo compression (Canvas, max 1200px JPEG 0.85)
- **Competitor Check** — Brand, quantity, photo per SKU; heatmap-ready data model
- **Orders (الطلبات)** — Product catalogue with price list (customer-type pricing); order entry with quantity validation; WhatsApp native share
- **Field Survey** — Dynamic JSONB question renderer; mandatory/optional per survey config
- **Training Academy** — Interactive FMCG simulator; Arabic/English bilingual content; video + quiz format
- **Targets** — Monthly KPI progress (visits, audits, orders) with overachievement support
- **Notifications** — Realtime feed (ai_result, target_alert, admin_message); Web Push via VAPID
- **Customers** — Nearby list sorted by Haversine distance (5/10/15/all); Google Maps directions

### Added — Web Admin Panel
- **Executive Dashboard** — Branch performance heatmap, shelf analytics overview, OOS (Out of Shelf) rankings, realtime Operations Alerts Hub
- **Supervisors & Users** — Full CRUD with supervisor codes, role management, branch assignment; `invite-supervisor` Edge Function
- **Branches & Regions** — Hierarchical region → branch structure; manager assignment
- **Customers** — Admin CRUD with coordinate validation; customer type segmentation
- **Products & Price List** — Catalogue management with customer-type tiered pricing
- **Shelf Share Module** — Branch-level share-of-shelf comparison across time periods
- **Training Simulator** — Admin-side interactive FMCG training content management
- **Live Map** — Realtime supervisor field positions (RTL-fixed)
- **Targets** — Monthly target setting with cascading branch → supervisor drill-down filter; edit modal
- **Surveys** — Dynamic survey builder with JSONB question schema
- **Assets & Tickets** — Asset fleet management with QR/serial support; fault ticket lifecycle
- **Audit Logs** — Full INSERT/UPDATE/DELETE trail with old/new JSONB diff
- **Reports** — Power BI-ready views: `vw_daily_kpi_supervisor`, `vw_perfect_store_index`, `vw_branch_performance`, `vw_competitor_heatmap`, `vw_oor_analysis`, `vw_asset_fleet_health`
- **Bulk Templates** — CSV import templates for customers, products, supervisors

### Added — Infrastructure
- **Supabase** — 24 production tables, Row Level Security on all tables, 6 analytical views, security-definer functions with pinned `search_path`
- **Edge Functions** — `analyze-shelf` (Claude Vision), `purchase-webhook` (WooCommerce auto-provisioning), `invite-supervisor`, `discover-customers`, `push-notify`
- **WooCommerce Integration** — `purchase-webhook` provisions company + admin account on `order.created`; HMAC-SHA256 signature verification; idempotency via `license_key = WC-{orderId}`
- **PWA** — Cache-first service worker; 59 precached assets; offline route fallback; safe-area viewport
- **Android** — Capacitor offline-first build (`vite build --mode android`); `assetlinks.json` for TWA; versionCode 1 / versionName Mydan_01
- **CI/CD** — GitHub Actions quality gate, Dependabot, AI PR review, Gitleaks secret scanning
- **Design System** — Arabic RTL, Cairo font, Mesh Gradients, Glassmorphism bottom nav, native `scale(0.96)` touch feedback, dark-compatible CSS tokens

### Security (Phase 0 Hardening)
- Supervisors: client grants limited to `full_name` and `phone` only; `role`, `company_id`, `is_active` locked server-side
- `app_settings` and `price_list`: tenant isolation via `company_id`
- All security-definer functions: `search_path = public, pg_temp`
- Frontend: exclusively `VITE_SUPABASE_ANON_KEY`; no `service_role` key in client bundle
- No direct LLM calls from frontend; all AI routes via `/functions/v1/analyze-shelf`
- Native Arabic RTL `ConfirmSheet` replaces `window.confirm` on all destructive actions

### Fixed
- Orders renamed to **الطلبات** across all UI strings and i18n keys
- Training Academy English locale fallback
- Live Map RTL layout
- Manual visit fallback when no beat plan exists
- 31-day month bug in targets date calculation

---

## Links
- **Production:** https://mydan.digityoucan.com
- **Store:** https://store.digityoucan.com
- **Supabase:** `ywdlrrdkjbtpfgacuuoy`
- **Android package:** `com.digityoucan.mydan`
