import { Download, Save } from '@/components/Icons';
import { t } from '@/i18n';
import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useScope } from '@/lib/data';
import { notify } from '@/lib/toast';

/** Normalize free-text customer type values gracefully while preserving custom user types */
function normalizeCustomerType(raw?: string | null): string {
  if (!raw || !raw.trim()) return 'بقالة';
  const v = raw.trim();
  // Map common synonyms to standard system categories
  if (v === 'سوبرماركت' || v === 'سوبرمارکت' || v === 'سوبر ماركت' || v === 'سوبر' || v === 'supermarket') return 'سوبرماركت';
  if (v === 'هايبرماركت' || v === 'هيبرماركت' || v === 'هايبر ماركت' || v === 'هايبر' || v === 'hypermarket') return 'هايبرماركت';
  if (v === 'بقال' || v === 'بقاله' || v === 'بقالة' || v === 'grocery') return 'بقالة';
  if (v === 'كشك' || v === 'كيوسك' || v === 'كشك سجائر' || v === 'kiosk') return 'كيوسك';
  if (v === 'جملة' || v === 'محل جملة' || v === 'نصف جملة' || v === 'تاجر جملة' || v === 'wholesale') return 'محل جملة';
  if (v === 'منظفات' || v === 'ورقيات' || v === 'منظفات وورقيات' || v === 'detergents') return 'منظفات';
  if (v === 'صيدلية' || v === 'صيدليات' || v === 'صيدليه' || v === 'pharmacy') return 'صيدليات';
  if (v === 'كافيه' || v === 'مقهى' || v === 'كافتيريا' || v === 'كافيهات' || v === 'cafe') return 'كافيه';
  if (v === 'مطعم' || v === 'مطاعم' || v === 'restaurant') return 'مطعم';
  if (v === 'ميني ماركت' || v === 'مينيماركت') return 'ميني ماركت';
  if (v === 'تجزئة' || v === 'قطاعي' || v === 'retail') return 'تجزئة';
  if (v === 'ضيافة' || v === 'فندق' || v === 'مطاعم وفنادق') return 'ضيافة';
  // PRESERVE the user's actual business type if not empty! NEVER force it to 'أخرى'!
  return v;
}

/** Normalize monthly targets criteria to the exact DB values */
function normalizeCriteria(raw?: string | null): string {
  if (!raw) return 'visits';
  const v = raw.trim().toLowerCase();
  if (['visits', 'زيارات', 'زيارة'].includes(v)) return 'visits';
  if (['orders', 'طلبيات', 'أوردرات', 'اوردرات', 'مبيعات'].includes(v)) return 'orders';
  if (['shelf_audit', 'تدقيق رف', 'رفوف', 'مراجعة الرف'].includes(v)) return 'shelf_audit';
  if (['new_opportunity', 'عملاء جدد', 'فرص جديدة'].includes(v)) return 'new_opportunity';
  return 'visits';
}

/** Converts Arabic day names or numbers to weekday index 0-6 (0=Sun) */
function parseDayOfWeek(val?: string | null): number {
  if (!val) return 0;
  const clean = normalizeDigits(val.trim().toLowerCase());
  const num = parseInt(clean);
  if (!isNaN(num) && num >= 0 && num <= 6) return num;
  if (clean.includes('أحد') || clean.includes('احد') || clean.includes('sun')) return 0;
  if (clean.includes('إثنين') || clean.includes('اثنين') || clean.includes('mon')) return 1;
  if (clean.includes('ثلاثاء') || clean.includes('tue')) return 2;
  if (clean.includes('أربعاء') || clean.includes('اربعاء') || clean.includes('wed')) return 3;
  if (clean.includes('خميس') || clean.includes('thu')) return 4;
  if (clean.includes('جمعة') || clean.includes('جمعه') || clean.includes('fri')) return 5;
  if (clean.includes('سبت') || clean.includes('sat')) return 6;
  return 0;
}

/** Computes the target YYYY-MM-DD date for a given weekday in the current week */
function getPlanDateFromDay(day: number): string {
  const now = new Date();
  const curDow = now.getDay();
  const diff = (day - curDow + 7) % 7;
  const target = new Date(now);
  target.setDate(now.getDate() + (diff === 0 ? 0 : diff));
  return target.toISOString().slice(0, 10);
}

