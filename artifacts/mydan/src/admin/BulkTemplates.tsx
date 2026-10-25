import { Download, Save } from '@/components/Icons';
import { t } from '@/i18n';
import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useScope } from '@/lib/data';
import { notify } from '@/lib/toast';

/** Allowed customer types — must match the DB CHECK constraint exactly */
const VALID_CUSTOMER_TYPES = ['بقالة', 'سوبر ماركت', 'هايبر ماركت', 'ميني ماركت', 'كافيه', 'مطعم', 'أخرى'] as const;

/** Normalize free-text type values to the exact DB-allowed strings */
function normalizeCustomerType(raw: string): string {
  const v = raw.trim();
  const exact = VALID_CUSTOMER_TYPES.find(t => t === v);
  if (exact) return exact;
  // Handle common one-word spellings (بدون مسافة) that users write
  if (v === 'سوبرماركت' || v === 'سوبرمارکت') return 'سوبر ماركت';
  if (v === 'هايبرماركت' || v === 'هيبرماركت') return 'هايبر ماركت';
  if (v === 'مينيماركت') return 'ميني ماركت';
  if (v === 'كافيهيه' || v === 'كافية') return 'كافيه';
  return 'أخرى';
}

/** CSV template for bulk customer import */
const CUSTOMER_CSV_TEMPLATE = `name,type,customer_type,owner_name,phone,address,latitude,longitude,branch,supervisor_id,is_active
بقالة الأمل,بقالة,retail,أحمد محمد,01012345678,شارع النيل; القاهرة,30.0444,31.2357,القاهرة,,true
سوبرماركت النور,سوبر ماركت,wholesale,محمود علي,01098765432,ميدان التحرير; الجيزة,30.0626,31.2497,الجيزة,,true`;

/** CSV template for products import */
const PRODUCT_CSV_TEMPLATE = `name,category,sku_code,item_code,master_brand,sub_brand,is_active
شوكولاتة كورونا سبريد,حلويات,SKU-COR-01,ITM-101,كورونا,سبريد,true
بسكويت كورونا لوكس,بسكويت,SKU-COR-02,ITM-102,كورونا,لوكس,true`;

/** CSV template for monthly targets import */
const TARGET_CSV_TEMPLATE = `supervisor_id,month,year,visits_target,audit_target,criteria,target_amount
,10,2026,50,25,visits,0
,10,2026,60,30,orders,25000`;

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

