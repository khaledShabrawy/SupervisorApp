# خطة Mydan من A إلى Z — مراحل تنفيذ وPrompts جاهزة لـ Replit Agent

**النسخة:** 1.0  
**المشروع:** Mydan / ميدان — تطبيق المشرفين الميدانيين  
**Supabase Project ref:** `ywdlrrdkjbtpfgacuuoy`  
**Replit:** المشروع الحالي `Supabase Scalable Cross` — لا تنشئ Repl جديدًا  
**الغرض:** تقسيم التنفيذ إلى دفعات صغيرة قابلة للفحص، مع المحافظة على البيانات والأمان والأداء.

> **طريقة الاستخدام:** أرسل Prompt 00 أولًا في نفس دردشة Replit Agent. بعد كل مرحلة، افحص النتيجة واختبرها، ثم أرسل الـPrompt التالي فقط. لا تطلب من Agent تنفيذ SQL أو نشر التطبيق. تبقى تغييرات قاعدة البيانات والنشر خطوات منفصلة لا تُنفّذ إلا بعد مراجعة بشرية ووجود نسخة احتياطية وموافقة صريحة.

---

## 1. خلاصة المراجعة وتصحيح الخطة قبل التنفيذ

الخطة المرفقة مفيدة كتصور وظيفي، لكنها لا ينبغي أن تُنفّذ حرفيًا قبل تصحيح النقاط التالية:

1. **افحص التقنية الحقيقية ولا تستبدلها:** نتائج الفحص السابقة في Replit تشير إلى أن التطبيق الحالي **Expo + React Native + TypeScript + Expo Router**، وليس بالضرورة React + Tailwind + React Router كما ورد في مستند الخطة. يجب البناء على المشروع الموجود، وعدم إنشاء تطبيق بديل.
2. **عدد الجداول غير متسق:** الخطة تعدّ 10 جداول أساسية + 9 جداول في Migration 2، أي **19 جدولًا**، لا 18. ثم تضيف Migration 3 جدولين (`companies`, `app_settings`)، فيصبح المتوقع 21 جدولًا إذا كانت كل الجداول السابقة موجودة فعلًا. لا تعتمد العدّ فقط؛ تحقّق من المخطط الفعلي.
3. **لا تشغّل Migration 2 كما هي قبل مراجعتها:** بعض Power BI views قد تضاعف الأعداد بسبب joins بين جداول متعددة الصفوف؛ خصوصًا ربط الزيارات بتدقيق الرف، وربط الزيارات بالأوردرات. يجب تجميع كل مصدر على حدة ثم ربط التجميعات.
4. **Migration 3 متعددة المستأجرين غير جاهزة للتشغيل كما هي:** تضيف `company_id` nullable، لكنها لا تعيد ربط المشرفين والصفوف الحالية بالشركة. النتيجة المحتملة أن البيانات القديمة تختفي عن المستخدمين عبر RLS أو تصبح غير قابلة للوصول. كما أن شركة Demo لا تربط تلقائيًا المشرفين الموجودين بها.
5. **عزل الشركات يحتاج إعادة تصميم/اختبار أمني:** بعض السياسات تسمح بالوصول لكل الصفوف داخل الشركة بدل صفوف المستخدم، وبعض السياسات قديمة غير مسماة بالأسماء التي تحذفها Migration 3 وتبقى فعالة (سياسات permissive تتحد عادةً بمنطق OR). لا تفترض أن إضافة policy جديدة وحدها تحقق العزل.
6. **تعارض محتمل في `CREATE OR REPLACE VIEW`:** Migration 3 تغيّر ترتيب/تضيف أعمدة قبل أعمدة موجودة في عدة views؛ PostgreSQL قد يرفض تغيير أسماء/ترتيب الأعمدة الحالية بهذه الطريقة. يلزم إصدار آمن جديد للـviews أو خطة ترحيل مدروسة مع الاعتماديات.
7. **صلاحية الاستبيانات:** Migration 3 تحذف policy إدارة `surveys` ثم تعرّف قراءة فقط، ما قد يمنع الإدارة من إنشاء/تعديل الاستبيانات.
8. **Storage:** سياسة `company-assets` تسمح لكل مستخدم موثّق بالرفع إلى الـbucket من دون ربط مسار الملف بالشركة. اقرأ عام قد يكون مناسبًا للشعارات العامة فقط، وليس تلقائيًا لصور الزيارات. افحص خصوصية `shelf-photos` واستخدم private bucket وsigned URLs عند الحاجة.
9. **AI لا يسبق كل واجهات التطبيق بالضرورة:** يمكن بناء التطبيق الأساسي بالتوازي مع Edge Function بعد تثبيت عقد البيانات. اجعل شاشة تدقيق الرف تنتظر تكاملًا موثقًا، ولا تدّع نجاح التحليل حتى يكتمل اختبار End-to-End.
10. **مفتاح الواجهة:** استخدم Publishable/anon فقط في العميل. متغيرات `EXPO_PUBLIC_*` تدخل ضمن حزمة تطبيق Expo ويمكن للمستخدم رؤيتها؛ لا تضع فيها `sb_secret_*` أو `service_role` أو أي سر خادمي.