/** CSV template for bulk customer import */
const CUSTOMER_CSV_TEMPLATE = `customer_code,name,type,owner_name,phone,address,latitude,longitude,branch,supervisor_id,is_active
CUST-001,بقالة الأمل,بقالة,أحمد محمد,01012345678,شارع النيل; المعادي; القاهرة,29.9600,31.2500,القاهرة,,true
CUST-002,سوبرماركت النور,سوبر ماركت,محمود علي,01098765432,ميدان التحرير; الدقي; الجيزة,30.0444,31.2357,الجيزة,,true`;

/** CSV template for products import */
const PRODUCT_CSV_TEMPLATE = `name,category,sku_code,item_code,master_brand,sub_brand,price,unit,is_active
شوكولاتة كورونا سبريد,حلويات,SKU-COR-01,ITM-101,كورونا,سبريد,45,قطعة,true
بسكويت كورونا لوكس,بسكويت,SKU-COR-02,ITM-102,كورونا,لوكس,15,علبة,true`;

/** CSV template for monthly targets import */
const TARGET_CSV_TEMPLATE = `supervisor_code,month,year,visits_target,audit_target,criteria,target_amount
SUP-001,11,2026,50,25,visits,0
SUP-002,11,2026,60,30,orders,25000`;

/** CSV template for supervisor beat plans */
const BEAT_PLAN_CSV_TEMPLATE = `supervisor_code,day_of_week,plan_date,customer_code
SUP-001,0,2026-11-01,CUST-001
SUP-001,1,2026-11-02,CUST-002`;

/**
 * Reads uploaded file content with automatic encoding detection.
 * Handles UTF-8 (with or without BOM), UTF-16 LE/BE, and Windows-1256 (Arabic Windows ANSI from Excel).
 */
async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Check for UTF-16 LE BOM (0xFF, 0xFE)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  // Check for UTF-16 BE BOM (0xFE, 0xFF)
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }

  // Try decoding as strict UTF-8
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return utf8Decoder.decode(bytes);
  } catch {
    // If strict UTF-8 fails (e.g. Arabic ANSI / Windows-1256 from Excel on Arabic Windows)
    try {
      const win1256Decoder = new TextDecoder('windows-1256');
      return win1256Decoder.decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}

/** Detects if the file was corrupted by Excel saving Arabic text as ANSI/ASCII question marks (???) */
function checkQuestionMarkCorruption(rows: string[][]): boolean {
  let clusters = 0;
  for (const row of rows) {
    for (const cell of row) {
      if (/\?{2,}/.test(cell) || /\?\s+\?/.test(cell)) {
        clusters++;
        if (clusters >= 2) return true;
      }
    }
  }
  return false;
}

function downloadTemplate(filename: string, content: string) {
  // Add UTF-8 BOM so Excel on Windows opens Arabic text properly without gibberish
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Parses CSV text with automatic delimiter detection (comma, semicolon, tab) and BOM stripping */
function parseCSV(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];

  const firstLine = cleaned.split(/\r?\n/)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ',';
  if (semiCount > commaCount && semiCount > tabCount) {
    delimiter = ';';
  } else if (tabCount > commaCount && tabCount > semiCount) {
    delimiter = '\t';
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let insideQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const nextChar = cleaned[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentVal.trim());
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }

  if (currentVal.length > 0 || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/** Helper to match column headers flexibly in both Arabic and English */
function findColumnIndex(headers: string[], synonyms: string[]): number {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_\-–—]/g, '');
  const targetNorms = synonyms.map(norm);
  return headers.findIndex((h) => targetNorms.includes(norm(h)));
}

/** Converts Eastern Arabic numerals (٠-٩) to Western (0-9) */
function normalizeDigits(str: string): string {
  return str
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 1776));
}

