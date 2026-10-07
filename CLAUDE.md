# CLAUDE.md — Architecture, Security Guardrails & Operational Directives
# Project: Mydan (ميدان) | Supabase Ref: ywdlrrdkjbtpfgacuuoy

## 1. System Overview & Single Source of Truth
- **Product:** ميدان (Mydan v1.0) — Enterprise FMCG Field Force Automation & Shelf Intelligence.
- **Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Supabase (PostgreSQL 17.11, Auth, Realtime, Storage, Edge Functions).
- **Live Deployed App:** `https://supabase-scalable-cross.replit.app` (Existing Repl: `Supabase Scalable Cross`).
- **Live Database State:** 24 ACTIVE base tables with Row Level Security (RLS) + 5 Power BI Views.
- **Frontend Current Progress:** React PWA (~85% complete). Target: 9 Mobile Screens + Standalone Web Admin.
- **AI Vision Engine:** Supabase Edge Function `analyze-shelf` (v2) integrated with Claude Vision API (Sonnet 4.6).
- **Design Tokens & Localization:** Native Arabic RTL, Cairo Font.
  - Primary: `#1A56DB` | Success: `#108981` | Danger: `#EF4444` | Warning: `#F59E0B` | Background: `#F8FAFC`

---

## 2. Hard Security & Operation Guardrails (Non-Negotiable)
1. **Client Credential Boundary:** Frontend/Client code MUST ONLY use `VITE_SUPABASE_ANON_KEY` (Publishable). NEVER import, log, or embed `service_role` or secret keys in client bundles.
2. **Fail-Closed Authorization:** If permissions from `supervisor_permissions` fail to load or are undefined, access to the route/action MUST BE DENIED immediately with an Arabic warning.
3. **No Direct LLM Frontend Calls:** The frontend MUST NEVER call Anthropic or AI APIs directly. Image audits route strictly through `/functions/v1/analyze-shelf`.
4. **Phase 0 Security Adherence:**
   - Supervisors can only update their own `full_name` and `phone` via client grants (role, company_id, and is_active are locked).
   - Tenant isolation must be strictly enforced on `app_settings` and `price_list` via `company_id`.
   - All security definer functions must have pinned `search_path = public, pg_temp`.
5. **Freeze RTM Intelligence Tables (Do Not Query):** The 10 proposed RTM tables (`territories`, `routes`, `sales_facts`, `customer_actions`, etc.) ARE NOT APPLIED TO LIVE DB. Never invent or query them in v1.0.
6. **No Destructive Refactoring:** Do not rewrite functioning screens or modify library versions in `package.json`. Modify only the specific target file requested.
7. **Email & User Lifecycle (Owner Decision):** Real mailboxes required (Gmail, Outlook, etc.) with link confirmation. No auto-confirm; provisioning through future Admin Control.

---

## 3. Verified Live Database Contract (24 Tables)
Query only these exact tables and columns verified from live production audit:

### A. Administration & FMCG Core
- `companies`: `id`, `name`, `name_en`, `logo_url`, `primary_color`, `secondary_color`, `industry`, `country`, `city`, `license_key`, `license_type`, `max_supervisors`, `is_active`, `expires_at`
- `app_settings`: `id`, `company_id`, `app_name`, `app_name_en`, `app_tagline`, `logo_url`, `favicon_url`, `primary_color`, `success_color`, `danger_color`, `background_color`, `geofence_radius_m`, `visit_types`, `target_brand_name`, `competitor_brands`, `ai_audit_enabled`, `whatsapp_number`
- `supervisors`: `id`, `user_id`, `company_id`, `branch_id`, `full_name`, `phone`, `branch`, `role` ('supervisor', 'senior_supervisor', 'branch_manager', 'admin', 'super_admin'), `is_active`
- `supervisor_permissions`: `id`, `company_id`, `supervisor_id`, `screen_key`, `is_enabled`
- `branches`: `id`, `company_id`, `name`, `region`, `manager_id`, `latitude`, `longitude`, `is_active`
- `customers`: `id`, `company_id`, `supervisor_id`, `name`, `type`, `customer_type`, `owner_name`, `phone`, `address`, `latitude`, `longitude`, `branch`, `created_by`, `is_active`
- `products`: `id`, `company_id`, `name`, `category`, `sku_code`, `image_url`, `is_active`
- `price_list`: `id`, `company_id`, `product_id`, `customer_type`, `unit_price`, `min_quantity`, `valid_from`, `valid_to`, `is_active`

