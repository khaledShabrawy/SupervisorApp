import { newMutationId, isRecordId, sameInstant, withMutationReceipt } from './mutation-receipt';
import { insertScopedOnce, finishAttendanceOnce } from './persistent-mutation';
import { supabase } from './supabase';
import { t } from '@/i18n';
import type { QueryClient } from '@tanstack/react-query';

export type OfflineActionType =
  | 'create_visit'
  | 'update_visit_status'
  | 'set_visit_outcome'
  | 'save_order'
  | 'attendance_action'
  | 'submit_survey';

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: Record<string, any>;
  companyId: string;
  supervisorId: string;
  createdAt: string;
}

const DEFAULT_STORAGE_KEY = 'mydan_offline_queue_v1';
const QUEUE_EVENT = 'mydan:offline-queue-changed';

/** Returns a tenant/user isolated storage key to prevent cross-account queue contamination */
export function getStorageKey(companyId?: string, supervisorId?: string): string {
  if (companyId && supervisorId) {
    return `mydan_offline_queue_${companyId}_${supervisorId}`;
  }
  return DEFAULT_STORAGE_KEY;
}

/** Retrieves the current offline queue from localStorage, checking tenant/user queue first */
export function getOfflineQueue(companyId?: string, supervisorId?: string): OfflineAction[] {
  const items = new Map<string, OfflineAction>();
  const add = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      if (!item || typeof item.id !== 'string' || !item.companyId || !item.supervisorId) continue;
      if (companyId && item.companyId !== companyId) continue;
      if (supervisorId && item.supervisorId !== supervisorId) continue;
      items.set(item.id, item);
    }
  };
  // Keep legacy snapshots readable, but never import another account's actions.
  // Separate keys for new actions avoid read/modify/write races between tabs.
  const keys = Object.keys(localStorage).sort((a, b) => Number(a.includes(':item:')) - Number(b.includes(':item:')));
  for (const key of keys) {
    if (!key?.startsWith('mydan_offline_queue_')) continue;
    if (companyId && supervisorId && key !== DEFAULT_STORAGE_KEY && key !== getStorageKey(companyId, supervisorId)
      && !key.startsWith(getStorageKey(companyId, supervisorId) + ':item:')) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? 'null');
      add(key.includes(':item:') ? [value] : value);
    } catch {
      throw new Error(t('تعذر قراءة العمليات المحلية. لم يتم حذف البيانات.'));
    }
  }
  return [...items.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Saves the offline queue to localStorage with quota-exceeded detection */
export function saveOfflineQueue(queue: OfflineAction[], companyId?: string, supervisorId?: string): void {
  const key = getStorageKey(companyId, supervisorId);
  try {
    localStorage.setItem(key, JSON.stringify(queue));
  } catch (err) {
    console.error('Failed to save offline queue to localStorage:', err);
    throw new Error(t('تعذر حفظ العملية على الجهاز. تحقق من مساحة التخزين وأعد المحاولة.'));
  }
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: queue.length }));
}

/** Clears the queue for a given tenant/user */
export function clearOfflineQueue(companyId?: string, supervisorId?: string): void {
  try {
    const key = getStorageKey(companyId, supervisorId);
    localStorage.removeItem(key);
    for (const itemKey of Object.keys(localStorage)) {
      if (itemKey.startsWith(key + ':item:')) localStorage.removeItem(itemKey);
    }
    window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: 0 }));
  } catch {}
}

/** Enqueues an action to be executed when connection is available */
export function enqueueOfflineAction(action: Omit<OfflineAction, 'id' | 'createdAt'>): void {
  const item: OfflineAction = {
    ...action,
    id: newMutationId(),
    createdAt: new Date().toISOString(),
  };
  if (!action.companyId || !action.supervisorId) throw new Error('Offline action scope is required');
  try {
    localStorage.setItem(`${getStorageKey(action.companyId, action.supervisorId)}:item:${item.id}`, JSON.stringify(item));
  } catch {
    throw new Error(t('تعذر حفظ العملية على الجهاز. تحقق من مساحة التخزين وأعد المحاولة.'));
  }
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
}

/** Returns the count of pending offline actions */
export function getPendingCount(companyId?: string, supervisorId?: string): number {
  return getOfflineQueue(companyId, supervisorId).length;
}

