import { Download, Save } from '@/components/Icons';
import { t } from '@/i18n';
import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useScope } from '@/lib/data';
import { notify } from '@/lib/toast';

/** CSV template for bulk customer import */
const CUSTOMER_CSV_TEMPLATE = `name,type,customer_type,owner_name,phone,address,latitude,longitude,branch,supervisor_id,is_active
بقالة الأمل,بقالة,retail,أحمد محمد,01012345678,شارع النيل، القاهرة,30.0444,31.2357,القاهرة,,true
سوبرماركت النور,سوبرماركت,wholesale,محمود علي,01098765432,ميدان التحرير، الجيزة,30.0626,31.2497,الجيزة,,true`;

/** CSV template for supervisor beat plans */
const BEAT_PLAN_CSV_TEMPLATE = `supervisor_id,day_of_week,customer_id,sequence
,0,,1
,0,,2
,1,,1`;

function downloadTemplate(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function parseCSV(text: string): string[][] {
  const lines = text.trim().split('\n');
  return lines.map(line => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  });
}

type ImportResult = { success: number; failed: number; errors: string[] };

function useBulkImportCustomers() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error(t('ملف CSV فارغ أو لا يحتوي على بيانات.'));

      const headers = rows[0].map(h => h.toLowerCase().trim());
      const nameIdx = headers.indexOf('name');
      const typeIdx = headers.indexOf('type');
      const customerTypeIdx = headers.indexOf('customer_type');
      const ownerIdx = headers.indexOf('owner_name');
      const phoneIdx = headers.indexOf('phone');
      const addressIdx = headers.indexOf('address');
      const latIdx = headers.indexOf('latitude');
      const lngIdx = headers.indexOf('longitude');
      const branchIdx = headers.indexOf('branch');
      const supIdIdx = headers.indexOf('supervisor_id');
      const activeIdx = headers.indexOf('is_active');

      if (nameIdx === -1 || addressIdx === -1) {
        throw new Error(t('الحقول المطلوبة: name, address'));
      }

      const result: ImportResult = { success: 0, failed: 0, errors: [] };
      const dataRows = rows.slice(1);

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const name = row[nameIdx]?.trim();
        const address = row[addressIdx]?.trim();

        if (!name || !address) {
          result.failed++;
          result.errors.push(t('سطر {n}: اسم أو عنوان فارغ', { n: i + 2 }));
          continue;
        }

        const customer = {
          company_id: sc.companyId,
          supervisor_id: row[supIdIdx]?.trim() || sc.supervisorId,
          name,
          type: row[typeIdx]?.trim() || 'بقالة',
          customer_type: row[customerTypeIdx]?.trim() || 'retail',
          owner_name: row[ownerIdx]?.trim() || null,
          phone: row[phoneIdx]?.trim() || null,
          address,
          latitude: row[latIdx] ? parseFloat(row[latIdx]) : null,
          longitude: row[lngIdx] ? parseFloat(row[lngIdx]) : null,
          branch: row[branchIdx]?.trim() || null,
          is_active: row[activeIdx]?.toLowerCase() !== 'false',
        };

        const { error } = await supabase.from('customers').insert(customer);
        if (error) {
          result.failed++;
          result.errors.push(t('سطر {n}: {err}', { n: i + 2, err: error.message }));
        } else {
          result.success++;
        }
      }

      return result;
    },
    onSuccess: (result) => {
      notify(t('تم استيراد {s} عميل. فشل: {f}', { s: result.success, f: result.failed }), result.failed === 0 ? 'success' : 'info');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'customers'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

function useBulkImportBeatPlans() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error(t('ملف CSV فارغ أو لا يحتوي على بيانات.'));

      const headers = rows[0].map(h => h.toLowerCase().trim());
      const supIdIdx = headers.indexOf('supervisor_id');
      const dayIdx = headers.indexOf('day_of_week');
      const custIdIdx = headers.indexOf('customer_id');

      if (supIdIdx === -1 || dayIdx === -1 || custIdIdx === -1) {
        throw new Error(t('الحقول المطلوبة: supervisor_id, day_of_week, customer_id'));
      }

      const result: ImportResult = { success: 0, failed: 0, errors: [] };
      const dataRows = rows.slice(1);

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const supId = row[supIdIdx]?.trim() || sc.supervisorId;
        const day = parseInt(row[dayIdx]);
        const custId = row[custIdIdx]?.trim();

        if (!custId || isNaN(day) || day < 0 || day > 6) {
          result.failed++;
          result.errors.push(t('سطر {n}: بيانات غير صالحة', { n: i + 2 }));
          continue;
        }

        const plan = {
          company_id: sc.companyId,
          supervisor_id: supId,
          day_of_week: day,
          customer_id: custId,
        };

        const { error } = await supabase.from('beat_plans').insert(plan);
        if (error) {
          result.failed++;
          result.errors.push(t('سطر {n}: {err}', { n: i + 2, err: error.message }));
        } else {
          result.success++;
        }
      }

      return result;
    },
    onSuccess: (result) => {
      notify(t('تم استيراد {s} خطة. فشل: {f}', { s: result.success, f: result.failed }), result.failed === 0 ? 'success' : 'info');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'beat'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

export function BulkTemplates() {
  const customerFileRef = useRef<HTMLInputElement>(null);
  const beatFileRef = useRef<HTMLInputElement>(null);
  const importCustomers = useBulkImportCustomers();
  const importBeats = useBulkImportBeatPlans();
  const [errors, setErrors] = useState<string[]>([]);

  const handleCustomerUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setErrors([]);
      importCustomers.mutate(file, {
        onSuccess: (result) => { if (result.errors.length) setErrors(result.errors); },
      });
    }
    e.target.value = '';
  }, [importCustomers]);

  const handleBeatUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setErrors([]);
      importBeats.mutate(file, {
        onSuccess: (result) => { if (result.errors.length) setErrors(result.errors); },
      });
    }
    e.target.value = '';
  }, [importBeats]);

  return (
    <div className="col" style={{ gap: 16 }}>
      <h2>{t('استيراد جماعي')}</h2>

      <div className="card col">
        <div className="title">{t('استيراد العملاء')}</div>
        <div className="muted">{t('قم بتنزيل القالب، املأ بيانات العملاء، ثم ارفعه للاستيراد.')}</div>
        <div className="alert warn" style={{ fontSize: 13 }}>
          <strong>{t('تنسيق الحقول:')}</strong>
          <ul style={{ marginTop: 4, paddingInlineStart: 20 }}>
            <li><code>name</code>: {t('اسم العميل (مطلوب)')}</li>
            <li><code>type</code>: {t('النوع (بقالة، سوبرماركت، هايبرماركت، كيوسك، محل جملة، ضيافة، أخرى)')}</li>
            <li><code>customer_type</code>: retail, wholesale</li>
            <li><code>address</code>: {t('العنوان (مطلوب)')}</li>
            <li><code>phone</code>, <code>latitude</code>, <code>longitude</code>: {t('اختياري')}</li>
          </ul>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn ghost"
            onClick={() => downloadTemplate('customers_template.csv', CUSTOMER_CSV_TEMPLATE)}
          >
            <Download size={18} /> {t('تنزيل القالب')}
          </button>
          <button
            className="btn"
            onClick={() => customerFileRef.current?.click()}
            disabled={importCustomers.isPending}
          >
            <Save size={18} /> {importCustomers.isPending ? t('جاري الاستيراد...') : t('رفع CSV')}
          </button>
          <input
            ref={customerFileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCustomerUpload}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      <div className="card col">
        <div className="title">{t('استيراد خطة الزيارات')}</div>
        <div className="muted">{t('قم بتنزيل القالب، حدد خطط الزيارات اليومية لكل مشرف.')}</div>
        <div className="alert warn" style={{ fontSize: 13 }}>
          <strong>{t('تنسيق الحقول:')}</strong>
          <ul style={{ marginTop: 4, paddingInlineStart: 20 }}>
            <li><code>supervisor_id</code>: {t('معرّف المشرف (UUID)')}</li>
            <li><code>day_of_week</code>: {t('اليوم (0=أحد، 1=إثنين، ... 6=سبت)')}</li>
            <li><code>customer_id</code>: {t('معرّف العميل (UUID)')}</li>
          </ul>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn ghost"
            onClick={() => downloadTemplate('beat_plan_template.csv', BEAT_PLAN_CSV_TEMPLATE)}
          >
            <Download size={18} /> {t('تنزيل القالب')}
          </button>
          <button
            className="btn"
            onClick={() => beatFileRef.current?.click()}
            disabled={importBeats.isPending}
          >
            <Save size={18} /> {importBeats.isPending ? t('جاري الاستيراد...') : t('رفع CSV')}
          </button>
          <input
            ref={beatFileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleBeatUpload}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {errors.length > 0 && (
        <div className="card col">
          <div className="title">{t('أخطاء الاستيراد ({n})', { n: errors.length })}</div>
          <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 13 }}>
            {errors.map((err, i) => (
              <div key={i} className="alert err" style={{ marginBottom: 4 }}>
                {err}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card col">
        <div className="title">{t('ملاحظات هامة')}</div>
        <ul className="muted" style={{ fontSize: 14, paddingInlineStart: 20, margin: 0 }}>
          <li>{t('تأكد من استخدام ترميز UTF-8 عند حفظ ملف CSV لضمان ظهور الحروف العربية بشكل صحيح.')}</li>
          <li>{t('يمكنك استخدام Excel أو Google Sheets لتحرير الملف، ثم حفظه بصيغة CSV.')}</li>
          <li>{t('لا تقم بتعديل رؤوس الأعمدة (السطر الأول).')}</li>
          <li>{t('للحصول على معرفات UUID للمشرفين والعملاء، راجع جداول المستخدمين والعملاء في لوحة الإدارة.')}</li>
          <li>{t('سيتم تخطي الصفوف غير الصحيحة وإظهار تقرير بالأخطاء بعد الاستيراد.')}</li>
        </ul>
      </div>
    </div>
  );
}
