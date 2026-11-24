# MEYDAN SFA PLATFORM — MASTER PRODUCT ROADMAP

> **Document Authority:** This ROADMAP.md is the single source of truth for Meydan build sequence.  
> **Companion:** Must be used alongside `CLAUDE.md` (project root). Never violate any Hard Security Guardrail defined there.  
> **Target:** Compete with Salesbuzz SFA & Sonic SFA in the Egyptian FMCG small-company market.  
> **Stack:** React 18 + TypeScript + Vite + Tailwind (Web) | Flutter (Mobile) | Supabase PostgreSQL | FastAPI | n8n  
> **Live DB:** Supabase project `ywdlrrdkjbtpfgacuuoy` — 24 tables — NO phantom tables allowed  
> **Production URL:** `https://mydan.digityoucan.com` — ONLY this domain  

---

## HOW TO USE THIS ROADMAP IN CLAUDE CODE

1. **Read Phase checklist** → build ONLY what is in the current phase
2. **Check the DONE criteria** → do NOT advance until ALL boxes are ticked
3. **Invoke the correct skill** → every phase header lists its required skills
4. **Never skip phases** → Phase 2 depends on Phase 1 being complete
5. **Reference the Live DB Contract** in `CLAUDE.md Section 3` before ANY query
6. **Security Guardrails** in `CLAUDE.md Section 2` override everything — no exceptions

---

## PHASE STATUS LEGEND

| Symbol | Meaning |
|--------|---------|
| ✅ | Done — verified working in production |
| 🔨 | In Progress |
| ⬜ | Not Started |
| ❌ | Blocked — dependency not complete |
| 🔒 | Security-Critical — extra review required |

---

---

# PHASE 0 — FOUNDATION & AUTH ✅ COMPLETE
**Goal:** A working multi-tenant app that any FMCG company can log into, with correct data isolation.  
**Salesbuzz Parity:** `HH_Salesman.Inactive`, `BUID` scoping, login/session management  
**Skills Required:** `/security-and-hardening` · `/frontend-ui-engineering` · `/incremental-implementation`

## 0.1 — Project Bootstrap ✅
- [x] `src/lib/supabase.ts` — uses ONLY `VITE_SUPABASE_ANON_KEY`
- [x] TypeScript strict mode configured
- [x] Tailwind with design tokens: Primary `#1A56DB`, Success `#108981`, Danger `#EF4444`
- [x] React Router v6 with protected routes

## 0.2 — Authentication Flow ✅ 🔒
- [x] `src/screens/LoginScreen.tsx` — Arabic RTL login form
- [x] `src/modules/auth/` — session management via Supabase Auth
- [x] company_id, supervisor_id, role in context
- [x] supervisor_permissions checked before screen render
- [x] Inactive supervisor blocked with Arabic warning

## 0.3 — Home Dashboard Shell ✅
- [x] `src/screens/DashboardScreen.tsx` — KPI summary cards (visits, orders, attendance)
- [x] Navigation menu (permission-aware)
- [x] Company logo + supervisor name in header
- [x] Mobile (375px) and desktop (1440px) responsive

**PHASE 0 COMPLETE** ✅

---
---

# PHASE 1 — FIELD EXECUTION CORE ✅ COMPLETE
**Goal:** A field rep can check in, execute a visit, and log orders.  
**Salesbuzz Parity:** `Actual_Visits`, `AR_Order`, `AR_OrderLines`, `JourneyPlan`, `HH_Route`  
**Skills Required:** `/salesbuzz-app-builder` · `/frontend-ui-engineering` · `/test-driven-development`

## 1.1 — Beat Plan & Customer List ✅
- [x] `src/screens/BeatPlanScreen.tsx` — today's planned customer list
- [x] Customer cards with visit status badges (not visited / visited / ordered)
- [x] Ordered per plan sequence from `beat_plans.customer_ids_ordered`

