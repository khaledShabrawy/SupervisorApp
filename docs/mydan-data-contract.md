# Mydan — عقد البيانات ومراجعة بوابة B

## حدود التحقق

المرجع المحلي هو `scripts/schema.sql`، وليس استخراجًا للمخطط الحي. تمت قراءة SQL فقط؛ لم يتم تشغيله أو تغيير Supabase.
يوجد في هذا الملف 8 جداول، بينما تتحدث الخطة عن 10 أساسية ثم 19/21 بعد الهجرات. ملفات Migration 2 وMigration 3 غير موجودة ضمن المصادر المفحوصة، لذلك لا يمكن اعتمادها أو مراجعة تفاصيلها.

حالات الاعتماد:
- **LOCAL VERIFIED:** الاسم/الحقل/السياسة موجودة في SQL المحلي.
- **LIVE NOT VERIFIED:** وجودها وسياساتها في Supabase لم يُثبت بهذه الدفعة.
- **BLOCKED:** تحتاج مصدر SQL أو قرارًا أو تحققًا مستقلًا قبل التنفيذ.

## العقد المحلي

جميع الصفوف لها مفتاح `id` من نوع UUID و`created_at`.

| الجدول | الحقول المعتمدة محليًا | العلاقات والصلاحيات المحلية | القيود |
|---|---|---|---|
| supervisors | full_name, email, phone, branch, region, role, is_active, auth_user_id | id مفتاح أساسي يشير إلى auth.users.id؛ قراءة الصف إذا auth.uid() = id | phone/branch/region/auth_user_id nullable؛ role افتراضي supervisor دون CHECK للأدوار |
| customers | name, type, address, latitude, longitude, owner_name, owner_phone, gps_lat, gps_lng, competitor_brands, outlet_photo_url, added_by_supervisor_id, phone, is_active | added_by_supervisor_id يشير إلى supervisors؛ SELECT للمستخدم الموثّق | لا يوجد supervisor_id؛ لا توجد سياسة INSERT/UPDATE محلية؛ النوع text دون enum |
| visits | supervisor_id, customer_id, status, latitude, longitude, geo_distance, on_beat, visit_date, notes, perfect_store_score | روابط supervisors/customers؛ ALL حيث supervisor_id = auth.uid() | perfect_store_score أضيف في آخر الملف؛ status text دون CHECK؛ قاعدة 500 متر ليست مثبتة في SQL |
| products | name, category, sku, unit, price, is_active | SELECT للمستخدم الموثّق | price نوع float8 وnullable؛ لا يوجد جدول أسعار بتاريخ سريان ولا image_url |
| orders | visit_id, supervisor_id, customer_id, product_id, quantity, status | روابط visits/supervisors/customers/products؛ ALL لمالك supervisor_id | لا توجد أسعار أو إجماليات بالصف، ولا قيد كمية موجبة أو مفتاح idempotency |
| shelf_audit | visit_id, product_id, is_present, quantity, photo_url, ai_analysis, display_order, audit_summary_ar | روابط visits/products؛ ALL عبر زيارة يملكها المستخدم | لا يوجد status/job_id؛ لا قيد فريد على visit_id/product_id |
| competitor_products | visit_id, brand_name, product_name, quantity, photo_url | رابط visits؛ ALL عبر زيارة يملكها المستخدم | لا يوجد price في العقد المحلي |
| targets | supervisor_id, target_date, visits_target, orders_target | رابط supervisors؛ SELECT للمالك؛ UNIQUE(supervisor_id,target_date) | لا يوجد audit_target |

لا تعني سياسات ALL على الجداول التابعة أن جميع علاقات الصف المدخل محمية من الربط بزيارة أو عميل آخر؛ يلزم مراجعة WITH CHECK والقيود المرجعية لكل عملية.

## المصادقة والربط

