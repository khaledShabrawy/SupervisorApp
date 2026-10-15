import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def make_rtl(p):
    pPr = p._p.get_or_add_pPr()
    bidi = parse_xml(f'<w:bidi {nsdecls("w")} w:val="1"/>')
    pPr.append(bidi)
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT

def add_styled_heading(doc, text, level):
    h = doc.add_heading(text, level=level)
    make_rtl(h)
    run = h.runs[0] if h.runs else h.add_run(text)
    run.font.name = 'Cairo'
    if level == 1:
        run.font.size = Pt(20)
        run.font.color.rgb = RGBColor(26, 86, 219) # Primary Blue
        run.bold = True
    elif level == 2:
        run.font.size = Pt(16)
        run.font.color.rgb = RGBColor(30, 41, 59)
        run.bold = True
    elif level == 3:
        run.font.size = Pt(13)
        run.font.color.rgb = RGBColor(71, 85, 105)
        run.bold = True
    return h

def add_rtl_paragraph(doc, text="", bold=False, italic=False, color=None, size=Pt(11)):
    p = doc.add_paragraph()
    make_rtl(p)
    if text:
        r = p.add_run(text)
        r.font.name = 'Cairo'
        r.font.size = size
        r.bold = bold
        r.italic = italic
        if color:
            r.font.color.rgb = color
    return p

def add_code_block(doc, code_text):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_background(cell, "F1F5F9")
    set_cell_margins(cell, top=140, bottom=140, left=200, right=200)
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(code_text)
    r.font.name = 'Consolas'
    r.font.size = Pt(9.5)
    r.font.color.rgb = RGBColor(30, 41, 59)
    doc.add_paragraph() # spacer