## 1.2 — Visit Check-In & Check-Out ✅
- [x] `src/screens/NewVisitScreen.tsx` — GPS check-in
- [x] `src/screens/VisitDetailScreen.tsx` — task list + check-out
- [x] `src/hooks/useGeolocation.ts` — geofence validation
- [x] `on_beat` flag calculated vs `app_settings.geofence_radius_m`
- [x] Mandatory tasks block check-out

## 1.3 — Attendance Management ✅
- [x] Attendance check-in with GPS + selfie upload
- [x] One record per supervisor per day enforced

## 1.4 — Order Taking ✅
- [x] Product catalog with pricing per customer type
- [x] Running total, order confirm, status flow
- [x] Orders linked to current visit

**PHASE 1 COMPLETE** ✅

---
---

# PHASE 2 — COMMERCIAL INTELLIGENCE ✅ COMPLETE
**Goal:** Shelf audits, competitor tracking, surveys — Meydan's differentiator vs Salesbuzz.  
**Skills Required:** `/salesbuzz-app-builder` · `/frontend-ui-engineering` · `/security-and-hardening`

## 2.1 — Shelf Audit with AI ✅ 🔒
- [x] `src/screens/ShelfAuditScreen.tsx` — photo capture + AI trigger
- [x] `supabase/functions/analyze-shelf/` — Claude Vision API (Sonnet 4.6)
- [x] AI calls route ONLY through Edge Function (never direct from frontend)
- [x] `audit_score`, `audit_summary_ar`, `ai_detailed_report` JSONB stored
- [x] Graceful fallback if AI times out

## 2.2 — Competitor Tracking ✅
- [x] `src/screens/CompetitorScreen.tsx`
- [x] Brands from `app_settings.competitor_brands` JSONB

## 2.3 — Surveys ✅
- [x] `src/screens/FieldSurveyScreen.tsx`
- [x] Dynamic question renderer (text/radio/checkbox/rating)
- [x] Mandatory surveys block check-out

**PHASE 2 COMPLETE** ✅

---
---

# PHASE 3 — MANAGEMENT & REPORTING WEB 🔨 IN PROGRESS
**Goal:** Admin/manager web panel to see field performance, AR aging, collections, and targets.  
**Salesbuzz Parity:** `AR_CustTrans`, `AR_RouteTargetPerSalesman`, `BI_DW_Customers`  
**Skills Required:** `/salesbuzz-sfa-data-engineer-v2` · `/frontend-ui-engineering` · `/performance-optimization`

---

## 3.1 — Performance Dashboard ✅
**Tables used:** `visits`, `orders`, `targets`, `attendance`, `supervisors`  
- [x] `src/admin/AdminDashboard.tsx` — management KPI overview
- [x] Coverage%, Strike Rate%, Drop Size, Calls Per Day
- [x] Data filtered by `company_id`

---

## 3.2 — AR Aging & Collections ⬜
**Prerequisite:** Phase 2A Financial Core migration must be applied first  
**Tables used:** `customer_ledger`, `invoices`, `collections`, `customers`, `supervisors`  
**Files to create:**
- [ ] `src/admin/AdminARAgeing.tsx` — aging buckets view (جاري / 1-30 / 31-60 / 61-90 / 90+ يوم)
- [ ] `src/admin/AdminCollections.tsx` — payment collection log entry
- [ ] `src/components/ar/AgingBucketCard.tsx` — colored bucket tiles

**Business Rules (uses `vw_customer_aging` view from Phase 2A migration):**
- Query `vw_customer_aging` — already has `aging_bucket` column in Arabic
- Buckets: جاري (green) | 1-30 (yellow) | 31-60 (orange) | 61-90 (red) | 90+ (dark red)
- Collections: supervisor logs cash/cheque/transfer → creates row in `collections` + `customer_ledger`
- Color: جاري = `#108981` | 1-30 = `#F59E0B` | 61-90 = `#EF4444` | 90+ = `#7F1D1D`
- Total outstanding = SUM(`customer_ledger.outstanding`) WHERE `trans_type IN (1,4)`