### قرار مبكر مطلوب: هل إطلاق النسخة الأولى لشركة واحدة أم SaaS متعدد الشركات؟

- **نسخة تشغيل داخل شركة واحدة:** أجّل Migration 3 متعددة المستأجرين؛ أطلق MVP آمنًا لشركة واحدة، وصمّم الترحيل إلى tenants لاحقًا بعد نمذجة البيانات.
- **إطلاق لأكثر من شركة من اليوم الأول:** لا تشغّل Migration 3 الحالية. اطلب مراجعة وتصميم Migration جديدة تشمل backfill، قيودًا مرجعية، سياسات RLS كاملة، bootstrap آمنًا لـsuper_admin، واختبارات عزل بين شركتين. لا تنقل بيانات الإنتاج قبل خطة رجوع واختبار staging.

---

## 2. مراحل التنفيذ وبوابات التسليم

| المرحلة | النتيجة المطلوبة | بوابة الانتقال |
|---|---|---|
| A — تثبيت خط الأساس | تقرير التقنية والبنية والأخطاء الحالية، دون تغييرات خارجية | framework وroutes والـschema الفعلي موثقة |
| B — عقد البيانات والهجرة | مطابقة migrations مع schema؛ خطة آمنة لـM2 وقرار tenant | مراجعة SQL وRLS والـviews، دون تشغيلها |
| C — إعداد Supabase | عميل موحد، إعدادات واضحة، الاسم Mydan ومعالجة فقد الإعداد | build/typecheck ينجحان؛ لا تسريب مفتاح |
| D — Auth والصلاحيات | جلسة ومشرف وصلاحيات protected routes | اختبارات مستخدم/دور/صلاحية، deny-by-default |
| E — هيكل تجربة الموبايل | RTL/Cairo/design tokens/nav ومكونات مشتركة | تنقل سليم وأحجام شاشة مختلفة |
| F — شاشات الزيارات | Login, Home, New Visit, Visit | تطابق كامل مع schema؛ حالات loading/error/empty |
| G — عمليات الزيارة | Shelf AI, competitors, orders, reports, notifications | لا اتصال مباشر بمزود AI من العميل ولا writes تجريبية للإنتاج |
| H — الإدارة | صفحات Admin وصلاحياتها وCRUD منضبط | حماية server/database، لا اعتماد على إخفاء الأزرار فقط |
| I — AI وStorage | Edge Function ورفع صورة وRealtime | E2E على staging بمفتاح خادمي في Supabase فقط |
| J — التحليلات | Views آمنة وPower BI بحساب قراءة فقط | أرقام مطابقة لاستعلامات مرجعية وعزل tenant مثبت |
| K — ضمان الجودة والإطلاق | اختبار أداء وأمن وقبول ميداني وخطة رجوع | موافقة المالك على أي migrations أو deployment |

> **أولوية الترتيب:** A → B → (قرار tenant) → C → D → E → F → G/H/I بالتوازي المنضبط → J → K. لا تجعل تفعيل AI شرطًا لبناء كل شاشة، ولا تعتبر schema جاهزًا لمجرد وجود ملف SQL.

---

## 3. قواعد ثابتة لكل Prompts

ضع هذه القواعد في Prompt 00، ولا تسمح بتجاوزها في المراحل اللاحقة:

