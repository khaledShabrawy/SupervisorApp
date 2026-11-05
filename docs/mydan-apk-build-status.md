# نتيجة استخراج APK — 2026-11-05

**تم إنتاج APK فعلي من المصدر المعدّل.** هذه نسخة Debug تجريبية باسم **Mydan Preview**، وليست إصدار التوزيع النهائي.

| البيان | القيمة |
|---|---|
| ملف التسليم المحلي | `/workspace/Mydan-Preview.apk` |
| ناتج Gradle الأصلي | `artifacts/mydan/android/app/build/outputs/apk/debug/app-debug.apk` |
| اسم الحزمة | `com.mydan.supervisor.preview` |
| الإصدار | `Mydan_01-preview`، رقم 1 |
| الحجم | 4,481,608 بايت، حوالي 4.3 MiB |
| SHA-256 | `ec405080b63a7bb58c05456c9a44ecf86fb98f118f542be3651b43dec1f051f1` |
| هوية إصدار Release | `com.mydan.supervisor`؛ لم تتغير |

## التنفيذ والتحقق

وافق المالك صراحة على ترخيص Android SDK في المحادثة قبل تثبيت الحزم. استُخدمت JDK 21.0.13 وGradle 8.11.1 بعد التحقق من SHA-256، مع SDK Platform 35 وBuild-Tools 34.0.0.

- نجح `assembleDebug` من المصدر: 85 مهمة، وبناء Native ناجح.
- تحقق `apksigner` من توقيعي v1 وv2. شهادة Android Debug مخصصة للاختبار؛ لم يُستخدم أو يُستبدل مفتاح Release للمالك.
- نجح `zipalign` وفحص CRC لمكونات ZIP، وفحص Android `lintDebug` وفحص TypeScript.
- أكد `aapt` اسم التطبيق والحزمة ووجود `MainActivity` الصحيحة. الحزمة Preview مستقلة لتُثبَّت بجوار النسخة الحالية.
- أكد فحص Manifest تعطيل النسخ الاحتياطي والاتصالات الصريحة ودعم RTL. النسخة Debug بطبيعتها قابلة للتصحيح وليست نسخة توزيع.
- الأصول الحالية مدمجة داخل APK. لا يوجد تحميل لغلاف تطبيق بعيد، أو APK متداخل، أو ملفات توقيع خاصة، أو Service Worker مضمّن.
- لم تظهر أنماط مفاتيح خدمة/مزود خاصة في أصول الويب التي فُحصت. مفتاح Supabase المضمّن هو مفتاح العميل العام `anon` المستخرج من المصدر المدقّق؛ لم يُطلب أي سر خدمة.
- أصلح الكود المحلي معالجة CORS لمصدر Capacitor المحلي. نجحت حالاته الثلاث وفحص Deno. اختبارات المشروع تشمل 16 ملفًا ناجحًا.

فحص Android Lint انتهى بلا أخطاء مع 18 تحذيرًا غير مانع للبناء تتعلق بإعدادات Manifest/النسخ الاحتياطي والموارد والأيقونات. تفاصيلها في تقرير Gradle؛ النجاح لا يعني غياب كل ملاحظات الجودة.

تتضمن مخرجات `apksigner` تنبيهات معتادة حول مداخل META-INF في توقيع v1، مع نجاح التحقق ووجود حماية v2. لم تُعدّل الحزمة لإخفاء التنبيهات. الفحص السابق ليس تدقيقًا شاملًا لكل بايت من المكتبات.

## حدود التسليم

لم يُشغّل APK على هاتف أو محاكي في هذه البيئة. اختبارات الدخول والموقع والكاميرا والخلفية والمزامنة على جهاز فعلي ما زالت مطلوبة.

مسودات تحديث قاعدة البيانات والخدمات لم تُطبّق على Supabase. بعض الإصلاحات تعتمد على RPCs وسياسات وخدمات هذه المسودات، ولذلك لا يُعتمد APK للاستخدام الميداني الفعلي قبل مراجعة توافق المخطط واعتماد تطبيق التحديثات واختبارها. لم تُقرأ أو تُعدّل بيانات إنتاجية أثناء البناء.

ملفا `/workspace/Mydan-Preview.apk.sha256` و`/workspace/Mydan-Preview-verification.json` يسجلان بصمة التسليم ونتائج الفحص. لم يُنشَر APK على متجر أو موقع، ولم يُرفع الكود إلى GitHub.


## Rebuilt after full frontend/backend review — 2026-11-05

This record supersedes earlier APK sizes and hashes above. Current Preview: 4538281 bytes; SHA-256 `1ffb828eb581896e3f3e3534de6ccbf2e2f3b638a4018ba7eb28878332d839d3`. Native debug assembly/lint, v1/v2 signature, CRC and zipalign passed again. Lint: 0 errors, 18 warnings. Full source-review report: [mydan-full-review-2026-11-05.md](mydan-full-review-2026-11-05.md). Backend changes remain LOCAL ONLY; phone runtime remains NOT VERIFIED.