**Salesbuzz Mapping:**
```
customer_ledger.amount       → AR_CustTrans.Amount
customer_ledger.trx_date     → AR_CustTrans.TrxDate
customer_ledger.outstanding  → AR_CustTrans.AmountToSettle
vw_customer_aging.aging_days → days since due_date
```

**DONE when:**
- [ ] AR aging page shows correct bucket amounts from `vw_customer_aging`
- [ ] Colors match severity (green → dark red)
- [ ] Collection entry creates row in `collections` + matching `customer_ledger` (trans_type=2)
- [ ] Total outstanding balance correct per company_id

---

## 3.3 — Targets & Achievement ✅
- [x] `src/screens/TargetsScreen.tsx` — target vs actual per supervisor
- [x] Achievement % calculated from `targets` + actual counts
- [x] Admin can set targets from `src/admin/AdminSections.tsx`

---

## 3.4 — Reports Export 🔨
- [x] `src/admin/AdminReports.tsx` — custom report viewer with filter bar
- [ ] CSV export utility for all 5 report types
- [ ] Date range filter on all reports
- [ ] AR Aging Summary report (after 3.2 is done)

---

**PHASE 3 DONE CRITERIA:**
- [ ] AR aging page live with correct bucket amounts (3.2)
- [ ] Collections entry creates ledger rows correctly (3.2)
- [ ] CSV exports for all 5 report types (3.4)
- [ ] All pages load in < 3 seconds

---
---

# PHASE 2A — FINANCIAL CORE (DB MIGRATION) ⬜ NEXT PRIORITY
**Goal:** Apply financial schema to live DB, enabling invoices, collections, AR aging.  
**Migration file:** `supabase/migrations/20261124000001_phase2_financial_core.sql`  
**NOT yet applied to live Supabase DB** — must run before Phase 3.2 and 3.4 AR reports.

**What the migration adds:**
| Table/Extension | Salesbuzz Equivalent | Key Fix vs SB |
|-----------------|---------------------|---------------|
| `customers` extensions (credit_limit, payment_terms, is_blocked) | `Customer.CreditLimit/StopOrder` | numeric(28,8) not nvarchar |
| `products` extensions (UOM, barcode, list/cost price) | `HH_Item` | Proper types |
| `routes` table | `HH_Route` | channel: GT/MT/HoReCa |
| `invoices` (net_total GENERATED) | `AR_Invoice` | GENERATED avoids drift |
| `invoice_items` (is_free_item boolean NOT NULL) | `AR_OrderLines` | boolean not tinyint NULL |
| `customer_ledger` (outstanding GENERATED) | `AR_CustTrans` | GENERATED avoids bug |
| `collections` (cash/cheque/transfer) | `AR_OrderPayments` | Proper status enum |
| `ledger_settlements` (is_closed NOT NULL DEFAULT false) | `HH_AR_TransactionLinks` | Avoids NULL crash bug |
| `vw_customer_aging` view | AR aging query | Arabic bucket labels |
| `vw_rep_performance` view | `BI_DW_Customers` | Coverage%, Strike Rate%, Drop Size |
| RLS on all 6 new tables | BUID scoping | Multi-tenant per company_id |

**Apply via:** Supabase MCP `apply_migration` or Supabase Studio SQL editor.

---
---

# PHASE 4 — ADMIN PANEL & MULTI-TENANT MANAGEMENT 🔨 IN PROGRESS
**Goal:** Company admin can onboard supervisors, manage routes, customers, products without developer help.  
**Salesbuzz Parity:** Admin portal for `HH_Salesman`, `Customer`, `HH_Item`, `HH_Route`, `JourneyPlan`  
**Skills Required:** `/salesbuzz-app-builder` · `/api-and-interface-design` · `/security-and-hardening`