- العمل في المشروع الحالي فقط، وعلى التقنية الموجودة بعد اكتشافها.
- ممنوع تشغيل SQL/migrations أو تغيير قاعدة بيانات خارجية، إنشاء مستخدمين، حذف/تعديل بيانات إنتاج، تفعيل workflow خارجي، النشر أو الدفع للإنتاج.
- لا تطبع ولا تكشف قيم Secrets. افحص أسماء المتغيرات فقط.
- واجهة العميل تستخدم فقط المفتاح العام Publishable/anon؛ لا تستخدم service_role أو secret key.
- لا تخترع جداول أو أعمدة أو RPCs. SQL/schema الموجود وقراءة schema الفعلي هما المرجع.
- لا تضع صلاحيات مفتوحة افتراضيًا: عند غياب الإذن أو فشل تحميله، امنع الشاشة المحمية بأمان واعرض رسالة عربية. لا تعتمد على إخفاء الزر فقط؛ تحقق من RLS/API أيضًا.
- واجهة عربية RTL وخط Cairo إن كان موجودًا، والألوان المرجعية: أزرق `#1A56DB`، أخضر `#108981`، أحمر `#EF4444`، خلفية `#F8FAFC`.
- الأداء: عميل Supabase واحد، حقول محددة، فلاتر وخيارات limit/pagination على الخادم، منع N+1، تنظيف Realtime subscriptions، إلغاء/تجاهل الطلبات القديمة، caching محسوب.
- بعد كل Prompt: افحص `git diff`، شغّل فحوصات المشروع المتاحة، أبلغ بالأسماء والاختبارات والأخطاء المتبقية. لا تدّعِ نجاح اتصال خارجي إن لم يثبت.

---

# Prompts جاهزة للنسخ

## Prompt 00 — تعليمات المشروع والخط الأحمر

```text
You are working in the EXISTING Replit project “Supabase Scalable Cross” (Repl ID 860386b9-2e70-4cdf-b9ea-c2ed25eed442). Do not create a new Repl or replace the app.

Project target: MYDAN (ميدان), Supabase project ref ywdlrrdkjbtpfgacuuoy. Work incrementally, one prompt/phase at a time, in this chat. Stay on the currently available Free plan; do not trigger paid upgrades.

NON-NEGOTIABLE SAFETY:
- Do not run SQL, migrations, database writes, user/admin creation, deletion, production tests, deployment, publishing, or external workflow activation. You may edit code and prepare migration files for human review only.
- Never print, reveal, commit, log, or place any secret/service-role key in source or client code. Client/mobile code may use only the project's publishable/anon key.
- Read Replit Secret NAMES only, never values. Do not ask me to paste credentials into chat.
- Expo variables prefixed EXPO_PUBLIC_ are embedded in the client bundle and are public at runtime. They may hold only the Supabase URL and publishable/anon key, never a secret.
- Never invent a table, column, SQL function/RPC, or policy. Inspect the existing schema and migrations before writing queries.
- Do not weaken RLS or authorization. Permission loading failures and unknown protected permissions must fail closed (deny access), not fail open.
- Do not rewrite the app into a different framework. Discover and preserve the actual existing project architecture, routes, UI system, and working behavior.
- Arabic UI, RTL, Cairo font if already present. Preserve mobile accessibility and offline behavior if present.
- Optimize for performance without changing business rules: one Supabase client; minimal selected columns; filtered/paginated queries; avoid N+1; clean up subscriptions; avoid unnecessary refetches.

At the end of each phase: summarize files changed, tests run and exact results, remaining blockers, and the gate for the next phase. Never report external connection or deployment as verified unless it was actually verified safely.
```

## Phase A — Prompt 01: جرد المشروع وخط الأساس

```text
PHASE A — READ-ONLY PROJECT INVENTORY. Do not edit files yet.

Inspect the current repository and report:
1. Actual framework, package manager, entry point, scripts, Expo/app metadata, route structure, current preview status, and existing tests/typecheck/build commands.
2. Existing Supabase clients, AuthContext, data hooks, offline/realtime logic, edge-function clients, and all references to old project URLs/API endpoints. Report file paths and variable NAMES only; do not reveal values.
3. All checked-in SQL schema/migrations and relevant Edge Function/workflow files. Map actual table/column/policy/bucket/view names to the requested features.
4. Confirm whether the app is Expo/React Native/Expo Router or web React/Tailwind; do not assume the plan's architecture is accurate.
5. Identify duplicate source/build blockers and distinguish pre-existing errors from requested work.
6. Inspect only whether expected Replit secret names exist, never values.

Return a concise inventory, a dependency graph, current baseline test results, and a risk list. Do not alter code or external systems in this phase.
```