/** Subscribes to changes in the offline queue count */
export function subscribeToQueueChanges(callback: (count: number) => void, companyId?: string, supervisorId?: string): () => void {
  const handler = () => callback(getPendingCount(companyId, supervisorId));
  window.addEventListener(QUEUE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(QUEUE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

/**
 * Uploads pending actions sequentially; upserts use client row IDs where available.
 * Any successful action is removed from the queue.
 */
async function uploadQueue(companyId?: string, supervisorId?: string): Promise<{
  syncedCount: number;
  failedCount: number;
  total: number;
}> {
  if (!navigator.onLine) {
    throw new Error(t('الهاتف غير متصل بالإنترنت حالياً. يرجى الاتصال بشبكة أولاً.'));
  }

  if (!companyId || !supervisorId) throw new Error('Offline upload scope is required');

  // Verify active authentication before executing offline writes
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error(t('يجب تسجيل الدخول لمزامنة البيانات غير المتصلة.'));
  }

  const { data: profile, error: profileError } = await supabase.from('supervisors')
    .select('id,company_id,is_active').eq('user_id', session.user.id).eq('id', supervisorId).eq('company_id', companyId).single();
  if (profileError || !profile?.is_active || profile.id !== supervisorId || profile.company_id !== companyId) {
    throw new Error(t('تعذر التحقق من صلاحية مزامنة بيانات هذا الحساب.'));
  }
  const queue = getOfflineQueue(companyId, supervisorId);
  if (queue.length === 0) {
    return { syncedCount: 0, failedCount: 0, total: 0 };
  }

  let syncedCount = 0;
  let failedCount = 0;

  for (const item of queue) {
    try {
      const { data: { session: current } } = await supabase.auth.getSession();
      if (!current || current.user.id !== session.user.id) throw new Error('Session changed during upload');
      if (item.payload.company_id && item.payload.company_id !== companyId) throw new Error('Offline payload scope mismatch');
      const createsRow = (item.type === 'create_visit' && !item.payload.existingId)
        || item.type === 'save_order' || item.type === 'submit_survey'
        || (item.type === 'attendance_action' && item.payload.kind === 'in');
      if (createsRow) {
        if (item.payload.id && !isRecordId(item.payload.id)) throw new Error('Invalid legacy record ID; reconciliation required');
        if (!item.payload.id) {
          item.payload.id = isRecordId(item.id) ? item.id : newMutationId();
          // Persist an identity before sending anything, including when upgrading an old queue.
          localStorage.setItem(`${getStorageKey(companyId, supervisorId)}:item:${item.id}`, JSON.stringify(item));
        }
      }
      if (item.type === 'create_visit') {
        const { existingId, customer_id, latitude, longitude, notes, geo_distance, on_beat, check_in_time, visit_date } = item.payload;
        const geo = { geo_distance, on_beat };

        if (existingId) {
          const stamp = check_in_time || item.createdAt;
          await withMutationReceipt<Record<string, any>>(
            () => supabase.from('visits').update({ status: 'in_progress', check_in_time: stamp,
              latitude, longitude, notes: notes || null, ...geo })
              .eq('id', existingId).eq('company_id', companyId).eq('supervisor_id', supervisorId)
              .eq('customer_id', customer_id).eq('status', 'pending').select('id,check_in_time').single(),
            () => supabase.from('visits').select('id,check_in_time').eq('id', existingId)
              .eq('company_id', companyId).eq('supervisor_id', supervisorId).eq('customer_id', customer_id).maybeSingle(),
            row => row.id === existingId && sameInstant(row.check_in_time, stamp),
          );
        } else {
          await insertScopedOnce('visits', {
            id: item.payload.id, supervisor_id: item.supervisorId, company_id: item.companyId,
            customer_id, visit_date: visit_date || item.createdAt.slice(0, 10), status: 'in_progress',
            check_in_time: check_in_time || item.createdAt, latitude, longitude, notes: notes || null, ...geo,
          });
        }
        if (on_beat === false) {
          const distM = geo_distance != null ? Math.round(geo_distance) : null;
          const distText = distM != null ? String(distM) + 'م' : 'غير محددة';
          void (supabase.from('notifications') as any).insert({
            id: existingId || item.payload.id,
            company_id: item.companyId,
            supervisor_id: item.supervisorId,
            type: 'oor_visit',
            title_ar: 'تنبيه: زيارة خارج النطاق الجغرافي ⚠️',
            body_ar: `تم رفع زيارة مسجلة دون اتصال خارج نطاق السياج الجغرافي (المسافة: ${distText}).`,
            is_read: false,
          }).then(({ error }: { error: unknown }) => { if (error && (error as {code?: string}).code !== '23505') console.warn('Visit alert could not be saved', { code: (error as {code?: string}).code }); });
        }
      } else if (item.type === 'update_visit_status') {
        const { id, status, check_out_time } = item.payload;
        const patch: Record<string, any> = { status };
        if (status === 'completed') patch.check_out_time = check_out_time || item.createdAt;
        const { error } = await supabase.from('visits').update(patch).eq('id', id).eq('company_id', companyId).eq('supervisor_id', supervisorId).select('id').single();
        if (error) throw error;
      } else if (item.type === 'set_visit_outcome') {
        const { id, outcome } = item.payload;
        const { error } = await supabase.from('visits').update({ visit_outcome: outcome }).eq('id', id).eq('company_id', companyId).eq('supervisor_id', supervisorId).select('id').single();
        if (error) throw error;
      } else if (item.type === 'save_order') {
        // Explicitly whitelist known fields — prevents injecting unexpected columns
        // from tampered localStorage. Supports upsert-by-id for idempotency on retry.
        const p = item.payload as Record<string, unknown>;
        const safeRow = {
          supervisor_id: item.supervisorId,
          company_id:    item.companyId,
          visit_id:      typeof p.visit_id    === 'string' ? p.visit_id    : String(p.visit_id ?? ''),
          customer_id:   typeof p.customer_id === 'string' ? p.customer_id : null,
          product_id:    typeof p.product_id  === 'string' ? p.product_id  : null,
          quantity:      typeof p.quantity    === 'number' ? p.quantity    : (p.quantity    != null ? Number(p.quantity)    : null),
          unit_price:    typeof p.unit_price  === 'number' ? p.unit_price  : (p.unit_price  != null ? Number(p.unit_price)  : null),
          total_amount:  typeof p.total_amount === 'number' ? p.total_amount : (p.total_amount != null ? Number(p.total_amount) : 0),
          items:         Array.isArray(p.items) ? p.items : null,
          status:        typeof p.status     === 'string' ? p.status     : 'pending',
          notes:         typeof p.notes      === 'string' ? p.notes      : null,
          order_date:    typeof p.order_date === 'string' ? p.order_date : new Date().toISOString().slice(0, 10),
        };
        await insertScopedOnce('orders', { ...safeRow, id: p.id });
      } else if (item.type === 'attendance_action') {
        const { kind, attendance_date, check_in_time, check_out_time, check_in_lat, check_in_lng } = item.payload as {
          kind: 'in' | 'out'; attendance_date: string;
          check_in_time?: string; check_out_time?: string;
          check_in_lat?: number | null; check_in_lng?: number | null;
        };
        const row = { id: item.payload.id, supervisor_id: item.supervisorId, company_id: item.companyId, attendance_date };
        if (kind === 'in') {
          await insertScopedOnce('attendance', { ...row, check_in_time: check_in_time || item.createdAt,
            check_in_lat: check_in_lat ?? null, check_in_lng: check_in_lng ?? null });
        } else if (kind === 'out') {
          await finishAttendanceOnce({ ...row, check_out_time: check_out_time || item.createdAt });
        } else throw new Error('Unsupported attendance action');
      } else if (item.type === 'submit_survey') {
        const { survey_id, visit_id, answers, submitted_at, id } = item.payload as {
          survey_id: string; visit_id: string; answers: Record<string, unknown>; submitted_at: string; id?: string;
        };
        const surveyRow: Record<string, any> = {
          company_id: item.companyId, supervisor_id: item.supervisorId,
          survey_id, visit_id, answers, submitted_at,
        };
        surveyRow.id = id;
        await insertScopedOnce('survey_responses', surveyRow);
      } else {
        throw new Error('Unsupported offline action');
      }

      // Acknowledge only this action. New actions use separate keys and are untouched.
      localStorage.removeItem(`${getStorageKey(companyId, supervisorId)}:item:${item.id}`);
      for (const key of [getStorageKey(companyId, supervisorId), DEFAULT_STORAGE_KEY]) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const snapshot = JSON.parse(raw) as OfflineAction[];
        localStorage.setItem(key, JSON.stringify(snapshot.filter((row) =>
          row.id !== item.id || row.companyId !== companyId || row.supervisorId !== supervisorId)));
      }
      window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
      syncedCount++;
    } catch (err) {
      console.error('Offline action could not be acknowledged', { type: item.type, code: (err as {code?: string})?.code });
      failedCount++;
    }
  }

  return { syncedCount, failedCount, total: queue.length };
}

type UploadResult = Awaited<ReturnType<typeof uploadQueue>>;
const activeUploads = new Map<string, Promise<UploadResult>>();

/** Coalesce same-tab uploads and serialize uploads across tabs where Web Locks is supported. */
export function uploadPendingOfflineActions(companyId?: string, supervisorId?: string): Promise<UploadResult> {
  const key = getStorageKey(companyId, supervisorId);
  const existing = activeUploads.get(key);
  if (existing) return existing;
  const run = () => uploadQueue(companyId, supervisorId);
  const pending = (async () => await (navigator.locks
    ? navigator.locks.request('mydan-offline-upload', run)
    : run()))().finally(() => activeUploads.delete(key));
  activeUploads.set(key, pending);
  return pending;
}

/**
 * Refetches and downloads all fresh data from the cloud (beat plans, visits, targets, etc.)
 */
export async function downloadFreshData(queryClient: QueryClient): Promise<void> {
  if (!navigator.onLine) {
    throw new Error(t('الهاتف غير متصل بالإنترنت حالياً. يرجى الاتصال بشبكة أولاً.'));
  }
  await queryClient.invalidateQueries({ refetchType: 'none' });
  await queryClient.refetchQueries({ type: 'active' }, { throwOnError: true });
}
