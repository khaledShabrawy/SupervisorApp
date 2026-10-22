# ذاكرة مشروع تطبيق ميدان (Mydan App System Memory)

هذا الملف يمثل الذاكرة الدائمة (Persistent Memory) لمشروع Mydan في بيئة Antigravity. يتم تحميله تلقائياً لضمان استمرارية المعرفة بهيكلة النظام، سياسات الأمان، وفريق العمل.

---

## 1. هوية المشروع والتقنيات (Project Stack & Identity)

* **اسم المشروع:** ميدان - Mydan (نظام إدارة ومتابعة قوى البيع الميدانية والتدقيق بالذكاء الاصطناعي).
* **النطاق الحي المعتمد:** `https://mydan.digityoucan.com` (مستضاف على Cloudflare Pages مربوط بمستودع GitHub).
* **مستودع الكود (Git Remote):** `https://github.com/khaledShabrawy/SupervisorApp.git` على فرع `main`.
* **الواجهة الأمامية (Frontend):** React 18, TypeScript, Vite, Tailwind CSS, Leaflet Maps, Lucide Icons, TanStack Query.
* **تطبيق الهاتف (Mobile App):** Capacitor Android (مع بناء نظيف عبر `vite build --mode android`).
* **قاعدة البيانات (Backend):** Supabase PostgreSQL مع RLS شامل و 24 جدول ودوال سحابية (Edge Functions).

---

## 2. إدارة وتنسيق المشروع (Project Leadership & Team)

* **مدير التطوير والمشروع (Head of Development & Project Manager):**
  * هو الموجه وصاحب القرار في التنسيق البرمجي والتسليمات.
* **مهندس مراجعة الجودة والاختبار الميداني (QA & Field Testing Lead):**
  * **الاسم:** الباشمهندس أحمد.
  * **الهاتف:** `01005886450` (`+201005886450`).
* **بروتوكول تسليم المراجعات (QA Dispatch Protocol):**
  * فور انتهاء أي مهمة أو تحديث، يقدم المساعد تقريراً تقنياً موجزاً للمدير مع **رابط واتساب مباشر بنقرة واحدة (1-Click WhatsApp)** موجه للبشمهندس أحمد يحوي تفاصيل التحديث وروابط الفحص الحي.

---

## 3. قاعدة البيانات وترحيلات الأمان (Database & Security)

### الترحيلات المنفذة على قاعدة البيانات الحية:
* **Migration 20 (`scripts/sql/20_fix_manager_permissions_and_rls.sql`):**
  * حل مشكلة التفعيل والتعطيل: منح صلاحية تحديث أعمدة `(full_name, phone, device_id, is_active, role, branch_id)` للمستخدم الموثق.
  * تفعيل سياسات الـ RLS لدور `manager` و `branch_manager` لإدارة المشرفين، العملاء، والأصناف.
* **Migration 21 (`scripts/sql/21_security_indexes_and_policy_hardening.sql`):**
  * تفعيل RLS الشامل على جميع الجداول بلا استثناء.
  * إنشاء الفهارس المركبة الأربعة عالية الأداء:
    1. `idx_attendance_lookup` على `attendance (company_id, supervisor_id, attendance_date DESC)`.
    2. `idx_beat_plans_lookup` على `beat_plans (company_id, day_of_week, supervisor_id)`.
    3. `idx_notifications_lookup` على `notifications (company_id, supervisor_id, is_read, created_at DESC)`.
    4. `idx_customers_supervisor_lookup` على `customers (company_id, supervisor_id, is_active)`.
* **Migration 22 (`scripts/sql/22_allow_delete_supervisor.sql`):**
  * السماح بالحذف النهائي للمستخدمين والمشرفين (Hard Delete) مع تنظيف السجلات المرتبطة وسياسة أمان RLS محكمة للـ Admin.

### محاور الأمان المغلقة:
1. **عزل المفاتيح:** المتصفح يحمل فقط `VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY`. لا وجود لأي مفتاح `service_role` أو `api_key` خاص في الكود المترجم.
2. **استبعاد Git:** `.env` و `.env.local` مستبعدان رسمياً في `.gitignore`.
3. **حماية التخمين (Brute-Force Lockout):** إغلاق نموذج تسجيل الدخول لمدة 60 ثانية بعد 5 محاولات فاشلة مع عداد تنازلي.
4. **حماية ميزانية الذكاء الاصطناعي:** حد أقصى 20 عملية تدقيق رف في الساعة للمشرف، و 100 عملية يومياً للشركة في دالة `analyze-shelf`.
5. **حماية الـ IDOR:** إلزام مطابقة `company_id` و `supervisor_id` في جميع عمليات التحديث والمزامنة الأوفلاين وربط الأجهزة.

---

## 4. الميزات الجوهرية وسلوك النظام (Core System Behaviors)