### بوابة A

لا تنتقل حتى نعرف التقنية الفعلية، ونطاق الشاشات الحالي، وأسماء الملفات، ونتيجة build قبل التعديلات. أي خطأ سابق يسجل كـbaseline.

## Phase B — Prompt 02: تدقيق schema وMigration 2

```text
PHASE B1 — STATIC DATABASE/MIGRATION REVIEW ONLY.

Review the checked-in schema and attached Migration 2 against one another. Do NOT execute SQL, connect with write credentials, or change the Supabase project.

Produce:
- A table-by-table schema contract (tables, columns used by the app, keys/relationships, RLS policies, Storage buckets, Realtime tables, views), marking VERIFIED / NOT VERIFIED against checked-in SQL only.
- A list of SQL defects and risks, including row-count mismatch, non-idempotent statements, missing WITH CHECK where needed, role-name mismatches, RLS gaps, broad policies, Realtime duplicate-add behavior, and views with fan-out or incorrect aggregates.
- For each requested feature, identify exactly which existing table/columns support it. Do not infer columns.
- A proposed corrected migration file for human review only, if needed. Do not run it or state that the live database was changed.
- A safe verification script/query set that is read-only and does not expose data or secrets. Keep these as documentation only.

For analytics views, aggregate each fact table independently before joining to prevent visit/order/audit count multiplication. Review view grants and RLS behavior before exposing views through Supabase or Power BI.

Report that the plan says 18 total tables while 10 existing + 9 in Migration 2 imply 19. Do not silently choose a count.
```

### Prompt 03: Tenant قرار وتصميم Migration 3

```text
PHASE B2 — MULTI-TENANT ARCHITECTURE GATE. Do not execute or apply the attached migration3_multitenant.sql.

Analyze whether this product needs single-company deployment first or true multi-tenant SaaS from day one. State trade-offs and recommend a default, but do not make a product decision on my behalf.

Static-review migration3_multitenant.sql for:
- Backfill of company_id for every existing supervisor and dependent row (currently check if this is absent; never assume legacy rows are mapped).
- Bootstrap and recovery path for the first super_admin without exposing service credentials.
- Cross-company RLS for every table and storage path; identify policies that are overly broad, miss WITH CHECK, allow same-company users too much, or leave old permissive policies in place.
- survey write/admin policy coverage and any role/constraint mismatch.
- CREATE OR REPLACE VIEW compatibility when output columns change; migration dependencies and grants.
- Public/private bucket decision, tenant-aware object path/policies, MIME/size constraints, and signed URL strategy.
- Composite tenant-safe foreign keys/constraints, indexes, uniqueness, and nullability/backfill sequence.

Return two options: (A) safe single-company MVP and defer M3, or (B) redesigned multi-tenant migration plan with explicit stages: backup, schema expansion, deterministic data mapping/backfill, dual validation, policy replacement, enforcing constraints, rollback. Prepare SQL files only for review. No SQL execution, data changes, or external mutation.
```

### Prompt 04: عقد بيانات موحد للتطبيق

```text
PHASE B3 — DATA CONTRACT. Use only the verified current schema and the reviewed architecture decision.

Create a concise typed data contract for the existing app: supervisor/auth linkage, customers, visits, shelf audits, competitors, orders, targets, notifications, permissions, and optional tenant scope. Include nullability, real field names, joins, allowed enum values, and which operations are supported under current RLS.

Do not edit the database. Do not invent fields. If a requested feature has no verified schema support, mark it BLOCKED and describe the minimum migration proposal separately. Add shared TypeScript types or generated types only if consistent with the existing project setup; avoid duplicating type definitions.

Return query shapes with minimal columns, filters, limits, and performance considerations.
```

### بوابة B

أي SQL blocker أمني/ترحيل بيانات يمنع استخدام الجدول في الواجهة. Migration 3 خيار معماري يجب حسمه قبل إدخال بيانات شركات حقيقية؛ لا تعتبرها prerequisite افتراضية لنسخة MVP.

## Phase C — Prompt 05: ترحيل اتصال Supabase واسم التطبيق