## 4.1 — Supervisor Management ✅
- [x] `src/admin/AdminUsers.tsx` — CRUD list + invite + permissions
- [x] Permission matrix for screen access
- [x] Deactivate = `is_active = false`

## 4.2 — Customer Master Management ✅
- [x] `src/screens/CustomersScreen.tsx` — customer list with search + filter
- [x] GPS coordinates required, geofence validation

## 4.3 — Product & Price Management ⬜
**Tables used:** `products`, `price_list`  
**Files to create:**
- [ ] `src/admin/AdminProducts.tsx` — product catalog CRUD + image upload
- [ ] `src/admin/AdminPriceList.tsx` — price matrix by customer type + date range
- [ ] Extend `src/hooks/useProducts.ts` with admin write operations

**Business Rules (mirror Salesbuzz HH_Item + price tables):**
- Product fields: name, category, SKU code, image to Supabase Storage
- Price list: per product × per customer_type × `valid_from/valid_to` date range
- If no price for customer type → show warning to admin
- Phase 2A adds: `barcode_1`, `barcode_2`, `uom_small`, `uom_large`, `units_per_crt`, `list_price`, `cost_price`

**DONE when:**
- [ ] Admin can add/edit/deactivate products with image
- [ ] Price matrix editable per customer type with date range
- [ ] New product extensions (barcode, UOM) editable after Phase 2A migration

## 4.4 — Beat Plan Management ⬜
**Tables used:** `beat_plans`, `customers`, `supervisors`  
**Files to create:**
- [ ] `src/admin/AdminBeatPlanning.tsx` — daily plan builder
- [ ] Weekly calendar grid — 7-day plan per supervisor
- [ ] Drag-and-drop customer ordering → saves `customer_ids_ordered` UUID[]

**Business Rules (mirror Salesbuzz JourneyPlan):**
- Plan = supervisor × date × ordered list of customers
- Copy week feature (duplicate plan from prior week)
- Field rep's BeatPlanScreen reflects what admin sets here

**DONE when:**
- [ ] Admin can assign customers to supervisor for each day
- [ ] Visit order is draggable and saved correctly
- [ ] Copy week feature works
- [ ] BeatPlanScreen in Phase 1.1 reflects admin's plan

## 4.5 — Routes Management ⬜
**Tables used:** `routes` (created in Phase 2A migration)  
**Files to create:**
- [ ] `src/admin/AdminRoutes.tsx` — routes CRUD
- [ ] Route → supervisor assignment
- [ ] Channel filter: GT / MT / HoReCa / Key Account

**DONE when:**
- [ ] Admin can create/edit/deactivate routes
- [ ] Routes assignable to branches
- [ ] Channel filter works in customer list

## 4.6 — Branch Management ✅
- [x] Branches managed via `src/admin/AdminSections.tsx`

---

**PHASE 4 DONE CRITERIA:**
- [ ] Products + Price List admin screens live (4.3)
- [ ] Beat Plan admin with drag-and-drop (4.4)
- [ ] Routes admin screen (4.5)
- [ ] Zero cross-tenant leakage (company_id filter on every query)

---
---

# PHASE 5 — FLUTTER MOBILE APP (OFFLINE-FIRST) ⬜
**Goal:** Native iOS/Android app that works without internet, syncs when connected.  
**Salesbuzz Parity:** Salesbuzz HH (Handheld) mobile app  
**Skills Required:** `/salesbuzz-app-builder` · `/security-and-hardening` · `/incremental-implementation`

> ⚠️ **Phase 5 Prerequisites:** Phases 0-4 must be complete. All APIs must be stable before Flutter wraps them.

- [ ] Flutter 3.x project setup (mobile/pubspec.yaml)
- [ ] Supabase Flutter SDK — anon key only
- [ ] Hive local DB for offline cache
- [ ] Sync engine: queue → replay when online
- [ ] Beat Plan Screen (offline-first from Hive)
- [ ] Visit Execution Screen with GPS
- [ ] Order Taking Screen
- [ ] Sync indicator: "⚡ متزامن" / "📴 غير متصل - 3 طلبات"