* **إدارة الجلسات:** انتهاء مهلة الجلسة والخروج التلقائي عند انقطاع النشاط لمدة 15 ساعة متواصلة (`INACTIVITY_TIMEOUT_MS = 15 * 60 * 60 * 1000`).
* **تسجيل الحضور والانصراف:** إظهار نافذة تأكيد تفاعلية (Confirmation Modal) قبل تسجيل الحضور أو الانصراف وتأكيد الـ GPS.
* **البحث عن العملاء:** يظهر في نتائج بحث الزيارة اسم العميل وعنوانه الكامل ونوعه مع أيقونة جغرافية.
* **تدقيق الرفوف (Shelf Review):** شارة تأكيد بصري فوري لالتقاط الصورة مع إشعار Toast ونظام معالجة احتياطي مرن.
* **استيراد البيانات المجمعة (Bulk CSV):** معالجة بالدفعات (Batches of 50) بدلاً من الطلبات الفردية لتسريع الاستيراد 50 ضعفاً ومنع تجميد المتصفح.
* **التحديث الهوائي الفوري للموبايل (Over-The-Air / Live Remote URL):** تم ضبط `capacitor.config.ts` على النطاق الحي المباشر `https://mydan.digityoucan.com` بحيث يتلقى تطبيق الهاتف (APK) على أجهزة المشرفين أي تحديثات فور رفعها على Cloudflare Pages فوراً بدون الحاجة لبناء أو إرسال ملف APK جديد.
* **التعريب واللغات:** دعم كامل للعربية والإنجليزية مع ملف ترجمة متكامل (`src/i18n/en.ts`) يضم كافة مفاتيح الباك أوفيس.

---

## 5. معايير التطوير وضمان الجودة (Quality Guardrails)

* **فحص الـ TypeScript:** تشغيل `npx tsc --noEmit` بعد أي تعديل والتأكد من خلو المشروع تماماً من أي خطأ (0 errors).
* **فحص المكتبات:** `npm audit` خالٍ من الثغرات (0 vulnerabilities).
* **سلامة البناء:** التأكد من نجاح أمر `vite build` (للويب) و `vite build --mode android` (للأندرويد).

---

## 6. المعمارية البرمجية وهيكلة الكود (Feature-Based Modular MVC Architecture 2026)

تم تنظيم وهيكلة المشروع بالكامل وفق معمارية الموديولات الوظيفية المتطورة (Feature-Driven Modular MVC Architecture) لتحقيق أقصى درجات قابلية التوسع والصيانة:

* **العناصر المشتركة (`src/shared/` أو `@shared/*`):**
  * `services/`: عميل Supabase، محرك المزامنة دون اتصال (Offline-Sync)، ومحرك الـ PWA/Push.
  * `components/`: المكونات العامة (الأزرار، الخرائط، البطاقات، نوافذ Modal، التنبيهات Toast).
  * `hooks/`: الخطافات المخصصة المشتركة (`useGeolocation`, `useDebounce`, `useRealtime`, `useToast`).
  * `types/`: نماذج البيانات العامة وواجهات الـ TypeScript.

* **الموديولات الوظيفية المستقلة (`src/modules/` أو `@modules/*`):**
  1. **موديول المصادقة والأمان (`auth`):**
     * **Model/Service:** `services/authService.ts` (إدارة الإغلاق الأمني Brute-force Lockout وتحديث كلمات المرور).
     * **Controller:** `hooks/useLoginController.ts` (إدارة حالة النموذج، العداد التنازلي، التثبيت PWA).
     * **View:** `views/LoginScreen.tsx` و `views/SetPasswordScreen.tsx`.
  2. **موديول لوحة المتابعة (`dashboard`):**
     * `components/AttendanceWidget.tsx` و `components/RecentVisitItem.tsx`.
     * `views/DashboardScreen.tsx`.
  3. **موديول الزيارات وخط السير (`visits`):**
     * `services/visitService.ts` (حساب المسافات الجغرافية Geofencing وحساب أفضل مسار).
     * `views/VisitsScreen.tsx`, `views/NewVisitScreen.tsx`, `views/VisitDetailScreen.tsx`, `views/BeatPlanScreen.tsx`.
  4. **موديول الطلبيات والمبيعات (`orders`):**
     * `services/orderService.ts`, `types/index.ts`.
     * `views/OrdersScreen.tsx`, `views/OrderEntryScreen.tsx`.
  5. **موديول العملاء (`customers`):**
     * `services/customerService.ts` و `views/CustomersScreen.tsx`.
  6. **موديول التدقيق الذكي للرفوف (`shelf-audit`):**
     * `services/shelfAuditService.ts`.
     * `views/ShelfAuditScreen.tsx`, `views/CompetitorScreen.tsx`.
  7. **موديول المسح الميداني (`surveys`):**
     * `views/FieldSurveyScreen.tsx`.
  8. **موديول أكاديمية التدريب (`training`):**
     * `views/TrainingAcademyScreen.tsx`.
  9. **موديول إدارة النظام (`admin`):**
     * إدارة الشركات، المستخدمين، التقارير، والخرائط الحية.

* **ضمان التوافق العكسي الكامل (100% Backward Compatibility):**
  * جميع الملفات القديمة في `src/screens/` تعمل كـ Re-exports نظيفة من `@modules/*` لضمان عدم تعطل أي مسار أو استيراد خارجي.