```text
PHASE C — SAFE APP CONFIGURATION MIGRATION.

Use the verified project architecture from Phase A. The target URL is https://ywdlrrdkjbtpfgacuuoy.supabase.co. Keep one shared Supabase client in the existing project's established location.

Use the environment variables that match the actual framework. For the existing Expo app, prefer:
- EXPO_PUBLIC_SUPABASE_URL
- EXPO_PUBLIC_SUPABASE_ANON_KEY (its value must be a publishable/anon key only; no service_role/secret key)

Check existing code and Replit Secrets by NAME only. If the public key is absent, wire the code safely and show an Arabic missing-configuration state; do not invent or borrow a key. Remove stale legacy URL/API references from active runtime config only after verifying they are obsolete. Do not delete unrelated credentials.

Rename the user-visible app display name to “Mydan” using the correct existing Expo metadata, while preserving bundle/package identifiers.

Add validation that fails gracefully if the URL/key is empty or malformed. Do not log the values. Do not claim a live database connection unless a safe authenticated request using the project's configured public key actually succeeds.

Run typecheck/tests/build. Report exact files changed, expected variable NAMES, and whether connection verification was possible.
```

## Phase D — Prompt 06: Auth، supervisor، permissions، routing

```text
PHASE D — AUTHORIZATION FOUNDATION.

Extend the existing authentication system; do not create a competing auth stack. Use Supabase Auth session state and the verified schema contract from Phase B. Resolve the supervisor by the verified auth-user relationship, respecting real fields and active status.

Implement or adapt:
- Session restoration and auth-state subscription with proper cleanup.
- Protected route guards and safe redirects using the app's current routing framework.
- Supervisor and permission state with loading/error states.
- Permissions fetched from the verified table/columns only; unknown or failed permission checks must deny access to protected features (fail closed).
- Arabic error states for invalid credentials, inactive account, no supervisor profile, missing configuration, and permission load failure.

Do not use a service key. Do not create accounts. Do not broaden RLS. Add tests for unauthenticated, active, inactive, permission enabled/disabled, and permission-query failure cases using mocks/test fixtures only.
```

## Phase E — Prompt 07: Design system وapp shell

```text
PHASE E — SHARED MOBILE APP SHELL.

Using the actual existing Expo/React Native routing and UI structure, implement/reuse a small set of shared components and tokens for Arabic RTL, Cairo (if installed), primary #1A56DB, success #108981, danger #EF4444, background #F8FAFC.

Create or refine loading, skeleton, empty, offline, error, retry, and missing-config states; common card/button/badge/form components; safe-area behavior; and a permission-aware bottom navigation based on the verified route model. Do not add React Router or Tailwind if the project is Expo/React Native. Do not create duplicate screens/routes.

Check small Android viewports, RTL order, keyboard behavior, accessibility labels, and reduced unnecessary renders. Run tests/build and list component contracts.
```

## Phase F — Mobile field workflows

### Prompt 08: Login

```text
PHASE F1 — LOGIN SCREEN ONLY.

Implement/refine the existing login screen using the verified auth foundation. Arabic UI, RTL, Cairo if available, email/password, show/hide password, loading state, accessible labels, and concise Arabic error messages. Use the existing Supabase Auth client; do not store plaintext passwords or add custom auth. Redirect only after session AND supervisor/permission state are resolved. Preserve the existing app flow. Add component/auth tests and run typecheck/build.
```

### Prompt 09: Home

```text
PHASE F2 — HOME SCREEN ONLY.

Implement/refine the Arabic home screen for the signed-in supervisor using only verified schema fields. Show supervisor/branch greeting, today's visit counts, targets/progress, appropriate PSS/strike-rate metrics if supported, quick actions gated by fail-closed permissions, and a bounded list of today's visits.

Use server-side date filters and minimal select columns. Parallelize only independent queries, handle missing optional tables gracefully, avoid N+1 joins, and include skeleton/empty/error/retry states. Do not invent data or silently show fake metrics. Test loading, no data, partial data, and query failure.
```

### Prompt 10: New Visit / customer discovery

```text
PHASE F3 — NEW VISIT / CUSTOMER DISCOVERY ONLY.

Implement/refine the existing new-visit flow using verified customer schema. Request geolocation only after a user action; handle permission denied, timeout, and unavailable location in Arabic. Query only active customers and only needed fields; use bounded/paginated server queries. Sort by Haversine distance in memory only for the already bounded result set unless a verified database RPC exists. Provide Arabic customer-type filters only for values supported by schema/data.

Do not invent an add-customer table/column. If creating a new prospect/customer is unsupported, show an explicit unavailable state and report the required schema/API contract rather than writing guessed fields. Pass the selected customer/location through the existing router safely.
```