---
---

# PHASE 6 — NOTIFICATIONS & AUTOMATION ⬜
**Goal:** n8n workflows push automated alerts, daily reports, smart notifications.  
**Salesbuzz Parity:** Salesbuzz has no automation — MEYDAN DIFFERENTIATOR  
**Skills Required:** `/n8n-fmcg-sales-automation-expert`

## 6.1 — WhatsApp Notifications via n8n ⬜
- [ ] New order confirmed → WhatsApp to supervisor
- [ ] Missed planned visit > 2 hours → WhatsApp alert
- [ ] EOD summary → WhatsApp to manager at 6 PM Cairo

## 6.2 — Telegram Bot for Management Reports ⬜
- [ ] `/kpi` command → today's KPIs
- [ ] `/aging` command → AR aging summary
- [ ] `/coverage` command → today's coverage %
- [ ] Auto-daily report at 7 AM and 6 PM

---
---

# PHASE 7 — AI FEATURES & ADVANCED INTELLIGENCE ⬜
**Goal:** Predictive insights, smart route optimization, churn prediction.  
**Salesbuzz Parity:** N/A — MEYDAN EXCLUSIVE

## 7.1 — AI Shelf Audit Edge Function ✅ (deployed in Phase 2.1)
- [x] `supabase/functions/analyze-shelf/` — Claude Vision API
- [x] Returns `audit_score`, `audit_summary_ar`, `ai_detailed_report` JSONB

## 7.2 — Predictive Churn Alert ⬜
- [ ] n8n daily job at 8 AM
- [ ] Customers with order gap > 21 days flagged
- [ ] Manager receives WhatsApp alert

---
---

# MODULE COVERAGE MATRIX

| Module | Phase | Salesbuzz Table | Meydan Table | Status |
|--------|-------|-----------------|--------------|--------|
| Login / Auth | 0 | HH_Salesman | supervisors | ✅ |
| Multi-tenant isolation | 0 | BUID scoping | company_id + RLS | ✅ |
| Home Dashboard | 0 | BI_DW_Customers | visits + orders + targets | ✅ |
| Beat Plan / Journey Plan | 1 | JourneyPlan | beat_plans | ✅ |
| Visit Check-In / Check-Out | 1 | Actual_Visits | visits | ✅ |
| Attendance | 1 | (not in SB1) | attendance | ✅ |
| Order Taking | 1 | AR_Order + AR_OrderLines | orders | ✅ |
| Shelf Audit + AI | 2 | (not in SB1) | shelf_audit | ✅ |
| Competitor Tracking | 2 | (not in SB1) | competitor_products | ✅ |
| Surveys | 2 | (not in SB1) | surveys + survey_responses | ✅ |
| Performance Dashboard | 3 | BI_DW_Customer_Transactions | vw_rep_performance | ✅ |
| AR Aging | 3 | AR_CustTrans | vw_customer_aging (Phase 2A) | ⬜ |
| Collections | 3 | AR_SalesmanTrans | collections + customer_ledger | ⬜ |
| Targets | 3 | AR_RouteTargetPerSalesman | targets | ✅ |
| Reports Export | 3 | BI_DW_* tables | custom queries | 🔨 |
| Supervisor Management | 4 | HH_Salesman admin | supervisors + permissions | ✅ |
| Customer Master | 4 | Customer table | customers | ✅ |
| Product + Pricing | 4 | HH_Item + price tables | products + price_list | ⬜ |
| Beat Plan Admin | 4 | JourneyPlan admin | beat_plans admin | ⬜ |
| Routes Management | 4 | HH_Route | routes (Phase 2A) | ⬜ |
| Branch Management | 4 | BUID management | branches | ✅ |
| Flutter Mobile App | 5 | SB HH mobile | Flutter offline-first | ⬜ |
| WhatsApp Alerts | 6 | (not in SB1) | n8n + WhatsApp | ⬜ |
| Telegram Bot | 6 | (not in SB1) | n8n + Telegram | ⬜ |
| AI Shelf Analysis | 7 | (not in SB1) | Edge Function + Claude Vision | ✅ |
| Churn Prediction | 7 | (not in SB1) | n8n ML workflow | ⬜ |