### B. Execution, Visits & Attendance
- `visits`: `id`, `company_id`, `supervisor_id`, `customer_id`, `visit_date`, `visit_outcome` ('متعامل', 'غير متعامل', 'غير موجود'), `check_in_time`, `check_out_time`, `latitude`, `longitude`, `geo_distance`, `on_beat`, `status`, `notes`
- `visit_tasks`: `id`, `company_id`, `visit_id`, `task_type` ('shelf_audit', 'competitor_check', 'order', 'survey', 'other'), `title_ar`, `is_completed`, `is_mandatory`, `order_num`, `completed_at`
- `beat_plans`: `id`, `company_id`, `supervisor_id`, `customer_id`, `plan_date`, `day_of_week`, `customer_ids_ordered` (UUID[]), `total_distance_km`, `status`
- `attendance`: `id`, `company_id`, `supervisor_id`, `attendance_date`, `check_in_time`, `check_out_time`, `check_in_lat`, `check_in_lng`, `selfie_url`, `notes`

### C. Commercial, Audits & Targets
- `shelf_audit`: `id`, `company_id`, `visit_id`, `supervisor_id`, `product_id`, `photo_url`, `audit_score`, `audit_summary_ar`, `ai_detailed_report` (JSONB), `status`, `is_present`, `quantity`
- `competitor_products`: `id`, `company_id`, `visit_id`, `brand_name`, `product_name`, `quantity`, `photo_url`, `notes`
- `orders`: `id`, `company_id`, `visit_id`, `supervisor_id`, `customer_id`, `product_id`, `quantity`, `unit_price`, `total_price`, `status`, `notes`
- `targets`: `id`, `company_id`, `supervisor_id`, `target_date`, `month`, `year`, `visits_target`, `audit_target`, `orders_target`, `actual_visits`, `actual_audits`, `actual_orders`
- `planograms`: `id`, `company_id`, `category`, `image_url`, `description`, `is_active`

### D. Governance & Asset Management
- `surveys`: `id`, `company_id`, `title`, `questions` (JSONB), `target_customer_type`, `is_mandatory`, `is_active`, `valid_from`, `valid_to`
- `survey_responses`: `id`, `company_id`, `survey_id`, `visit_id`, `supervisor_id`, `answers` (JSONB), `submitted_at`
- `notifications`: `id`, `company_id`, `supervisor_id`, `type` ('ai_result', 'target_alert', 'admin_message', 'system'), `title_ar`, `body_ar`, `action_url`, `is_read`
- `audit_logs`: `id`, `company_id`, `table_name`, `action` ('INSERT', 'UPDATE', 'DELETE'), `performed_by`, `old_data` (JSONB), `new_data` (JSONB)
- `asset_types`: `id`, `company_id`, `name_ar`, `name_en`, `icon`, `color`, `requires_qr`, `requires_serial`, `custom_fields` (JSONB), `is_active`
- `assets`: `id`, `company_id`, `asset_type_id`, `customer_id`, `asset_code`, `serial_number`, `model`, `assigned_technician_name`, `assigned_technician_phone`, `status`, `custom_field_values` (JSONB), `is_active`
- `asset_tickets`: `id`, `company_id`, `asset_id`, `visit_id`, `reported_by`, `fault_type`, `fault_description`, `photo_url`, `ai_priority`, `status`, `resolved_at`, `resolution_notes`

### E. Analytical Views (PostgreSQL Read-Only)
- `vw_daily_kpi_supervisor`, `vw_perfect_store_index`, `vw_branch_performance`, `vw_competitor_heatmap`, `vw_oor_analysis`, `vw_asset_fleet_health`

---

## 4. Frontend Engineering & Logic Rules
1. **Single Supabase Client:** Rely exclusively on `src/lib/supabase.ts`. Do not instantiate redundant clients.
2. **Selective Queries & Pagination:** Never run unbounded `select('*')` on transactional tables (`visits`, `orders`, `shelf_audit`). Always constrain columns, apply `.limit()`, and filter by date.
3. **Proximity Calculation:** Use client-side Haversine formula (or call RPC `public.mdn_nearest_customers_v1`) against active customers. Support variable limits (5, 10, 15, all). Direct navigation links format: `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`.
4. **Image Compression:** Always compress camera captures using HTML Canvas (max width 1200px, JPEG quality 0.85) prior to uploading to `shelf-photos` bucket.
5. **Realtime Channels:** Clean up Realtime subscriptions (`supabase.removeChannel()`) in cleanup hooks (`useEffect` return).
6. **Mobile Sharing:** Use native Android Share Sheet for dispatching action summaries without external webhooks.

---

## 5. Development & Verification Commands
- `pnpm install` : Install dependencies.
- `pnpm run build` : Type-check and compile bundle. Execute and verify after EVERY screen edit.
- `pnpm run dev` : Start local development server.