### Prompt 11: Visit screen + checklist

```text
PHASE F4 — VISIT DETAIL ONLY.

Implement/refine the customer visit screen using verified route state and schema. Show customer details, GPS/geofence status (use 500 m only if confirmed business rule), three visit outcomes if valid in schema, and visit_tasks only if table/columns are confirmed. Gate shelf/competitor/order actions by actual permissions and routes.

Persist only fields present in the verified schema and only as a user-initiated operation. Do not perform production test writes. Prevent duplicate submit, show retryable Arabic errors, and update local state/cache after success. Include tests for missing GPS, out-of-range, in-range, each outcome, and failed write.
```

### Prompt 12: Shelf audit UI and integration contract

```text
PHASE F5 — SHELF AUDIT SCREEN ONLY.

Preserve existing shelf audit functionality and first fix any confirmed duplicate-source/build errors without changing behavior. Use existing photo picker/camera/upload flow after verifying the actual bucket and schema contract. Do not assume shelf-photos is public or even present without verification.

The mobile client must call only the Supabase Edge Function endpoint for AI; never call Claude/OpenAI directly and never include a secret key. Use an authenticated request with the current user session where required. Subscribe only to the specific audit row/id if supported, handle timeout/offline/retry, unsubscribe on unmount, and show an Arabic score/summary only after a verified database result arrives.

Do not run an AI request against production or create test rows. If the Edge Function/Storage config is missing, implement a clear disabled/missing-configuration state and report the exact owner setup required.
```

### Prompt 13: Competitor capture

```text
PHASE F6 — COMPETITOR PRODUCTS SCREEN ONLY.

Implement the competitor capture UI within the existing route structure. Verify every field and relationship against the current schema before coding. Use visit_id linkage only if verified. Support manual brand/product/quantity input and optional photo only if storage/schema policy is confirmed. Validate input, avoid duplicate inserts, show Arabic validation/loading/success/error states, and keep writes user-initiated. Do not invent columns or run production writes.
```

### Prompt 14: Order capture

```text
PHASE F7 — ORDER SCREEN ONLY.

Implement order creation with verified products, pricing, order, supervisor, visit, customer fields and relationships. Fetch active products and applicable price rows using minimal server-side filters and dates. Calculate totals safely with decimal/currency handling; validate quantity/minimums based on verified business rules. Do not invent prices, columns, stock behavior, or RPCs. Do not perform production writes. Add tests for price selection, quantity validation, totals, empty product list, and duplicate submission.
```

### Prompt 15: Reports

```text
PHASE F8 — SUPERVISOR REPORTS ONLY.

Implement today's/weekly report views using verified schema and server-filtered date ranges. Use correct aggregation; avoid joining multiple one-to-many facts before aggregation. Clearly define strike rate, PSS, out-of-range, visit/order totals. If a metric requires a view not confirmed to exist, show it as unavailable rather than fabricate it and propose a reviewed view contract. Use pagination and cache sensible summaries. Add fixtures/tests for zero denominator and empty dates.
```

### Prompt 16: Notifications

```text
PHASE F9 — NOTIFICATIONS ONLY.

Implement notification list and mark-as-read using verified table fields and RLS. Paginate newest-first, show unread count, and set up a narrowly filtered Realtime subscription only if enabled and allowed. Clean up subscription on logout/unmount; reconcile events with local state to avoid duplicates and unnecessary full reloads. Handle permissions/offline/errors in Arabic. Do not send test notifications or mutate production data.
```

## Phase G — Prompt 17: AI Edge Function + Storage (Server-side only)

```text
PHASE G — AI BACKEND INTEGRATION PREPARATION.

Inspect existing Supabase Edge Function source, storage usage, payload shape, and mobile call site. Do not deploy, execute, enable, or call a production function in this phase.

Harden/prepare code for:
- Authenticated caller validation and authorization to the specific visit/audit row.
- Server-side secret retrieval through Supabase Edge Function secrets only; never send AI provider key or service_role to client/Replit Expo variables.
- Input schema validation, file/type/size limits, timeout, bounded retries, rate limiting/abuse protection, and safe Arabic error responses.
- Private photo storage by default where photos can identify people/customers; signed URL or server-side fetch; do not expose public URLs unless reviewed and explicitly intended.
- Idempotent audit processing, status transitions if supported by schema, and safe Realtime updates.
- No logging of tokens, signed URLs, raw photos, or personally identifiable data.

Return code diffs and a manual deployment checklist. State what owner must configure in Supabase. Do not claim deployed or tested end-to-end.
```