---

# WHAT SALESBUZZ/SONIC CANNOT DO (MEYDAN ADVANTAGES)

| Feature | Salesbuzz | Sonic | Meydan |
|---------|-----------|-------|--------|
| AI Shelf Audit | ❌ | ❌ | ✅ Live |
| WhatsApp Automation | ❌ | ❌ | ⬜ Phase 6 |
| Predictive Churn | ❌ | ❌ | ⬜ Phase 7 |
| White-label Branding | ❌ | Limited | ✅ Live |
| Offline Mobile | ✅ | ✅ | ⬜ Phase 5 |
| Arabic RTL UI | ✅ | Partial | ✅ All Phases |
| Multi-tenant SaaS | ❌ (single-tenant) | ❌ | ✅ Live |
| Built-in Attendance | ❌ | ✅ | ✅ Live |
| Competitor Intelligence | Partial | Partial | ✅ Live |

---

# HARD RULES FOR CLAUDE CODE (NEVER VIOLATE)

```
1. NEVER use service_role key in any frontend file
2. NEVER query: territories, routes (before Phase 2A), sales_facts, customer_actions
3. NEVER rewrite a working screen without explicit user request
4. NEVER change package.json library versions without explicit request
5. NEVER make direct LLM API calls from React — only through Edge Functions
6. ALWAYS filter every query by company_id
7. ALWAYS check supervisor_permissions before rendering a screen
8. ALWAYS store supervisor role changes on server side only
9. ONE feature at a time — finish and verify before starting next
10. When in doubt about schema → check CLAUDE.md Section 3 (Live DB Contract)
```

---

# CURRENT BUILD STATUS

**Last Updated:** 2026-11-24  
**Current Phase:** Phase 3.2 — AR Aging & Collections (after Phase 2A migration applied)  
**Immediate Next Task:** Apply `supabase/migrations/20261124000001_phase2_financial_core.sql` to live DB

## Completed ✅
- Phase 0: Auth, Multi-tenant, Home Dashboard
- Phase 1: Beat Plan, Visit Flow, Attendance, Order Taking
- Phase 2: Shelf Audit + AI, Competitor Tracking, Surveys, Training Academy
- Phase 3.1: Performance Dashboard (AdminDashboard)
- Phase 3.3: Targets (TargetsScreen + AdminSections)
- Phase 4.1: Supervisor Management (AdminUsers)
- Phase 4.2: Customer Master (CustomersScreen)
- Phase 4.6: Branch Management
- Phase 7.1: AI Shelf Audit Edge Function (deployed)

## In Progress 🔨
- Phase 3.4: Reports Export (filter bar done; CSV export pending)

## Not Started ⬜ — Ordered by Priority
1. **Phase 2A Migration** — apply financial core SQL to live DB (BLOCKER for 3.2)
2. **Phase 3.2** — AR Aging screen + Collections screen
3. **Phase 4.3** — Products & Price List admin
4. **Phase 4.4** — Beat Plan admin (drag-and-drop)
5. **Phase 4.5** — Routes Management
6. **Phase 5** — Flutter offline-first mobile
7. **Phase 6** — n8n WhatsApp + Telegram automation
8. **Phase 7.2** — Churn prediction

## Blocked ❌
- Phase 3.2 AR Aging → waiting for Phase 2A migration
- Phase 4.5 Routes → waiting for Phase 2A migration (creates `routes` table)

---

*ROADMAP.md — Meydan SFA Platform | Version 1.1 | Updated 2026-11-24*  
*Place this file in VS Code project root alongside CLAUDE.md*