async function batchInsert<T extends Record<string, unknown>>(
  table: string,
  items: { data: T; rowNum: number; name?: string }[],
  result: ImportResult,
  batchSize = 50
) {
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const records = chunk.map((c) => c.data);
    const { error } = await (supabase.from(table as any) as any).insert(records);
    if (!error) {
      result.success += chunk.length;
    } else {
      // Fallback row-by-row on this batch to isolate failing rows
      for (const item of chunk) {
        const { error: itemErr } = await (supabase.from(table as any) as any).insert(item.data);
        if (itemErr) {
          result.failed++;
          result.errors.push(
            t('سطر {n}{details}: {err}', {
              n: item.rowNum,
              details: item.name ? ` (${item.name})` : '',
              err: itemErr.message,
            })
          );
        } else {
          result.success++;
        }
      }
    }
  }
}

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
      const validItems: { data: Record<string, unknown>; rowNum: number; name: string }[] = [];

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
          type: normalizeCustomerType(row[typeIdx]?.trim() || 'بقالة'),
          customer_type: row[customerTypeIdx]?.trim() || 'retail',
          owner_name: row[ownerIdx]?.trim() || null,
          phone: row[phoneIdx]?.trim() || null,
          address,
          latitude: row[latIdx] ? parseFloat(row[latIdx]) : null,
          longitude: row[lngIdx] ? parseFloat(row[lngIdx]) : null,
          branch: row[branchIdx]?.trim() || null,
          is_active: row[activeIdx]?.trim() !== 'false',
        };

        validItems.push({ data: customer, rowNum: i + 2, name });
      }

      await batchInsert('customers', validItems, result);
      return result;
    },
    onSuccess: (result) => {
      notify(t('تم استيراد {s} عميل بنجاح. فشل: {f}', { s: result.success, f: result.failed }), result.failed === 0 ? 'success' : 'info');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'customers'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

function useBulkImportProducts() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error(t('ملف CSV فارغ أو لا يحتوي على بيانات.'));

      const headers = rows[0].map(h => h.toLowerCase().trim());
      const nameIdx = headers.indexOf('name');
      const catIdx = headers.indexOf('category');
      const skuIdx = headers.indexOf('sku_code') !== -1 ? headers.indexOf('sku_code') : headers.indexOf('sku');
      const itemCodeIdx = headers.indexOf('item_code');
      const masterIdx = headers.indexOf('master_brand');
      const subIdx = headers.indexOf('sub_brand');
      const activeIdx = headers.indexOf('is_active');

      if (nameIdx === -1) {
        throw new Error(t('الحقول المطلوبة: name'));
      }

      const result: ImportResult = { success: 0, failed: 0, errors: [] };
      const dataRows = rows.slice(1);
      const validItems: { data: Record<string, unknown>; rowNum: number; name: string }[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const name = row[nameIdx]?.trim();
        if (!name) {
          result.failed++;
          result.errors.push(t('سطر {n}: اسم المنتج فارغ', { n: i + 2 }));
          continue;
        }

        const sku = (skuIdx !== -1 ? row[skuIdx]?.trim() : '') || null;
        const itemCode = (itemCodeIdx !== -1 ? row[itemCodeIdx]?.trim() : '') || sku;

        const prod = {
          company_id: sc.companyId,
          name,
          category: (catIdx !== -1 ? row[catIdx]?.trim() : '') || null,
          sku_code: sku,
          item_code: itemCode,
          master_brand: (masterIdx !== -1 ? row[masterIdx]?.trim() : '') || null,
          sub_brand: (subIdx !== -1 ? row[subIdx]?.trim() : '') || null,
          is_active: activeIdx !== -1 ? row[activeIdx]?.trim().toLowerCase() !== 'false' : true,
        };

        validItems.push({ data: prod, rowNum: i + 2, name });
      }

      await batchInsert('products', validItems, result);
      return result;
    },
    onSuccess: (res) => {
      notify(t('تم استيراد {n} منتج بنجاح', { n: res.success }), res.failed ? 'info' : 'success');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'products'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

function useBulkImportTargets() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error(t('ملف CSV فارغ أو لا يحتوي على بيانات.'));

      const headers = rows[0].map(h => h.toLowerCase().trim());
      const supIdx = headers.indexOf('supervisor_id');
      const monthIdx = headers.indexOf('month');
      const yearIdx = headers.indexOf('year');
      const visitsIdx = headers.indexOf('visits_target');
      const auditIdx = headers.indexOf('audit_target');
      const criteriaIdx = headers.indexOf('criteria');
      const amountIdx = headers.indexOf('target_amount');

      if (monthIdx === -1 || yearIdx === -1) {
        throw new Error(t('الحقول المطلوبة: month, year'));
      }

      const result: ImportResult = { success: 0, failed: 0, errors: [] };
      const dataRows = rows.slice(1);
      const validItems: { data: Record<string, unknown>; rowNum: number }[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const month = Number(row[monthIdx]);
        const year = Number(row[yearIdx]);

        if (!month || !year || month < 1 || month > 12) {
          result.failed++;
          result.errors.push(t('سطر {n}: شهر أو سنة غير صالحة', { n: i + 2 }));
          continue;
        }

        const supervisorId = (supIdx !== -1 ? row[supIdx]?.trim() : '') || null;
        const visitsTarget = Number(visitsIdx !== -1 ? row[visitsIdx] : 0) || 0;
        const auditTarget = Number(auditIdx !== -1 ? row[auditIdx] : 0) || 0;
        const targetAmount = Number(amountIdx !== -1 ? row[amountIdx] : 0) || 0;
        const criteria = (criteriaIdx !== -1 ? row[criteriaIdx]?.trim() : '') || 'visits';

        const record = {
          company_id: sc.companyId,
          supervisor_id: supervisorId,
          month,
          year,
          visits_target: visitsTarget,
          audit_target: auditTarget,
          target_amount: targetAmount,
          criteria,
          scope_type: supervisorId ? 'per_user' : 'general',
          target_date: `${year}-${String(month).padStart(2, '0')}-01`,
          actual_visits: 0,
          actual_audits: 0,
        };

        validItems.push({ data: record, rowNum: i + 2 });
      }

      await batchInsert('targets', validItems, result);
      return result;
    },
    onSuccess: (res) => {
      notify(t('تم استيراد {n} هدف بنجاح', { n: res.success }), res.failed ? 'info' : 'success');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'targets'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'dashboard'] });
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

      if (dayIdx === -1 || custIdIdx === -1) {
        throw new Error(t('الحقول المطلوبة: day_of_week, customer_id'));
      }

      const result: ImportResult = { success: 0, failed: 0, errors: [] };
      const dataRows = rows.slice(1);

      const validItems: { data: Record<string, unknown>; rowNum: number }[] = [];
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

        validItems.push({ data: plan, rowNum: i + 2 });
      }

      await batchInsert('beat_plans', validItems, result);
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
  const productFileRef = useRef<HTMLInputElement>(null);
  const targetFileRef = useRef<HTMLInputElement>(null);
  const beatFileRef = useRef<HTMLInputElement>(null);

  const importCustomers = useBulkImportCustomers();
  const importProducts = useBulkImportProducts();
  const importTargets = useBulkImportTargets();
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

  const handleProductUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setErrors([]);
      importProducts.mutate(file, {
        onSuccess: (result) => { if (result.errors.length) setErrors(result.errors); },
      });
    }
    e.target.value = '';
  }, [importProducts]);

  const handleTargetUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setErrors([]);
      importTargets.mutate(file, {
        onSuccess: (result) => { if (result.errors.length) setErrors(result.errors); },
      });
    }
    e.target.value = '';
  }, [importTargets]);

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
      <h2>{t('استيراد جماعي (Bulk Import)')}</h2>

      {/* 1. Customers Import */}
      <div className="card col">
        <div className="title">{t('استيراد العملاء')}</div>
        <div className="muted">{t('قم بتنزيل القالب، املأ بيانات العملاء، ثم ارفعه للاستيراد.')}</div>
        <div className="alert warn" style={{ fontSize: 13 }}>
          <strong>{t('تنسيق الحقول:')}</strong>
          <ul style={{ marginTop: 4, paddingInlineStart: 20 }}>
            <li><code>name</code>: {t('اسم العميل (مطلوب)')}</li>
            <li><code>type</code>: {t('النوع (القيم المسموحة: بقالة | سوبر ماركت | هايبر ماركت | ميني ماركت | كافيه | مطعم | أخرى)')}</li>
            <li><code>customer_type</code>: retail, wholesale</li>
            <li><code>address</code>: {t('العنوان (مطلوب)')}</li>
            <li><code>phone</code>, <code>latitude</code>, <code>longitude</code>, <code>branch</code>, <code>supervisor_id</code>: {t('اختياري')}</li>
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

      {/* 2. Products Import */}
      <div className="card col">
        <div className="title">{t('استيراد المنتجات (الأصناف)')}</div>
        <div className="muted">{t('قم بتنزيل قالب المنتجات، املأ بيانات الأصناف والماركات، ثم ارفعه للاستيراد.')}</div>
        <div className="alert warn" style={{ fontSize: 13 }}>
          <strong>{t('تنسيق الحقول:')}</strong>
          <ul style={{ marginTop: 4, paddingInlineStart: 20 }}>
            <li><code>name</code>: {t('اسم المنتج (مطلوب)')}</li>
            <li><code>item_code</code> / <code>sku_code</code>: {t('كود الصنف (Item Code)')}</li>
            <li><code>master_brand</code>: {t('العلامة الرئيسية (Master Brand)')}</li>
            <li><code>sub_brand</code>: {t('العلامة الفرعية (Sub Brand)')}</li>
            <li><code>category</code>: {t('الفئة')}</li>
            <li><code>is_active</code>: {t('true / false')}</li>
          </ul>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn ghost"
            onClick={() => downloadTemplate('products_template.csv', PRODUCT_CSV_TEMPLATE)}
          >
            <Download size={18} /> {t('تنزيل قالب المنتجات')}
          </button>
          <button
            className="btn"
            onClick={() => productFileRef.current?.click()}
            disabled={importProducts.isPending}
          >
            <Save size={18} /> {importProducts.isPending ? t('جاري الاستيراد...') : t('رفع ملف المنتجات')}
          </button>
          <input
            ref={productFileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleProductUpload}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* 3. Targets Import */}
      <div className="card col">
        <div className="title">{t('استيراد الأهداف الشهرية (Targets)')}</div>
        <div className="muted">{t('قم بتنزيل قالب الأهداف، حدد تارجت الزيارات والمبيعات لكل مشرف أو للفريق، ثم ارفعه.')}</div>
        <div className="alert warn" style={{ fontSize: 13 }}>
          <strong>{t('تنسيق الحقول:')}</strong>
          <ul style={{ marginTop: 4, paddingInlineStart: 20 }}>
            <li><code>month</code>, <code>year</code>: {t('الشهر والسنة (مطلوبان، مثال: 10, 2026)')}</li>
            <li><code>visits_target</code>: {t('عدد الزيارات المستهدفة')}</li>
            <li><code>audit_target</code>: {t('عدد مراجعات الرف')}</li>
            <li><code>criteria</code>: {t('visits, orders, shelf_audit, new_opportunity')}</li>
            <li><code>target_amount</code>: {t('القيمة المالية المستهدفة (للأوردرات)')}</li>
            <li><code>supervisor_id</code>: {t('معرّف المشرف (اختياري، اتركه فارغاً للهدف العام)')}</li>
          </ul>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn ghost"
            onClick={() => downloadTemplate('targets_template.csv', TARGET_CSV_TEMPLATE)}
          >
            <Download size={18} /> {t('تنزيل قالب الأهداف')}
          </button>
          <button
            className="btn"
            onClick={() => targetFileRef.current?.click()}
            disabled={importTargets.isPending}
          >
            <Save size={18} /> {importTargets.isPending ? t('جاري الاستيراد...') : t('رفع ملف الأهداف')}
          </button>
          <input
            ref={targetFileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleTargetUpload}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* 4. Beat Plans Import */}
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