## Phase H — Admin panel

### Prompt 18: Admin authorization and shell

```text
PHASE H1 — ADMIN PANEL AUTHORIZATION + SHELL.

Inspect whether the existing project supports an Admin web route or whether it is a native Expo-only app. Do not assume /admin is automatically supported. Implement the smallest admin entry point compatible with the existing architecture, using verified roles and secure server/database policies. Hiding UI is not authorization.

Use the existing auth session; route non-admin users to a safe Arabic denied page. Unknown or failed role lookup must deny access. Keep business data access governed by RLS or a server-side authorization layer; never put service_role in browser/mobile code. Do not create users, elevate roles, or mutate production data.

Report whether an Admin web experience is actually supported in this Repl or requires a separate client/host.
```

### Prompt 19: Admin CRUD modules

```text
PHASE H2 — ADMIN MODULES IN SMALL, REVIEWABLE SLICES.

Using the verified schema and authorization foundation, implement only confirmed modules, one group at a time:
1) supervisors/users and permission assignment; 2) branches/customers; 3) products/prices/targets/planograms; 4) notifications/surveys if schema/policies support them.

For each group: inspect columns and RLS first; use forms with Arabic labels, validation, searchable/paginated lists, confirmation for destructive actions, and explicit loading/success/error states. Do not create Auth users or change roles automatically unless a separately authorized, secure backend flow is already present. Do not add schema or write production data. Report unsupported operations and needed backend/RLS work.
```

## Phase I — Tenant-safe migration (only if decision is multi-tenant)

### Prompt 20: Multi-tenant implementation code

```text
PHASE I — TENANT-AWARE APPLICATION CODE ONLY, conditional on an approved tenant architecture and reviewed schema contract.

Implement tenant context from the authenticated supervisor/company relationship using verified fields. Add company scope to relevant queries as defense in depth, but never treat client-supplied company_id as authorization. RLS remains the authoritative boundary.

Do not implement tenant mode against the attached migration3_multitenant.sql until its backfill, policies, storage isolation, bootstrap, indexes, and views have passed the separate SQL review. Do not run migrations or modify live data. Add cross-tenant tests proving company A cannot read/write company B records, including storage and reports. If no tenant is assigned, fail closed with a useful message.
```

## Phase J — Prompt 21: Power BI / reporting layer

```text
PHASE J — POWER BI CONTRACT AND SAFE ANALYTICS.

Review the five requested views: vw_daily_kpi_supervisor, vw_perfect_store_index, vw_branch_performance, vw_competitor_heatmap, vw_oor_analysis. Do not execute or deploy SQL.

Define precise metric semantics and validate each view against the actual schema. Correct fan-out by pre-aggregating visits, audits, orders, and targets independently. Avoid counting orders/visits multiple times. Include zero-denominator handling, date/company/branch filters, correct numeric types, and least-privilege view access. Review Supabase view security/RLS behavior and avoid exposing cross-tenant data.

Prepare corrected SQL as review-only migration files plus sample read-only validation queries. For Power BI, document a dedicated read-only database role/connection procedure; never use service_role or an owner password in the app, and never print credentials. Do not publish dashboards or schedule refreshes.
```

## Phase K — Prompt 22: اختبار، أداء، أمن

```text
PHASE K — QUALITY GATE.

Run all existing lint/typecheck/unit/build/export tests. Add or update tests for auth, route guards, permission fail-closed behavior, query failures, offline states, date boundaries, and cross-tenant isolation if tenant mode is approved. Use mocks/local fixtures only; no production writes.

Run a static secret scan that reports filenames and variable NAMES only; never print matched credential values. Confirm no service_role/sb_secret key is reachable from client bundles. Review dependencies and remove only clearly unused or unsafe items.

Profile/inspect for: duplicate Supabase clients, N+1 queries, unbounded selects, unnecessary renders, stale requests, Realtime leaks, image-size issues, and repeated queries. Fix only verified blockers. Report before/after test outcomes and pre-existing issues distinctly.
```