def generate_guides():
    base_folder = r"c:\Khaled Mahmoud Data\khaled.mahmoud\OneDrive - Corona\Documents\Desktop\03_Projects\Mydan App"
    md_path = os.path.join(base_folder, "Mydan — دليل التثبيت والتشغيل الشامل (Cloud & On-Premise).md")
    docx_path = os.path.join(base_folder, "Mydan — دليل إطلاق العميل الجديد المحدث (Cloud & On-Premise).docx")
    legacy_docx_path = os.path.join(base_folder, "Mydan — دليل إطلاق العميل الجديد.docx")

    print("[1/3] Generating Comprehensive Markdown Guide...")
    md_content = """# 📘 دليل التثبيت والتشغيل الشامل لمنظومة ميدان (Mydan)
## الدليل التشغيلي الموحد للعملاء: السحابي (Cloud) والداخلي (On-Premise)

> **الإصدار:** 2.0 (محدّث ومطابق لأحدث معايير الأمان، الأداء، والمزامنة بدون إنترنت)  
> **تاريخ التحديث:** أكتوبر 2026  
> **طبيعة النظام:** نظام SaaS وإدارة رقابة ميدانية متعدد المستأجرين (Multi-Tenant)، فحص الرفوف بالذكاء الاصطناعي، وتتبع المشرفين على خرائط مجانية مفتوحة المصدر بدون رسوم Google Maps.

---

## 🏗️ 1. النظرة العامة والمعمارية التقنية (Architecture Overview)

تتكون منظومة **Mydan** من ثلاث طبقات متكاملة مصممة للعمل في بيئات الاتصال السريع أو المتقطع:

```
[ المشرف الميداني ]                [ لوحة الإدارة والمدراء ]
Android APK (Capacitor)            Web Admin Portal (React 18 SPA)
       │                                     │
       ▼                                     ▼
[ شريط المزامنة السريع ]            [ بوابة API الآمنة (Kong/Nginx) ]
  ├─ رفع البيانات (Sync Up)                  │
  └─ تحديث البيانات (Sync Down)               │
       │                                     ▼
       └───────────────────────────► [ محرك Supabase الموحد ]
                                      ├─ PostgreSQL 16/17 + PostgREST
                                      ├─ GoTrue Auth & RLS Policies
                                      ├─ Supabase Storage (صور الرفوف)
                                      └─ Edge Functions (AI Vision Analysis)
```

### المكونات الأساسية:
1. **تطبيق الهاتف الميداني (Android APK):** مبني عبر React 18 + TypeScript + Vite ومغلّف عبر Capacitor Native Android Runtime مع دعم مدمج لـ Geolocation، الكاميرا، وذاكرة التخزين المؤقت المحلي (Offline Queue).
2. **لوحة التحكم والإدارة (Web Admin):** واجهة ويب متجاوبة بالكامل لمدراء الفروع والمسؤولين لمتابعة الأوردرات، الزيارات، أداء المشرفين، وتتبع المواقع الحية.
3. **قاعدة البيانات والخدمات الخلفية (Backend & DB):** محرك Supabase (PostgreSQL) مع نظام عزل تام بين الشركات عبر تقنية Row Level Security (RLS) ومفتاح `company_id`.
4. **الخرائط المجانية بدون تكاليف (Map Engine):** محرك Leaflet المتكامل مع OpenStreetMap وشوارع جمهورية مصر العربية والدول العربية — **بدون أي اشتراكات أو تكاليف API شهرية من Google Maps نهائياً**.
5. **محرك الذكاء الاصطناعي لفحص الرفوف (AI Vision Engine):** Edge Function تتكامل مع Google Gemini Flash أو Anthropic Claude Vision لتحليل حصة الرف ونواقص المنتجات آلياً من صور الرفوف.

---

## ☁️ 2. المسار الأول: التثبيت السحابي (Cloud Deployment)

يصلح هذا المسار للعملاء الذين يرغبون في تشغيل سريع دون الحاجة لتحمل أعباء صيانة خوادم داخلية، وينقسم إلى خيارين:

### الخيار (أ): نموذج الـ Multi-Tenant المشترك (Shared Cloud SaaS)
- **الاستضافة:** الواجهة الأمامية مستضافة على **Cloudflare Pages** (الرابط الرئيسي: `https://mydan.digityoucan.com` أو Subdomain مخصص للعميل عبر CNAME).
- **قاعدة البيانات:** خادم Supabase السحابي المشترك عالي الاعتمادية مع عزل البيانات 100% عبر سياسات RLS.
- **خطوات إطلاق العميل:**
  1. تسجيل الدخول بحساب الـ `super_admin` إلى `https://mydan.digityoucan.com/login`.
  2. الانتقال إلى **لوحة الإدارة ← الشركات ← شركة جديدة**.
  3. تسجيل بيانات الشركة (الاسم، الحد الأقصى للمشرفين، نوع الترخيص).
  4. ضبط ألوان وشعار وهوية العميل في **إعدادات الشركة**.
  5. إنشاء حسابات المشرفين وتوزيع ملف الـ APK الموحد.

### الخيار (ب): خادم سحابي خاص بالعميل (Dedicated Cloud VPS)
يصلح للشركات التي ترغب في عزل كامل للبنية التحتية على سحابتها الخاصة (AWS / Hetzner / DigitalOcean / Azure):
- **المواصفات الموصى بها:** خادم افتراضي 4 Cores CPU، 16 GB RAM، 100 GB NVMe Storage بنظام Ubuntu Server 24.04 LTS.
- **التثبيت:** يتم اتباع نفس خطوات التثبيت الداخلي (On-Premise) المشروحة في القسم التالي.

---

## 🏢 3. المسار الثاني: التثبيت الداخلي الكامل (On-Premise Deployment)

يصلح هذا المسار للشركات الكبرى والمؤسسات التي تشترط وجود البيانات حصرياً داخل مركز بياناتها الخاص (Data Center / Private Cloud).

### 3.1 متطلبات العتاد والشبكة (Prerequisites)
- **السيرفر الفيزيائي أو الافتراضي:**
  - **المعالج:** 8 Cores (Intel Xeon أو AMD EPYC أو معادل).
  - **الذاكرة:** 16 GB كحد أدنى (32 GB موصى به لـ 50 مشرف فأكثر).
  - **القرص:** 200 GB NVMe SSD أو Enterprise SSD.
  - **نظام التشغيل:** Ubuntu Server 22.04 LTS أو 24.04 LTS (أو RHEL 9 / Windows Server مع WSL2/Docker).
- **المنافذ وجدار الحماية (Firewall & Ports):**
  - **مفتوح للعموم/الشبكة الداخلية:** `80` (HTTP للتوجيه) و `443` (HTTPS للواجهة والـ API).
  - **مغلق تماماً عن الجمهور الخارجي:** `5432` (PostgreSQL)، `8000` (Kong Gateway الداخلي)، `54321` (Studio)، `9000` (Storage API).

### 3.2 تثبيت Docker و Docker Compose على خادم العميل
```bash
# تحديث الحزم وتثبيت المتطلبات
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw nginx certbot python3-certbot-nginx

# تثبيت Docker Engine الرسمي
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# التحقق من نجاح التثبيت
docker --version
docker compose version
```

### 3.3 تشغيل محرك Supabase On-Premise عبر Docker
قم بإنشاء مجلد البنية التحتية:
```bash
mkdir -p /opt/mydan-stack && cd /opt/mydan-stack
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

قم بضبط كلمات المرور والمفاتيح في ملف `.env`:
```bash
# توليد كلمات سر عشوائية قوية
POSTGRES_PASSWORD=$(openssl rand -base64 24)
JWT_SECRET=$(openssl rand -base64 32)
```
عدّل في `.env`:
- `POSTGRES_PASSWORD` = كلمة السر الجديدة
- `JWT_SECRET` = المفتاح الجديد
- استخرج `ANON_KEY` و `SERVICE_ROLE_KEY` باستخدام `JWT_SECRET`.
- `API_EXTERNAL_URL` = `https://field.clientcompany.com`

تشغيل جميع الخدمات:
```bash
docker compose up -d
docker compose ps
```

### 3.4 بناء وخدمة الواجهة الأمامية (Web Frontend) عبر Nginx
قم بنسخ ملفات البناء (Build Artifacts) المجمعة إلى السيرفر في المسار `/var/www/mydan`:
```bash
# إعداد ملف Nginx الافتراضي
sudo nano /etc/nginx/sites-available/mydan
```

محتوى الإعداد:
```nginx
server {
    listen 80;
    server_name field.clientcompany.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name field.clientcompany.com;

    ssl_certificate /etc/letsencrypt/live/field.clientcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/field.clientcompany.com/privkey.pem;

    # خدمة الواجهة الأمامية Web SPA
    location / {
        root /var/www/mydan;
        index index.html;
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    # توجيه طلبات API والـ Auth و Storage لمحرك Supabase الداخلي
    location /rest/v1/ {
        proxy_pass http://127.0.0.1:8000/rest/v1/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /auth/v1/ {
        proxy_pass http://127.0.0.1:8000/auth/v1/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /storage/v1/ {
        proxy_pass http://127.0.0.1:8000/storage/v1/;
        proxy_set_header Host $host;
        client_max_body_size 25M;
    }
}
```
تفعيل الموقع وتجديد الشهادة:
```bash
sudo ln -s /etc/nginx/sites-available/mydan /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d field.clientcompany.com
```

### 3.5 دعم الخرائط في الشبكات الداخلية المعزولة (Air-Gapped Offline Maps)
في حال كان سيرفر العميل وأجهزة التابلت تعمل داخل شبكة محلية بدون إنترنت خارجي:
- خريطة Leaflet تعمل تلقائياً عبر سحب بلاطات OpenStreetMap إذا توفر إنترنت.
- في الشبكات المغلقة كلياً: يتم تشغيل حاوية `TileServer GL` محلية بملف خريطة مصر (`egypt.mbtiles` بحجم ~300 ميجابايت)، وتوجيه رابط البلاطات في الكود محلياً `http://192.168.1.100:8080/styles/osm-bright/{z}/{x}/{y}.png`.

---

## 🗄️ 4. تهيئة قاعدة البيانات والتعددية المؤسسية (Database Setup)

سواء في السحابة أو On-Premise، يتم تنفيذ سكريبتات SQL بالترتيب التالي عبر Supabase Studio أو `psql`:

1. **السكريبت التأسيسي الأول (`scripts/schema.sql`):**
   - ينشئ الجداول الـ 18 الأساسية: `supervisors`, `customers`, `visits`, `orders`, `order_items`, `products`, `shelf_audits`, `targets`, `surveys`, `notifications`, إلخ.
2. **السكريبت الثاني (`migration2.sql`):**
   - يضيف صلاحيات الشاشات المتقدمة، تتبع المواقع الحية للمشرفين، ونظام مؤشرات الأداء (KPIs).
3. **سكريبت التعددية المؤسسية (`migration3_multitenant.sql`):**
   - يضيف جداول `companies`, `branches`, `app_settings`.
   - يفعّل سياسات العزل الكامل (Row-Level Security - RLS) التي تضمن أن كل عميل يرى بياناته فقط.
4. **تهيئة حاويات التخزين (Storage Buckets):**
   - من لوحة Supabase Storage أنشئ الـ Buckets التالية:
     - `shelf-photos`: صور الرفوف والزيارات (Public أو RLS محمية).
     - `company-assets`: شعارات الشركات وأيقونات المنتجات.

---

## 📱 5. بناء وتوزيع تطبيق الهواتف (Android APK)

### 5.1 توجيه الـ APK لخادم العميل
- **في حال التثبيت السحابي:** استخدم النسخة الموحدة الجاهزة:
  `Mydan-latest.apk` (محفوظة في مجلد المشروع و `Downloads/APK`).
- **في حال التثبيت On-Premise:**
  1. عدّل ملف `artifacts/mydan/.env.android`:
     ```env
     VITE_SUPABASE_URL=https://field.clientcompany.com
     VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5c...
     ```
  2. شغّل سكريبت البناء الآلي:
     ```powershell
     python scripts/package_apk.py
     ```
  3. سيقوم السكريبت بتجميع أحدث ملفات الواجهة، محاذاة الملف بـ `zipalign 4-byte`، وتوقيعه رقمياً بنظامي الحماية v1 و v2، ووضعه في مسار التنزيلات جاهزاً للإرسال.

### 5.2 تثبيت التطبيق وتدريب المشرفين
1. إرسال ملف الـ APK عبر WhatsApp أو رابط داخلي مباشر.
2. تفعيل خيار **"تثبيت من مصادر غير معروفة"** في إعدادات الهاتف.
3. منح التطبيق أذونات **الموقع الجغرافي الدقيق (GPS)** و **الكاميرا**.
4. شرح شريط المزامنة الجديد للمشرف:
   - **زر "تحديث البيانات":** يضغط عليه صباحاً لتحميل أحدث العملاء والخطط والمهام.
   - **زر "رفع البيانات":** في حال العمل بمناطق ضعيفة التغطية، يقوم التطبيق بتخزين الزيارات والأوردرات محلياً، وبمجرد الوصول للشبكة يظهر رقم بالعمليات المعلقة ويضغط المشرف زر الرفع لتنتقل للسيرفر فوراً مع دوران أيقونة المزامنة.

---

## 🤖 6. تفعيل محرك الذكاء الاصطناعي لتحليل الرفوف (AI Vision)

يدعم النظام خيارين مرنين لتحليل صور الرفوف:

1. **الخيار الأول (الأوفر والأسرع): Google Gemini Flash API**
   - يدعم استخراج المنتجات بدقة، فهم اللغة العربية، وحصة مجانية واسعة جداً تناسب آلاف الزيارات شهرياً دون تكلفة تذكر.
2. **الخيار الثاني: Anthropic Claude 3.5 Sonnet Vision**
   - مناسب للتحليلات البصرية فائقة الدقة.
- **طريقة التفعيل:**
  - يتم وضع مفتاح الـ API في `Supabase Secrets`:
    - الاسم: `GEMINI_API_KEY` أو `ANTHROPIC_API_KEY`.
  - الدخول للوحة الإدارة ← **إعدادات الشركة** ← تفعيل خيار **AI Shelf Analysis**.
  - تحديد أسماء "العلامات المستهدفة" و "العلامات المنافسة" لترشيد الذكاء الاصطناعي لحساب نسبة تواجد البضاعة (Share of Shelf).

---

## 🛡️ 7. النسخ الاحتياطي التلقائي وخطة الطوارئ (Backup & Disaster Recovery)

لحماية بيانات العميل On-Premise، يتم إعداد مهمة Cron يومية على الخادم:

```bash
# إنشاء سكريبت النسخ الاحتياطي
sudo nano /usr/local/bin/backup-mydan.sh
```

محتوى السكريبت:
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/mydan"
DATE=$(date +"%Y%m%d_%H%M%S")
mkdir -p $BACKUP_DIR

# تصدير قاعدة البيانات مضغوطة
docker exec -t supabase-db pg_dump -U postgres -d postgres | gzip > "$BACKUP_DIR/mydan_db_$DATE.sql.gz"

# حذف النسخ الاحتياطية الأقدم من 30 يوماً
find $BACKUP_DIR -type f -name "*.sql.gz" -mtime +30 -delete
echo "[Mydan Backup] Backup completed successfully at $DATE"
```
جعله قابلاً للتنفيذ وجدولته:
```bash
sudo chmod +x /usr/local/bin/backup-mydan.sh
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-mydan.sh >> /var/log/mydan-backup.log 2>&1") | crontab -
```

### طريقة الاستعادة عند الطوارئ:
```bash
gunzip -c /var/backups/mydan/mydan_db_YYYYMMDD_HHMMSS.sql.gz | docker exec -i supabase-db psql -U postgres -d postgres
```

---

## ✅ 8. قائمة التحقق النهائية قبل تسليم المشروع للعميل (Handover Checklist)

| # | البند | معيار النجاح | الحالة |
|---|---|---|:---:|
| 1 | **فحص السيرفر والشهادات** | عمل الرابط عبر HTTPS بروتوكول TLS آمن بدون تحذيرات أمنية | ☐ |
| 2 | **إنشاء سجل الشركة** | تسجيل الشركة في `companies` وتفعيل الترخيص وتحديد الفروع | ☐ |
| 3 | **تخصيص الهوية البصرية** | ظهور شعار العميل، اسمه، وألوانه المحددة فور الدخول | ☐ |
| 4 | **اختبار الخرائط المجانية** | فتح شاشة تتبع المشرفين والتأكد من تحميل خريطة الشوارع المصرية بسلاسة | ☐ |
| 5 | **تثبيت APK على الهاتف** | تثبيت التطبيق وتسجيل الدخول بحساب مشرف تجريبي | ☐ |
| 6 | **فحص أذونات GPS والكاميرا** | تسجيل زيارة تجريبية داخل النطاق الجغرافي والتقاط صورة للرف | ☐ |
| 7 | **اختبار المزامنة بدون نت** | تفعيل وضع الطيران، تسجيل حركة، التحقق من ظهورها في زر الرفع، ثم رفعها بعد عودة النت | ☐ |
| 8 | **اختبار تحليل الرف بالـ AI** | تحليل صورة تجريبية للرف والتأكد من قراءة منتجات العميل والمنافسين | ☐ |
| 9 | **صلاحيات الشاشات** | التأكد من أن المشرف لا يمكنه الوصول للوحة الإدارة أو إعدادات الشركة | ☐ |
| 10 | **جدولة النسخ الاحتياطي** | تجربة تشغيل سكريبت النسخ والتأكد من توليد ملف `.sql.gz` سليم | ☐ |
| 11 | **تسليم بيانات الإدارة والدعم** | تسليم حساب المدير الرئيسي ورقم الدعم الفني الفوري للعميل | ☐ |

---
**فريق تطوير وتشغيل منظومة Mydan**
"""

    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)
    print(f"   -> Markdown saved to: {md_path}")

    print("[2/3] Generating Styled Word Document (.docx)...")
    doc = Document()

    # Document Styles
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Cairo'
    normal_style.font.size = Pt(11)

    # Document Title
    p_title = doc.add_paragraph()
    make_rtl(p_title)
    r_title = p_title.add_run("دليل التثبيت والتشغيل الشامل لمنظومة ميدان (Mydan)")
    r_title.font.name = 'Cairo'
    r_title.font.size = Pt(24)
    r_title.font.color.rgb = RGBColor(26, 86, 219)
    r_title.bold = True

    p_sub = doc.add_paragraph()
    make_rtl(p_sub)
    r_sub = p_sub.add_run("الدليل التشغيلي الموحد لتركيب النظام عند أي عميل: سحابي (Cloud) أو داخلي (On-Premise)")
    r_sub.font.name = 'Cairo'
    r_sub.font.size = Pt(13)
    r_sub.font.color.rgb = RGBColor(100, 116, 139)
    r_sub.italic = True

    # Callout Banner
    tbl_b = doc.add_table(rows=1, cols=1)
    tbl_b.alignment = WD_TABLE_ALIGNMENT.CENTER
    c_b = tbl_b.cell(0, 0)
    set_cell_background(c_b, "EFF6FF")
    set_cell_margins(c_b, top=140, bottom=140, left=200, right=200)
    pb = c_b.paragraphs[0]
    make_rtl(pb)
    rb = pb.add_run("ملاحظة هامة: هذا الدليل يغطي بنية 2026 المحدثة، شاملاً الخرائط المجانية بدون Google Maps API، المزامنة الثنائية Offline-First، التعددية المؤسسية RLS، وبناء حزم APK المخصصة لكل عميل.")
    rb.font.name = 'Cairo'
    rb.font.size = Pt(10.5)
    rb.font.color.rgb = RGBColor(30, 64, 175)
    rb.bold = True
    doc.add_paragraph()

    # Section 1
    add_styled_heading(doc, "1. النظرة العامة والمعمارية التقنية للمنظومة", level=1)
    add_rtl_paragraph(doc, "تعتمد منصة Mydan على معمارية حديثة تجمع بين أعلى كفاءة ميدانية بدون اتصال بالإنترنت، وقوة التحليل السحابي والإداري، متضمنة المكونات التالية:")
    
    bullets = [
        ("تطبيق المشرفين (Android APK):", " يعمل على الهواتف والتابلت بنظام Capacitor Native Runtime، ومزود بذاكرة محلية Offline Queue وشريط المزامنة الثنائي السريع."),
        ("لوحة الإدارة (Web Admin):", " واجهة إدارة شاملة لمدراء الفروع ومسؤولي النظام لإدارة الأوردرات، الزيارات، الأهداف، وتتبع المشرفين لحظياً."),
        ("محرك قاعدة البيانات (Supabase Backend):", " يعتمد على PostgreSQL 16/17 مع عزل تام لبيانات الشركات بنسبة 100% عبر تقنية Row Level Security (RLS)."),
        ("محرك الخرائط المصري المجاني (Leaflet & OSM):", " مدمج بالكامل ومعد بشوارع مصر والدول العربية مجاناً وبدون أي حاجة لمفاتيح أو رسوم شهرية من Google Maps."),
        ("محرك فحص الرفوف بالذكاء الاصطناعي (AI Vision):", " يحلل صور البضاعة فورياً عبر Google Gemini Flash أو Anthropic Claude Vision لحساب Share of Shelf ونواقص المنتجات.")
    ]
    for b_title, b_desc in bullets:
        p = doc.add_paragraph()
        make_rtl(p)
        r1 = p.add_run("• " + b_title)
        r1.font.name = 'Cairo'
        r1.bold = True
        r1.font.color.rgb = RGBColor(26, 86, 219)
        r2 = p.add_run(b_desc)
        r2.font.name = 'Cairo'

    # Section 2
    add_styled_heading(doc, "2. المسار الأول: التثبيت السحابي (Cloud Deployment)", level=1)
    add_rtl_paragraph(doc, "يناسب الشركات التي تفضل السرعة في الإطلاق وتوفير تكاليف شراء وصيانة الخوادم الفيزيائية:")
    add_styled_heading(doc, "النموذج أ — السحابة المشتركة (Multi-Tenant SaaS):", level=2)
    add_rtl_paragraph(doc, "تتم استضافة الواجهة على شبكة Cloudflare Pages فائقة السرعة مع ربط الدومين المخصص أو Subdomain للعميل (مثل mydan.client.com)، وتكون قاعدة البيانات على سيرفر Supabase السحابي المشترك مع ضمان عزل البيانات عبر RLS ومفتاح company_id.")
    add_styled_heading(doc, "النموذج ب — الخادم السحابي المخصص (Dedicated Cloud VPS):", level=2)
    add_rtl_paragraph(doc, "يتم حجز سيرفر VPS مستقل للعميل على Hetzner أو AWS أو DigitalOcean، وتنصيب حزمة Supabase المستقلة بالكامل عبر Docker مع Nginx وشهادة SSL مجانية.")

    # Section 3
    add_styled_heading(doc, "3. المسار الثاني: التثبيت الداخلي الكامل (On-Premise Deployment)", level=1)
    add_rtl_paragraph(doc, "هذا المسار مخصص للشركات والمؤسسات التي تشترط الاحتفاظ ببياناتها داخل مركز بياناتها الخاص (Data Center):")
    add_styled_heading(doc, "3.1 مواصفات السيرفر والشبكة المطلوبة:", level=2)
    
    # Table for hardware
    table = doc.add_table(rows=5, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers = ["المكون", "الحد الأدنى", "الموصى به (50+ مشرف)"]
    for i, h in enumerate(headers):
        cell = table.cell(0, i)
        set_cell_background(cell, "1E293B")
        set_cell_margins(cell, top=100, bottom=100, left=150, right=150)
        p = cell.paragraphs[0]
        make_rtl(p)
        r = p.add_run(h)
        r.font.name = 'Cairo'
        r.bold = True
        r.font.color.rgb = RGBColor(255, 255, 255)

    data = [
        ["المعالج (CPU)", "4 Cores (2.4 GHz+)", "8 Cores (Intel Xeon / AMD EPYC)"],
        ["الذاكرة العشوائية (RAM)", "16 GB RAM", "32 GB RAM"],
        ["سعة التخزين (Disk)", "100 GB SSD", "200+ GB NVMe SSD"],
        ["نظام التشغيل (OS)", "Ubuntu 22.04 LTS", "Ubuntu 24.04 LTS (أو RHEL 9)"]
    ]
    for row_idx, row_data in enumerate(data, start=1):
        for col_idx, text in enumerate(row_data):
            cell = table.cell(row_idx, col_idx)
            set_cell_background(cell, "F8FAFC" if row_idx % 2 == 1 else "FFFFFF")
            set_cell_margins(cell, top=80, bottom=80, left=120, right=120)
            p = cell.paragraphs[0]
            make_rtl(p)
            r = p.add_run(text)
            r.font.name = 'Cairo'
            if col_idx == 0:
                r.bold = True
    doc.add_paragraph()

    add_styled_heading(doc, "3.2 خطوات تشغيل الحاويات عبر Docker Compose:", level=2)
    add_rtl_paragraph(doc, "يتم تثبيت Docker وتشغيل حزمة الخدمات الداخلية (PostgreSQL, GoTrue Auth, PostgREST, Storage API, Kong Gateway) بالأوامر التالية:")
    add_code_block(doc, "mkdir -p /opt/mydan-stack && cd /opt/mydan-stack\ngit clone --depth 1 https://github.com/supabase/supabase\ncd supabase/docker\ncp .env.example .env\n# ضبط كلمات المرور ومفاتيح التشفير JWT\ndocker compose up -d\ndocker compose ps")

    add_styled_heading(doc, "3.3 خدمة الخرائط في الشبكات الداخلية المغلقة (Air-Gapped Maps):", level=2)
    add_rtl_paragraph(doc, "يعتمد Mydan على خريطة Leaflet المدمجة. في حال كانت بيئة العميل مفصولة تماماً عن شبكة الإنترنت العالمية، يتم تشغيل حاوية محرك الخرائط المحلي TileServer GL مع ملف خريطة مصر egypt.mbtiles لتوفير خرائط الشوارع محلياً بأعلى سرعة دون استهلاك لأي بيانات إنترنت.")

    # Section 4
    add_styled_heading(doc, "4. تهيئة قاعدة البيانات والجداول التعددية (Database Migrations)", level=1)
    add_rtl_paragraph(doc, "يتم تطبيق ملفات التهيئة بالترتيب التالي داخل SQL Editor في السيرفر:")
    add_rtl_paragraph(doc, "1. scripts/schema.sql: بناء الجداول الأساسية (18 جدولاً تشمل المشرفين، العملاء، الزيارات، الطلبات، الرفوف).")
    add_rtl_paragraph(doc, "2. migration2.sql: تحديثات صلاحيات الشاشات ومؤشرات الأداء (KPIs) ونظام التتبع.")
    add_rtl_paragraph(doc, "3. migration3_multitenant.sql: تفعيل نظام التعددية المؤسسية (Multi-Tenancy) وعزل الشركات التام عبر Row Level Security (RLS).")
    add_rtl_paragraph(doc, "4. إنشاء حاويات التخزين (Storage Buckets): إنشاء مجلدي shelf-photos لحفظ صور الزيارات و company-assets لشعارات العملاء.")

    # Section 5
    add_styled_heading(doc, "5. بناء وتوزيع تطبيق الهواتف (Android APK)", level=1)
    add_rtl_paragraph(doc, "لكل عميل يتم توجيه التطبيق لرابط السيرفر المخصص له:")
    add_rtl_paragraph(doc, "• تعديل ملف artifacts/mydan/.env.android بوضع رابط السيرفر ومفتاح الـ Anon الخاص بالعميل.")
    add_rtl_paragraph(doc, "• تشغيل سكريبت البناء الآلي: python scripts/package_apk.py حيث يقوم السكريبت بتجميع الواجهة، محاذاتها عبر zipalign وتوقيعها رقمياً بشهادات الأمان المعتمدة v1 و v2.")
    add_rtl_paragraph(doc, "• تدريب المشرفين على زري المزامنة السريعة:")
    add_rtl_paragraph(doc, "  - زر 'تحديث البيانات': لجلب أحدث المهام والعملاء صباحاً من السحابة مع مؤشر دوران متحرك.")
    add_rtl_paragraph(doc, "  - زر 'رفع البيانات': يقوم بحفظ الزيارات محلياً في الأماكن عديمة التغطية، مع عدّاد فوري بالعمليات المعلّقة، ورفعها بنقرة واحدة فور توفر الشبكة.")

    # Section 6
    add_styled_heading(doc, "6. تفعيل الذكاء الاصطناعي لفحص الرفوف (AI Vision Engine)", level=1)
    add_rtl_paragraph(doc, "يتميز Mydan بدعم محركين للذكاء الاصطناعي:")
    add_rtl_paragraph(doc, "• محرك Google Gemini Flash API: الحل الأسرع والأوفر تكلفة على الإطلاق مع دعم فائق للغة العربية وحصص مجانية ضخمة تناسب كافة الشركات.")
    add_rtl_paragraph(doc, "• محرك Anthropic Claude Vision: للتحليلات التفصيلية للرفوف.")
    add_rtl_paragraph(doc, "يتم وضع المفتاح السري حصرياً داخل Supabase Secrets، وتفعيل الخاصية من لوحة الإدارة ← إعدادات الشركة.")

    # Section 7
    add_styled_heading(doc, "7. النسخ الاحتياطي التلقائي وخطة الطوارئ (Backup & Disaster Recovery)", level=1)
    add_rtl_paragraph(doc, "في بيئات On-Premise، يتم ضبط سكريبت النسخ اليومي التلقائي مع تدوير 30 يوماً:")
    add_code_block(doc, "# سكريبت النسخ الاحتياطي اليومي\ndocker exec -t supabase-db pg_dump -U postgres -d postgres | gzip > /var/backups/mydan/mydan_$(date +%Y%m%d).sql.gz\n# حذف النسخ الأقدم من شهر\nfind /var/backups/mydan -type f -name '*.sql.gz' -mtime +30 -delete")

    # Section 8
    add_styled_heading(doc, "8. قائمة التحقق النهائية قبل تسليم المشروع (Handover Checklist)", level=1)
    chk_table = doc.add_table(rows=8, cols=3)
    chk_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    chk_headers = ["#", "بند الفحص والتحقق", "الحالة المطلوبة"]
    for i, h in enumerate(chk_headers):
        cell = chk_table.cell(0, i)
        set_cell_background(cell, "1E293B")
        set_cell_margins(cell, top=100, bottom=100, left=150, right=150)
        p = cell.paragraphs[0]
        make_rtl(p)
        r = p.add_run(h)
        r.font.name = 'Cairo'
        r.bold = True
        r.font.color.rgb = RGBColor(255, 255, 255)

    checklist_items = [
        ["1", "فحص اتصال HTTPS والشهادات الأمنية", "يعمل بأمان دون تحذيرات متصفح"],
        ["2", "إنشاء سجل الشركة وتفعيل الاشتراك", "ظهور الشركة نشطة برقم ترخيص صالح"],
        ["3", "تخصيص الهوية والشعار والألوان", "تطبيق الهوية فوراً في الويب والتطبيق"],
        ["4", "اختبار الخريطة المجانية وتتبع المشرفين", "ظهور شوارع مصر وتحديث اللوكيشن بسلاسة"],
        ["5", "تثبيت الـ APK على هاتف وتجربة المزامنة Offline", "تسجيل زيارة ورفعها بنجاح عبر زر الرفع"],
        ["6", "اختبار تدقيق الرف بالذكاء الاصطناعي", "استخراج نسبة المنتجات والمنافسين بنجاح"],
        ["7", "التحقق من سكريبت النسخ الاحتياطي الآلي", "توليد ملف نسخة احتياطية مضغوط سليم"]
    ]
    for row_idx, row_data in enumerate(checklist_items, start=1):
        for col_idx, text in enumerate(row_data):
            cell = chk_table.cell(row_idx, col_idx)
            set_cell_background(cell, "F8FAFC" if row_idx % 2 == 1 else "FFFFFF")
            set_cell_margins(cell, top=80, bottom=80, left=120, right=120)
            p = cell.paragraphs[0]
            make_rtl(p)
            r = p.add_run(text)
            r.font.name = 'Cairo'
            if col_idx == 0:
                r.bold = True

    doc.save(docx_path)
    print(f"   -> Updated Docx saved to: {docx_path}")

    # Also update the legacy docx path with the enhanced version as well
    try:
        doc.save(legacy_docx_path)
        print(f"   -> Legacy Docx refreshed at: {legacy_docx_path}")
    except Exception as e:
        print(f"   Warning: could not overwrite legacy docx (might be open): {e}")

    print("[3/3] All deployment documentation generated successfully!")

if __name__ == "__main__":
    generate_guides()