- العلاقة المثبتة في SQL المحلي: supervisors.id = auth.users.id. يبني تحميل الملف الأساسي على هذه العلاقة.
- auth_user_id علاقة إضافية nullable وغير فريدة في الملف. لا نعتمدها بدل المفتاح الأساسي ولا نجري backfill تلقائيًا.
- لا يُعتمد ملف المشرف إلا إذا طابق الجلسة وكان is_active=true ودوره admin أو supervisor. الدور المجهول يُمنع ولا يُرفع تلقائيًا.
- لا يوجد جدول أذونات تفصيلية مثبت؛ حماية الدور الحالية لا تعني اكتمال منظومة permissions المطلوبة في المرحلة D.
- تحميل الملف يختار الحقول المطلوبة فقط، ويستخدم maybeSingle على المفتاح الأساسي.
- أي خطأ تحميل/RLS يمنع الشاشات المحمية ويعرض رسالة عربية مع إعادة المحاولة. لا يُستعمل service_role في العميل.

## Schema وRLS: مخاطر لم تُطبّق لها تغييرات

1. آخر فحص خارجي سابق سجل 42P17 على supervisors. السياسة المحلية البسيطة لا تفسر هذا التكرار؛ يلزم تعريف السياسات والدوال الحية، ولا يصح الجزم بسببها من هذا الملف.
2. CREATE POLICY بلا معالجة وجود سياسة سابقة، لذلك الملف ليس قابلًا لإعادة التشغيل بالكامل بأمان.
3. الملف يتضمن بيانات تجريبية. ON CONFLICT DO NOTHING لا يمنع تكرار customers/products التي تولد UUID جديدًا بلا قيد طبيعي فريد؛ ليس ملف migration إنتاج آمنًا.
4. سياسات إنشاء العملاء وإدارة المشرفين والمنتجات/الأهداف ليست مثبتة محليًا؛ وجود API خادمي يستخدم صلاحية خدمة لا يثبت صحة أو اكتمال قواعد الإدارة.
5. لا توجد سياسات Storage أو تعريفات buckets في الملف. shelf-photos وprospects-photos أسماء يستخدمها التطبيق فقط؛ وجودها وخصوصيتها غير مثبتين.
6. إضافة shelf_audit إلى Realtime في آخر الملف تتحقق محليًا من publication والعضوية قبل الإضافة؛ التفعيل الحي غير مثبت.
7. لا توجد تعريفات للـViews الخمسة أو شركات/أذونات/استبيانات/visit_tasks/planograms/notifications. لا نخترعها.
8. لا توجد حدود على status/role أو ضمانات كمية/إجمالي كاملة؛ يجب مراجعتها قبل قبول عمليات الكتابة.

## تحقق حي مطلوب من المالك أو اتصال قراءة معتمد

جمع أسماء الأعمدة وأنواعها وnullability والقيود والفهارس، ثم تعريفات pg_policies والدوال التي تستدعيها سياسات supervisors، وإعدادات Storage وRealtime والـViews.
التحقق يحتاج metadata فقط، لا صفوف العملاء أو صورهم أو أسرارهم. لا يُنفّذ SQL أو إصلاح خارجي تلقائيًا.

## بوابات المراحل التالية

- **B1:** المخطط الحي وملفات M2/M3 ومراجعة RLS ما زالت غير معتمدة.
- **B2:** قرار شركة واحدة أو SaaS يعود للمالك. لم يُفعّل tenant ولم يُختَر نيابة عنه.
- **C:** فحص محلي لصيغة HTTPS ومفتاح Publishable/anon؛ هذا ليس إثبات اتصال أو صحة التوقيع.
- **D:** أُصلحت حالات الفشل والتزامن والحماية الأساسية. الأذونات التفصيلية والاختبار بحساب حي ما زالا غير مكتملين.
- **F/G/H/J:** لا يمكن اعتماد نجاح الحفظ أو AI أو الإدارة أو التحليلات قبل تثبيت عقودها واختبارها بأمان.

## حماية المزامنة المحلية

لا تبدأ المزامنة قبل اعتماد ملف المشرف. تتوقف قبل العمليات التالية إذا تغيرت هوية الجلسة أو فشل اعتمادها.
لا تُحذف الطوابير عند فشل الدخول. عزل الطوابير القديمة لكل مستخدم وidempotency وإعادة المحاولة بعد انقطاع الرد ما زالت تحتاج مراجعة مستقلة؛ RLS هو الحد النهائي، وليس فحص العميل.