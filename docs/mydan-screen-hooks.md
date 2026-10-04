# PWA screen implementation contract

Create all eleven requested files in `artifacts/mydan/src/screens/`, and change the lazy imports in `src/App.tsx` to these files. Preserve all routes and shared `Shell`/`BottomNav`. Do not duplicate BottomNav or the header inside protected screens. Every screen calls `useAuth()` and `useAppSettings()`. The main agent owns data hooks, settings context, CustomerPicker and helpers; do not edit those files.

## Existing hooks (`@/lib/data`)

- `useCreateVisit()` mutation: `{customer_id,latitude,longitude,notes,existingId?}`. Keep pending-visit starts as PATCH, never duplicate them.
- `useVisitToStart(id|null)` query with `customers: Customer|null`.
- `useSaveCustomer()` mutation: `{id?,input:{name,customer_type,address,latitude,longitude,is_active}}`.
- `useVisitOptions()` query: `VisitRow[]`, selectable visits for orders/audits.
- `useCreateOrder()` mutation `{visit:VisitRow,product_id:string,quantity:number}`; quantity is a positive integer, with no monetary fields.
- `useNotifications(unreadOnly:boolean)` paged query `items:Notification[]`.
- `useUnreadCount()` query number; do not substitute zero for an error.
- `useMarkRead()` mutation `id|'all'`.
- `useSupervisors()` paged query `items:Supervisor[]`.
- `useUpdateSupervisor()` mutation `{target:Supervisor,patch:{is_active?,role?:'admin'|'supervisor'}}`; self and super_admin locked.
- `useBeatPlan(day:number)` query `{plan:BeatRow[],visited:Map<string,VisitStatus>}` (JS weekdays Sun=0, Sat=6).
- `useUpdateVisitStatus()` mutation `{id,status:'completed'|'cancelled'}`.
- All paged queries expose `items,isPending,isError,error,refetch,hasNextPage,fetchNextPage,isFetchingNextPage`.

## New hooks (`@/lib/screen-data`, main agent implementing)

- `useScreenDashboard()` query `{visits:number,orders:number,audits:number,visitsProgress:number,recent:VisitRow[]}`.
- `useVisitsRange(period:'today'|'week'|'month')` paged VisitRow query; nested customers include name,address,latitude,longitude.
- `useOrdersFiltered(status:'all'|'pending'|'confirmed'|'delivered'|'cancelled')` paged OrderRow query with customer, product and quantity.
- `useOrderCount(status:string)` exact record count (all matching rows, not only loaded page).
- `useCustomerCards(search:string,type:string)` paged `CustomerCardRow` (`Customer & {last_visit:string|null}`). Empty type or `all` means no type filter. Debounce at caller 300ms via `useDebouncedValue`; do not debounce twice.
- `useCustomerHistory(id:string|null)` paged VisitRow query, disabled when no id.
- `useCustomerById(id:string|null)` query Customer for beat-plan `?customer=ID` preselection.
- `useMonthlyTargets()` query `MonthProgress[]`: current plus previous 3 months, descending. Each `{month,year,visits_target,orders_target,audit_target,actual_visits,actual_orders,actual_audits}`. Current cards and historical CSS bars derive real counts.
- `useAdminProducts()` paged `CatalogProduct` `{id,name,category,sku?:string,is_active}`. Read-only catalog. `useOrderProducts()` selects active products for quantity recording.
- `useSaveSettings()` mutation `SettingsInput` `{app_name,primary_color,geofence_radius_m,target_brand_name,competitor_brands:string[]}`.
- `useSaveMonthlyTarget()` mutation `{supervisor_id,month,year,visits_target,orders_target,audit_target}`.
- `useUploadAudit()` mutation `{visit:VisitRow,file:File}` -> `ShelfAudit` with persisted id and public photo_url. Caller must choose visit.
- `useRequestAuditAnalysis()` mutation `ShelfAudit` -> void; real configured project JWT POST with requested body.
- `useAuditResult(id:string|null)` query ShelfAudit; polling pending/processing + screen useRealtime on `shelf_audits`, `id=eq.ID`, calling refetch. Use existing plural table from project contract, not invented singular table.

## Helpers/components