## Phase L — Prompt 23: Pilot وRelease readiness (لا تنشر)

```text
PHASE L — RELEASE READINESS PLAN ONLY.

Prepare a staged pilot checklist without publishing or deploying. Include:
- Separate development/staging/production URLs and public-key secret names (values must never be reported).
- Owner-only manual review/apply steps for approved SQL migrations, after backup and staging validation.
- Auth redirect URLs, Android app metadata/permissions, storage/privacy checks, Edge Function secrets, rollback steps, monitoring and support ownership.
- Acceptance scenarios for supervisor login, home, GPS visit, visit outcomes, shelf audit AI, competitor capture, order, reports, notifications, and admin authorization.
- Performance targets that can be measured (screen load, query count/latency, image upload size), with measurement method, not invented results.

Do not press Publish, deploy, expose preview publicly, run SQL, create test users, or perform production writes. Return a go/no-go checklist and explicitly list owner approvals still required.
```

---

## 4. أوامر تشغيل المراحل عمليًا

1. الصق Prompt 00 في دردشة Agent الحالية مرة واحدة.
2. أرسل Prompt 01 وانتظر تقريره. لا توافق على تعديل غير مصرح به.
3. أرسل Prompts 02–04 لتثبيت schema وعقد البيانات وقرار tenant قبل أي اعتماد على أعمدة.
4. أضف مفتاح Publishable/anon بنفسك إلى Replit Secrets، لا ترسله داخل المحادثة. في Expo استخدم أسماء المتغيرات التي يثبتها الكود الحالي؛ الاسم المتوقع في هذه الخطة `EXPO_PUBLIC_SUPABASE_URL` و`EXPO_PUBLIC_SUPABASE_ANON_KEY`.
5. بعدها C → D → E، ثم الشاشات واحدة في كل مرة. راجع `git diff` والاختبارات بعد كل Prompt.
6. نفّذ AI وAdmin وPower BI بعد جاهزية عقودها، ولا تجعل نجاحها مفترضًا قبل إعداد Supabase الفعلي.
7. أي SQL جديد: يراجعه شخص مخوّل، يختبره على staging/نسخة احتياطية، ويوافق عليه قبل تطبيقه يدويًا. Agent لا يشغّله.
8. لا تستخدم خطة مدفوعة أو مفاتيح خادمية لتجاوز حد التشغيل. قسّم العمل إلى مهام أصغر على الخطة الحالية إذا احتجت.

---

## 5. قائمة قبول MVP المقترحة

### قبل تجربة المستخدمين
- [ ] تم توثيق Expo / React Native / Expo Router الفعلي والبناء ينجح.
- [ ] لا يوجد عنوان مشروع قديم ضمن runtime config النشط.
- [ ] المفتاح في العميل Publishable/anon فقط، وRLS مفعّل ومراجع.
- [ ] تسجيل الدخول واستعادة الجلسة والتوجيه واختبارات الصلاحيات تعمل.
- [ ] unknown permission/query failure يمنع الوصول المحمي.
- [ ] الزيارات لا تُكتب إلا بالحقول المتفق عليها ويُمنع duplicate submit.
- [ ] لا توجد `select('*')` غير مبررة أو queries بلا limit في قوائم كبيرة.
- [ ] Realtime subscriptions تُنظف عند الخروج/تغيير المستخدم.
- [ ] صور الرف لا تنشر علنًا دون قرار خصوصية صريح.
- [ ] Edge Function وحدها تملك سر مزود الذكاء الاصطناعي، ولا يوجد مفتاح سرّي في التطبيق.
- [ ] مقاييس views تطابق استعلامات مرجعية ولا تحتوي تضخيم counts.
- [ ] تم اختبار RTL، حالات الاتصال الضعيف، GPS المرفوض، وحدود الأداء.
- [ ] migrations والـdeployment معتمدة منفصلة من مالك النظام وبعد staging/backup.

### Definition of Done لكل Prompt
- تغييرات محدودة وواضحة، دون إعادة بناء غير مطلوبة.
- typecheck/build/tests موثقة بالنتيجة الفعلية.
- لا أسرار في diff أو logs.
- لا تغيير schema/بيانات خارجية.
- تقرير بالأسماء والملفات والقيود، ثم توقف عند بوابة المرحلة التالية.