/** Validates and parses GPS coordinates cleanly */
function parseCoordinate(val?: string | null): number | null {
  if (!val) return null;
  const clean = normalizeDigits(val.trim()).replace(/[^\d.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) || !isFinite(num) ? null : num;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cleanUUID(val?: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  return UUID_REGEX.test(trimmed) ? trimmed : null;
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
              err: itemErr.message || 'خطأ غير معروف',
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
      const text = await readFileText(file);
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error(t('ملف CSV فارغ أو لا يحتوي على بيانات.'));

      if (checkQuestionMarkCorruption(rows)) {
        throw new Error(t('الملف يحتوي على حروف تالفة (علامات استفهام ???). يرجى حفظ الملف من Excel بصيغة: CSV UTF-8 (Comma delimited) لضمان حفظ اللغة العربية بشكل سليم.'));
      }

      const headers = rows[0];
      const nameIdx = findColumnIndex(headers, [
        'name', 'اسم', 'اسم العميل', 'الاسم', 'اسم المحل', 'اسم المنشأة', 'العميل', 'customer_name', 'customer', 'customer name'
      ]);
      const codeIdx = findColumnIndex(headers, [
        'customer_code', 'code', 'كود', 'كود العميل', 'الكود', 'رقم العميل', 'معرف العميل', 'customercode', 'cust_code'
      ]);
      const typeIdx = findColumnIndex(headers, [
        'type', 'النوع', 'نوع العميل', 'نوع المحل', 'تصنيف', 'تصنيف العميل', 'النشاط', 'customer_type'
      ]);
      const ownerIdx = findColumnIndex(headers, [
        'owner_name', 'owner', 'مالك', 'اسم المالك', 'المسؤول', 'صاحب المحل', 'صاحب المنشأة', 'المدير', 'اسم المسؤول'
      ]);
      const phoneIdx = findColumnIndex(headers, [
        'phone', 'mobile', 'tel', 'تليفون', 'هاتف', 'موبايل', 'رقم الهاتف', 'رقم التليفون', 'المحمول'
      ]);
      const addressIdx = findColumnIndex(headers, [
        'address', 'عنوان', 'العنوان', 'عنوان العميل', 'الموقع', 'مقر'
      ]);
      const latIdx = findColumnIndex(headers, [
        'latitude', 'lat', 'خط العرض', 'دائرة العرض', 'خط_العرض', 'احداثي العرض', 'احداثي_عرض', 'y'
      ]);
      const lngIdx = findColumnIndex(headers, [
        'longitude', 'lng', 'lon', 'long', 'خط الطول', 'خط_الطول', 'احداثي الطول', 'احداثي_طول', 'x'
      ]);
      const branchIdx = findColumnIndex(headers, [
        'branch', 'فرع', 'الفرع', 'المنطقة', 'المحافظة', 'branch_name'
      ]);
      const supIdIdx = findColumnIndex(headers, [
        'supervisor_id', 'supervisor', 'مشرف', 'المشرف', 'معرف المشرف', 'كود المشرف'
      ]);
      const activeIdx = findColumnIndex(headers, [
        'is_active', 'active', 'نشط', 'الحالة', 'مفعل', 'status'
      ]);

      if (nameIdx === -1) {
        throw new Error(t('الحقول المطلوبة: name, address'));
      }

      // Fetch existing customer codes for upsert
      const { data: existingCusts } = await supabase
        .from('customers')
        .select('id,customer_code')
        .eq('company_id', sc.companyId)
        .limit(5000);

      const existingCustMap = new Map<string, string>();
      if (existingCusts) {
        for (const c of existingCusts as { id: string; customer_code?: string | null }[]) {
          if (c.customer_code) existingCustMap.set(c.customer_code.toLowerCase().trim(), c.id);
        }
      }

      const result: ImportResult = { success: 0, failed: 0, errors: [] };
      const dataRows = rows.slice(1);
      const validItems: { data: Record<string, unknown>; rowNum: number; name: string }[] = [];
      const updateItems: { id: string; data: Record<string, unknown>; rowNum: number; name: string }[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const name = row[nameIdx]?.trim();
        const rawAddress = addressIdx !== -1 ? row[addressIdx]?.trim() : '';
        const address = rawAddress || 'غير محدد';

        if (!name) {
          result.failed++;
          result.errors.push(t('سطر {n}: اسم أو عنوان فارغ', { n: i + 2 }));
          continue;
        }

        const lat = parseCoordinate(latIdx !== -1 ? row[latIdx] : null);
        const lng = parseCoordinate(lngIdx !== -1 ? row[lngIdx] : null);
        const hasValidCoords = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

        const rawSup = supIdIdx !== -1 ? row[supIdIdx]?.trim() : '';
        const supervisorId = cleanUUID(rawSup) || null;

        const rawActive = activeIdx !== -1 ? row[activeIdx]?.trim().toLowerCase() : '';
        const isActive = !['false', '0', 'no', 'لا', 'معطل', 'غير نشط'].includes(rawActive);

        const cCode = (codeIdx !== -1 ? row[codeIdx]?.trim() : '') || null;
        const customer = {
          company_id: sc.companyId,
          supervisor_id: supervisorId,
          customer_code: cCode,
          name,
          type: normalizeCustomerType(typeIdx !== -1 ? row[typeIdx] : null),
          owner_name: (ownerIdx !== -1 ? row[ownerIdx]?.trim() : '') || null,
          phone: (phoneIdx !== -1 ? normalizeDigits(row[phoneIdx]?.trim() || '') : '') || null,
          address,
          latitude: hasValidCoords ? lat : null,
          longitude: hasValidCoords ? lng : null,
          branch: (branchIdx !== -1 ? row[branchIdx]?.trim() : '') || null,
          is_active: isActive,
        };

        const existingId = cCode ? existingCustMap.get(cCode.toLowerCase().trim()) : null;
        if (existingId) {
          updateItems.push({ id: existingId, data: customer, rowNum: i + 2, name });
        } else {
          validItems.push({ data: customer, rowNum: i + 2, name });
        }
      }

      for (const item of updateItems) {
        const { error: updErr } = await (supabase.from('customers') as any).update(item.data).eq('id', item.id);
        if (updErr) {
          result.failed++;
          result.errors.push(
            t('سطر {n}{details}: {err}', {
              n: item.rowNum,
              details: item.name ? ` (${item.name})` : '',
              err: updErr.message || 'خطأ غير معروف',
            })
          );
        } else {
          result.success++;
        }
      }

      if (validItems.length > 0) {
        await batchInsert('customers', validItems, result);
      }
      return result;
    },
    onSuccess: (result) => {
      if (result.failed === 0) {
        notify(t('تم استيراد {s} عميل بنجاح. فشل: {f}', { s: result.success, f: result.failed }), 'success');
      } else {
        notify(t('تم استيراد {s} عميل بنجاح. فشل: {f}', { s: result.success, f: result.failed }), 'error');
      }
      void qc.invalidateQueries({ queryKey: [...sc.base, 'admin-customers'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'customers'] });
      void qc.invalidateQueries({ queryKey: ['admin-customers'] });
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

function useBulkImportProducts() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const text = await readFileText(file);
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error(t('ملف CSV فارغ أو لا يحتوي على بيانات.'));

      if (checkQuestionMarkCorruption(rows)) {
        throw new Error(t('الملف يحتوي على حروف تالفة (علامات استفهام ???). يرجى حفظ الملف من Excel بصيغة: CSV UTF-8 (Comma delimited) لضمان حفظ اللغة العربية بشكل سليم.'));
      }

      const headers = rows[0];
      const nameIdx = findColumnIndex(headers, ['name', 'اسم', 'اسم المنتج', 'اسم الصنف', 'المنتج', 'الصنف', 'product_name']);
      const catIdx = findColumnIndex(headers, ['category', 'فئة', 'الفئة', 'التصنيف', 'القسم']);
      const skuIdx = findColumnIndex(headers, ['sku_code', 'sku', 'كود الصنف', 'كود sku', 'باركود', 'barcode']);
      const itemCodeIdx = findColumnIndex(headers, ['item_code', 'item code', 'كود الصنف', 'كود', 'رقم الصنف']);
      const masterIdx = findColumnIndex(headers, ['master_brand', 'master brand', 'العلامة الرئيسية', 'البراند', 'الماركة', 'brand']);
      const subIdx = findColumnIndex(headers, ['sub_brand', 'sub brand', 'العلامة الفرعية']);
      const priceIdx = findColumnIndex(headers, ['price', 'سعر', 'السعر', 'سعر البيع', 'سعر القطعة']);
      const unitIdx = findColumnIndex(headers, ['unit', 'وحدة', 'الوحدة']);
      const activeIdx = findColumnIndex(headers, ['is_active', 'active', 'نشط', 'الحالة']);

      if (nameIdx === -1) {
        throw new Error(t('الحقول المطلوبة: name'));
      }

      // Fetch existing products for upsert by item_code or sku_code
      const { data: existingProds } = await supabase
        .from('products')
        .select('id, item_code, sku_code')
        .eq('company_id', sc.companyId)
        .limit(5000);

      const existingProdMap = new Map<string, string>();
      if (existingProds) {
        for (const p of existingProds as { id: string; item_code?: string | null; sku_code?: string | null }[]) {
          if (p.item_code) existingProdMap.set(p.item_code.toLowerCase().trim(), p.id);
          if (p.sku_code) existingProdMap.set(p.sku_code.toLowerCase().trim(), p.id);
        }
      }

      const result: ImportResult = { success: 0, failed: 0, errors: [] };
      const dataRows = rows.slice(1);
      const validItems: { data: Record<string, unknown>; rowNum: number; name: string }[] = [];
      const updateItems: { id: string; data: Record<string, unknown>; rowNum: number; name: string }[] = [];

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
        const rawPrice = priceIdx !== -1 ? normalizeDigits(row[priceIdx] || '') : '';
        const price = rawPrice ? parseFloat(rawPrice) : 0;

        const prod = {
          company_id: sc.companyId,
          name,
          category: (catIdx !== -1 ? row[catIdx]?.trim() : '') || null,
          sku_code: sku,
          item_code: itemCode,
          master_brand: (masterIdx !== -1 ? row[masterIdx]?.trim() : '') || null,
          sub_brand: (subIdx !== -1 ? row[subIdx]?.trim() : '') || null,
          unit: (unitIdx !== -1 ? row[unitIdx]?.trim() : '') || 'قطعة',
          price: isNaN(price) ? 0 : price,
          is_active: activeIdx !== -1 ? row[activeIdx]?.trim().toLowerCase() !== 'false' : true,
        };

        const key = (itemCode || sku || '').toLowerCase().trim();
        const existingId = key ? existingProdMap.get(key) : null;
        if (existingId) {
          updateItems.push({ id: existingId, data: prod, rowNum: i + 2, name });
        } else {
          validItems.push({ data: prod, rowNum: i + 2, name });
        }
      }

      for (const item of updateItems) {
        const { error: updErr } = await (supabase.from('products') as any).update(item.data).eq('id', item.id);
        if (updErr) {
          result.failed++;
          result.errors.push(
            t('سطر {n}{details}: {err}', {
              n: item.rowNum,
              details: item.name ? ` (${item.name})` : '',
              err: updErr.message || 'خطأ غير معروف',
            })
          );
        } else {
          result.success++;
        }
      }

      if (validItems.length > 0) {
        await batchInsert('products', validItems, result);
      }
      return result;
    },
    onSuccess: (res) => {
      notify(t('تم استيراد {n} منتج بنجاح', { n: res.success }), res.failed ? 'error' : 'success');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'products'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

function useBulkImportTargets() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const text = await readFileText(file);
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error(t('ملف CSV فارغ أو لا يحتوي على بيانات.'));

      if (checkQuestionMarkCorruption(rows)) {
        throw new Error(t('الملف يحتوي على حروف تالفة (علامات استفهام ???). يرجى حفظ الملف من Excel بصيغة: CSV UTF-8 (Comma delimited) لضمان حفظ اللغة العربية بشكل سليم.'));
      }

      // Fetch all supervisors to resolve code, phone, full name, or email to UUID
      const { data: supLookup } = await supabase
        .from('supervisors')
        .select('id, full_name, phone, supervisor_code')
        .eq('company_id', sc.companyId)
        .limit(1000);

      const supCodeMap = new Map<string, string>();
      if (supLookup) {
        for (const s of supLookup as any[]) {
          if (s.id) supCodeMap.set(s.id.toLowerCase().trim(), s.id);
          if (s.supervisor_code) supCodeMap.set(s.supervisor_code.toLowerCase().trim(), s.id);
          if (s.phone) supCodeMap.set(normalizeDigits(s.phone).trim(), s.id);
          if (s.full_name) supCodeMap.set(s.full_name.toLowerCase().trim(), s.id);
        }
      }

      const headers = rows[0];
      const supIdx = findColumnIndex(headers, ['supervisor_code', 'supervisor_id', 'supervisor', 'كود المشرف', 'كود_المشرف', 'مشرف', 'المشرف', 'معرف المشرف', 'اسم المشرف']);
      const monthIdx = findColumnIndex(headers, ['month', 'شهر', 'الشهر']);
      const yearIdx = findColumnIndex(headers, ['year', 'سنة', 'السنة', 'عام']);
      const visitsIdx = findColumnIndex(headers, ['visits_target', 'visits', 'زيارات', 'هدف الزيارات']);
      const auditIdx = findColumnIndex(headers, ['audit_target', 'audits', 'مراجعات', 'هدف المراجعات']);
      const criteriaIdx = findColumnIndex(headers, ['criteria', 'المعيار', 'النوع']);
      const amountIdx = findColumnIndex(headers, ['target_amount', 'amount', 'المبلغ', 'القيمة']);

      if (monthIdx === -1 || yearIdx === -1) {
        throw new Error(t('الحقول المطلوبة: month, year'));
      }

      const result: ImportResult = { success: 0, failed: 0, errors: [] };
      const dataRows = rows.slice(1);
      const validItems: { data: Record<string, unknown>; rowNum: number }[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const month = Number(normalizeDigits(row[monthIdx] || ''));
        const year = Number(normalizeDigits(row[yearIdx] || ''));

        if (!month || !year || month < 1 || month > 12) {
          result.failed++;
          result.errors.push(t('سطر {n}: شهر أو سنة غير صالحة', { n: i + 2 }));
          continue;
        }

        const rawSup = supIdx !== -1 ? row[supIdx]?.trim() : '';
        const supervisorId = (rawSup ? supCodeMap.get(rawSup.toLowerCase()) || cleanUUID(rawSup) : null) || null;
        const visitsTarget = Number(visitsIdx !== -1 ? normalizeDigits(row[visitsIdx] || '') : 0) || 0;
        const auditTarget = Number(auditIdx !== -1 ? normalizeDigits(row[auditIdx] || '') : 0) || 0;
        const targetAmount = Number(amountIdx !== -1 ? normalizeDigits(row[amountIdx] || '') : 0) || 0;
        const criteria = normalizeCriteria(criteriaIdx !== -1 ? row[criteriaIdx] : null);

        const record = {
          company_id: sc.companyId,
          supervisor_id: supervisorId,
          visits_target: visitsTarget,
          audit_target: auditTarget,
          target_amount: targetAmount,
          criteria,
          scope_type: supervisorId ? 'per_user' : 'general',
          target_date: `${year}-${String(month).padStart(2, '0')}-01`,
          actual_visits: 0,
          actual_audits: 0,
          // NOTE: month and year are GENERATED ALWAYS AS (EXTRACT from target_date)
          // DO NOT send month or year in INSERT.
        };

        validItems.push({ data: record, rowNum: i + 2 });
      }

      await batchInsert('targets', validItems, result);
      return result;
    },
    onSuccess: (res) => {
      notify(t('تم استيراد {n} هدف بنجاح', { n: res.success }), res.failed ? 'error' : 'success');
      void qc.invalidateQueries({ queryKey: [...sc.base, 'targets'] });
      void qc.invalidateQueries({ queryKey: [...sc.base, 'dashboard'] });
      void qc.invalidateQueries({ queryKey: ['targets'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}

function useBulkImportBeatPlans() {
  const sc = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const text = await readFileText(file);
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error(t('ملف CSV فارغ أو لا يحتوي على بيانات.'));

      if (checkQuestionMarkCorruption(rows)) {
        throw new Error(t('الملف يحتوي على حروف تالفة (علامات استفهام ???). يرجى حفظ الملف من Excel بصيغة: CSV UTF-8 (Comma delimited) لضمان حفظ اللغة العربية بشكل سليم.'));
      }

      // Fetch all supervisors to resolve code, phone, full name, or email to UUID
      const { data: supLookup } = await supabase
        .from('supervisors')
        .select('id, full_name, phone, supervisor_code')
        .eq('company_id', sc.companyId)
        .limit(1000);

      const supCodeMap = new Map<string, string>();
      if (supLookup) {
        for (const s of supLookup as any[]) {
          if (s.id) supCodeMap.set(s.id.toLowerCase().trim(), s.id);
          if (s.supervisor_code) supCodeMap.set(s.supervisor_code.toLowerCase().trim(), s.id);
          if (s.phone) supCodeMap.set(normalizeDigits(s.phone).trim(), s.id);
          if (s.full_name) supCodeMap.set(s.full_name.toLowerCase().trim(), s.id);
        }
      }

      const headers = rows[0];
      const supIdIdx = findColumnIndex(headers, ['supervisor_code', 'supervisor_id', 'supervisor', 'كود المشرف', 'كود_المشرف', 'مشرف', 'المشرف', 'معرف المشرف', 'اسم المشرف']);
      const dayIdx = findColumnIndex(headers, ['day_of_week', 'day', 'اليوم', 'يوم', 'يوم_الاسبوع']);
      const dateIdx = findColumnIndex(headers, ['plan_date', 'date', 'التاريخ', 'تاريخ_الزيارة']);
      const custIdIdx = findColumnIndex(headers, ['customer_id', 'customer', 'عميل', 'العميل', 'كود العميل', 'customer_code', 'code']);

      if (custIdIdx === -1) {
        throw new Error(t('الحقول المطلوبة: day_of_week, customer_id'));
      }

      // Fetch customer codes map to resolve customer codes to UUIDs automatically
      const { data: custLookup } = await supabase
        .from('customers')
        .select('id,customer_code')
        .eq('company_id', sc.companyId)
        .limit(5000);

      const codeMap = new Map<string, string>();
      if (custLookup) {
        for (const c of custLookup as { id: string; customer_code?: string | null }[]) {
          if (c.customer_code) codeMap.set(c.customer_code.toLowerCase().trim(), c.id);
        }
      }

      const result: ImportResult = { success: 0, failed: 0, errors: [] };
      const dataRows = rows.slice(1);
      const validItems: { data: Record<string, unknown>; rowNum: number }[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rawSup = supIdIdx !== -1 ? row[supIdIdx]?.trim() : '';
        const supId = (rawSup ? supCodeMap.get(rawSup.toLowerCase()) || cleanUUID(rawSup) : null) || cleanUUID(sc.supervisorId) || null;

        const rawCust = custIdIdx !== -1 ? row[custIdIdx]?.trim() : '';
        let custId = cleanUUID(rawCust);
        if (!custId && rawCust) {
          custId = codeMap.get(rawCust.toLowerCase()) || null;
        }

        if (!supId || !custId) {
          result.failed++;
          result.errors.push(
            !supId
              ? t('سطر {n}: supervisor_id مطلوب لخطط الجولة', { n: i + 2 })
              : t('سطر {n}: customer_id غير موجود في قاعدة البيانات', { n: i + 2 }),
          );
          continue;
        }

        // Determine plan_date
        let planDate = dateIdx !== -1 ? row[dateIdx]?.trim() : '';
        if (!planDate || !/^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
          const rawDay = dayIdx !== -1 ? row[dayIdx]?.trim().toLowerCase() : '';
          const dayNum = parseDayOfWeek(rawDay);
          planDate = getPlanDateFromDay(dayNum);
        }

        const plan = {
          company_id: sc.companyId,
          supervisor_id: supId,
          customer_id: custId,
          plan_date: planDate,
          // NOTE: day_of_week is GENERATED ALWAYS AS (EXTRACT(dow FROM plan_date))
          // DO NOT send day_of_week in INSERT.
        };

        validItems.push({ data: plan, rowNum: i + 2 });
      }

      await batchInsert('beat_plans', validItems, result);
      return result;
    },
    onSuccess: (result) => {
      if (result.failed === 0) {
        notify(t('تم استيراد {s} خطة. فشل: {f}', { s: result.success, f: result.failed }), 'success');
      } else {
        notify(t('تم استيراد {s} خطة. فشل: {f}', { s: result.success, f: result.failed }), 'error');
      }
      void qc.invalidateQueries({ queryKey: [...sc.base, 'beat'] });
      void qc.invalidateQueries({ queryKey: ['beat'] });
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

  const [customerErrors, setCustomerErrors] = useState<string[]>([]);
  const [productErrors, setProductErrors] = useState<string[]>([]);
  const [targetErrors, setTargetErrors] = useState<string[]>([]);
  const [beatErrors, setBeatErrors] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const handleCustomerUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setErrors([]);
      setCustomerErrors([]);
      importCustomers.mutate(file, {
        onSuccess: (result) => {
          if (result.errors.length) {
            setErrors(result.errors);
            setCustomerErrors(result.errors);
          }
        },
      });
    }
    e.target.value = '';
  }, [importCustomers]);

  const handleProductUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setErrors([]);
      setProductErrors([]);
      importProducts.mutate(file, {
        onSuccess: (result) => {
          if (result.errors.length) {
            setErrors(result.errors);
            setProductErrors(result.errors);
          }
        },
      });
    }
    e.target.value = '';
  }, [importProducts]);

  const handleTargetUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setErrors([]);
      setTargetErrors([]);
      importTargets.mutate(file, {
        onSuccess: (result) => {
          if (result.errors.length) {
            setErrors(result.errors);
            setTargetErrors(result.errors);
          }
        },
      });
    }
    e.target.value = '';
  }, [importTargets]);

  const handleBeatUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setErrors([]);
      setBeatErrors([]);
      importBeats.mutate(file, {
        onSuccess: (result) => {
          if (result.errors.length) {
            setErrors(result.errors);
            setBeatErrors(result.errors);
          }
        },
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
            <li><code>customer_code</code>: {t('كود العميل (اختياري)')}</li>
            <li><code>type</code>: {t('النوع (بقالة، سوبر ماركت، هايبر ماركت، ميني ماركت، كافيه، مطعم، أخرى)')}</li>
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

        {customerErrors.length > 0 && (
          <div className="alert err col" style={{ gap: 6, marginTop: 12 }}>
            <div style={{ fontWeight: 600 }}>{t('أخطاء الاستيراد ({n})', { n: customerErrors.length })}:</div>
            <div style={{ maxHeight: 180, overflow: 'auto', fontSize: 13 }}>
              {customerErrors.map((err, i) => (
                <div key={i} style={{ padding: '2px 0' }}>• {err}</div>
              ))}
            </div>
          </div>
        )}
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
            <li><code>price</code>, <code>unit</code>: {t('اختياري')}</li>
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

        {productErrors.length > 0 && (
          <div className="alert err col" style={{ gap: 6, marginTop: 12 }}>
            <div style={{ fontWeight: 600 }}>{t('أخطاء الاستيراد ({n})', { n: productErrors.length })}:</div>
            <div style={{ maxHeight: 180, overflow: 'auto', fontSize: 13 }}>
              {productErrors.map((err, i) => (
                <div key={i} style={{ padding: '2px 0' }}>• {err}</div>
              ))}
            </div>
          </div>
        )}
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

        {targetErrors.length > 0 && (
          <div className="alert err col" style={{ gap: 6, marginTop: 12 }}>
            <div style={{ fontWeight: 600 }}>{t('أخطاء الاستيراد ({n})', { n: targetErrors.length })}:</div>
            <div style={{ maxHeight: 180, overflow: 'auto', fontSize: 13 }}>
              {targetErrors.map((err, i) => (
                <div key={i} style={{ padding: '2px 0' }}>• {err}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Beat Plans Import */}
      <div className="card col">
        <div className="title">{t('استيراد خطة الزيارات')}</div>
        <div className="muted">{t('قم بتنزيل القالب، حدد خطط الزيارات اليومية لكل مشرف.')}</div>
        <div className="alert warn" style={{ fontSize: 13 }}>
          <strong>{t('تنسيق الحقول:')}</strong>
          <ul style={{ marginTop: 4, paddingInlineStart: 20 }}>
            <li><code>customer_id</code>: {t('كود العميل أو معرف العميل UUID (مطلوب)')}</li>
            <li><code>day_of_week</code>: {t('اليوم (0=أحد، 1=إثنين، ... 6=سبت أو اسم اليوم بالعربية)')}</li>
            <li><code>plan_date</code>: {t('تاريخ الزيارة YYYY-MM-DD (اختياري، يُحدد اليوم تلقائياً)')}</li>
            <li><code>supervisor_id</code>: {t('معرّف المشرف (اختياري)')}</li>
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

        {beatErrors.length > 0 && (
          <div className="alert err col" style={{ gap: 6, marginTop: 12 }}>
            <div style={{ fontWeight: 600 }}>{t('أخطاء الاستيراد ({n})', { n: beatErrors.length })}:</div>
            <div style={{ maxHeight: 180, overflow: 'auto', fontSize: 13 }}>
              {beatErrors.map((err, i) => (
                <div key={i} style={{ padding: '2px 0' }}>• {err}</div>
              ))}
            </div>
          </div>
        )}
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