- `useDebouncedValue(value,300)` in `@/hooks/useDebouncedValue`.
- `customerTypeLabel(value)` and `relativeArabicTime(iso)` in `@/lib/screen-helpers`.
- `CustomerPicker` already handles 300ms debounce; stable onChange callbacks.
- `useAppSettings()` works on login with generic public shell defaults; optional explicit public company branding only if VITE_PUBLIC_COMPANY_ID configured and RLS permits app_name/logo_url read. It never queries an arbitrary company's private settings before auth.
- `Shell` main agent adds global unread bell; Dashboard adds visits realtime subscription itself.
- Reuse `notify`, `PageTitle`, `Sheet`, `ErrorState`, `LoadMore`, `SkeletonList`, `StatusBadge`, `KPICard`.

## Exact user requested surfaces

1. LoginScreen: centered RTL card; settings logo lazy (blue م circle fallback), app_name, tagline «نظام إدارة المشرفين الميدانيين», email/password placeholders, eye toggle, loading submit «تسجيل الدخول», Arabic failures, profile retry/signout retained.
2. DashboardScreen: shared header and unread bell; horizontal four memo KPIs «زيارات اليوم / أوامر اليوم / مراجعات الرف / الهدف%»; 2x2 actions new visit green, audit blue, orders orange, beat plan purple; recent 5 visits memo rows; scoped visits realtime.
3. NewVisitScreen: back /visits, customer search, GPS «جاري تحديد موقعك...», distance, yellow «أنت بعيد عن موقع العميل (Xم)» outside radius; retain disabled check-in outside geofence (do not weaken guard), «تسجيل الوصول», Arabic toast + /visits. Support `?customer=ID` and existing `?visit=ID`.
4. ShelfAuditScreen: 3 steps (photo, AI, report), camera/capture/preview/retry, visit selection; upload only once, then request analysis; waiting animated «جاري تحليل الرف...»; recover after reload using `?audit=ID`; result score circle green>75/yellow>50/red otherwise, Arabic summary, issues/recommendations from ai_detailed_report (handle arrays of strings or objects safely), persisted report «حفظ التقرير» (download self-contained Arabic report or explicit confirmation of already persisted report, not fake save). Realtime result, failed/retry, no AI when company flag disabled.
5. VisitsScreen: today/week/month tabs, memo rows with name/date/time/status/distance, 20-item pagination via LoadMore + IntersectionObserver infinite sentinel, mobile pull-to-refresh + accessible refresh button, FAB, empty state.
6. OrdersScreen: total summary, all/pending/completed/cancelled filter chips, memo cards, Arabic amounts/date/status, retain functional creation modal from existing app.
7. CustomersScreen: callback search + 300ms debounce, Arabic category chips (include all); useMemo list, memo cards name/type/address/last visit; detail modal with real visit history; retain create/edit forms from existing app. Optional `embedded` prop suppresses only page heading for admin reuse.
8. TargetsScreen: Arabic current month; 3 color-coded CSS progress cards with actual/target/%; previous three months CSS bar chart, no chart library; accessible text values and empty/zero target handling. Read atta-chart-authoring skill, but user's explicit CSS-only constraint wins over chart library choices.
9. BeatPlanScreen: days Saturday-first (6,0,1,2,3,4,5); customer type badges + clickable memo rows navigate /visits/new?customer=ID; empty «لا توجد زيارات مخططة».
10. NotificationsScreen: mark all «تحديد الكل كمقروء», memo rows with title/body/relative Arabic time; unread left blue border and pale blue; tap marks read; realtime new rows slide in from top, respects reduced motion; empty «لا توجد إشعارات».
11. AdminPanel: admin guards retained; tabs «المشرفون / العملاء / المنتجات / الإعدادات / الأهداف»; supervisors active toggles with confirmation and self/super_admin safeguards; embed customer screen; paged existing products list; settings controlled form fields above, comma-separated competitors; monthly target form per supervisor (load more supervisor options; no only-first-page limitation).

Every list item React.memo, all handlers useCallback (including per-row components), filtered/sorted/derived data useMemo; images loading=lazy; searches 300ms. All strings Arabic, Cairo and current safe-area/max430 styles. No emojis, no new packages, no fabricated database rows/tables/metrics. No live writes, schema migrations, external AI requests, users, credentials, workflow changes or publishing during development/testing. Edit only screens, App.tsx lazy imports and a new screens.css imported by index.css; don't edit data/hooks/contexts/shared components. Preserve existing create/edit workflows rather than dropping them.