import { supabase } from './supabase';
import { notify } from './toast';
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
  try {
    if (companyId && supervisorId) {
      const key = getStorageKey(companyId, supervisorId);
      const raw = localStorage.getItem(key);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) return list;
      }
    }

    // Aggregation fallback: check legacy queue and all active device queues
    const aggregated: OfflineAction[] = [];
    const legacyRaw = localStorage.getItem(DEFAULT_STORAGE_KEY);
    if (legacyRaw) {
      try {
        const list = JSON.parse(legacyRaw);
        if (Array.isArray(list)) aggregated.push(...list);
      } catch {}
    }

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('mydan_offline_queue_') && k !== DEFAULT_STORAGE_KEY) {
        if (companyId && supervisorId && k !== getStorageKey(companyId, supervisorId)) {
          continue;
        }
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) aggregated.push(...list);
          }
        } catch {}
      }
    }
    return aggregated;
  } catch {
    return [];
  }
}

/** Saves the offline queue to localStorage with quota-exceeded detection */
export function saveOfflineQueue(queue: OfflineAction[], companyId?: string, supervisorId?: string): void {
  const key = getStorageKey(companyId, supervisorId);
  try {
    localStorage.setItem(key, JSON.stringify(queue));
    if (key !== DEFAULT_STORAGE_KEY && localStorage.getItem(DEFAULT_STORAGE_KEY)) {
      try { localStorage.removeItem(DEFAULT_STORAGE_KEY); } catch {}
    }
  } catch (err) {
    console.error('Failed to save offline queue to localStorage:', err);
    notify(t('مساحة التخزين المحلي ممتلئة. يرجى الاتصال بالإنترنت ومزامنة البيانات فوراً.'), 'error');
  }
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: queue.length }));
}

/** Clears the queue for a given tenant/user */
export function clearOfflineQueue(companyId?: string, supervisorId?: string): void {
  try {
    const key = getStorageKey(companyId, supervisorId);
    localStorage.removeItem(key);
    window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: 0 }));
  } catch {}
}

/** Enqueues an action to be executed when connection is available */
export function enqueueOfflineAction(action: Omit<OfflineAction, 'id' | 'createdAt'>): void {
  const queue = getOfflineQueue(action.companyId, action.supervisorId);
  const item: OfflineAction = {
    ...action,
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36),
    createdAt: new Date().toISOString(),
  };
  queue.push(item);
  saveOfflineQueue(queue, action.companyId, action.supervisorId);
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
 * Uploads all pending offline actions to Supabase sequentially with idempotency.
 * Any successful action is removed from the queue.
 */
export async function uploadPendingOfflineActions(companyId?: string, supervisorId?: string): Promise<{
  syncedCount: number;
  failedCount: number;
  total: number;
}> {
  if (!navigator.onLine) {
    throw new Error(t('الهاتف غير متصل بالإنترنت حالياً. يرجى الاتصال بشبكة أولاً.'));
  }

  // Verify active authentication before executing offline writes
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error(t('يجب تسجيل الدخول لمزامنة البيانات غير المتصلة.'));
  }

  const queue = getOfflineQueue(companyId, supervisorId);
  if (queue.length === 0) {
    return { syncedCount: 0, failedCount: 0, total: 0 };
  }

  const remaining: OfflineAction[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  for (const item of queue) {
    try {
      if (item.type === 'create_visit') {
        const { existingId, customer_id, latitude, longitude, notes, geo_distance, on_beat, check_in_time, visit_date } = item.payload;
        const geo = { geo_distance, on_beat };

        if (existingId) {
          const { error } = await supabase.from('visits').update({
            status: 'in_progress',
            check_in_time: check_in_time || new Date().toISOString(),
            latitude,
            longitude,
            notes: notes || null,
            ...geo,
          }).eq('id', existingId);
          if (error) throw error;
        } else {
          const clientId: string | undefined = item.payload.id;
          const isValidUUID = clientId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId);
          const visitRow: Record<string, any> = {
            supervisor_id: item.supervisorId,
            company_id: item.companyId,
            customer_id,
            visit_date: visit_date || new Date().toISOString().slice(0, 10),
            status: 'in_progress',
            check_in_time: check_in_time || new Date().toISOString(),
            latitude,
            longitude,
            notes: notes || null,
            ...geo,
          };
          if (isValidUUID) visitRow.id = clientId;
          
          const { error } = isValidUUID
            ? await supabase.from('visits').upsert(visitRow, { onConflict: 'id' })
            : await supabase.from('visits').insert(visitRow);
          if (error) throw error;
        }
      } else if (item.type === 'update_visit_status') {
        const { id, status, check_out_time, company_id } = item.payload;
        const patch: Record<string, any> = { status };
        if (status === 'completed') patch.check_out_time = check_out_time || new Date().toISOString();
        let u = supabase.from('visits').update(patch).eq('id', id);
        if (company_id) u = u.eq('company_id', company_id);
        const { error } = await u;
        if (error) throw error;
      } else if (item.type === 'set_visit_outcome') {
        const { id, outcome, company_id } = item.payload;
        let u = supabase.from('visits').update({ visit_outcome: outcome }).eq('id', id);
        if (company_id) u = u.eq('company_id', company_id);
        const { error } = await u;
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
        const { error } = typeof p.id === 'string' && p.id
          ? await supabase.from('orders').upsert({ ...safeRow, id: p.id }, { onConflict: 'id' })
          : await supabase.from('orders').insert(safeRow);
        if (error) throw error;
      } else if (item.type === 'attendance_action') {
        const { kind, attendance_date, check_in_time, check_out_time, check_in_lat, check_in_lng } = item.payload as {
          kind: 'in' | 'out'; attendance_date: string;
          check_in_time?: string; check_out_time?: string;
          check_in_lat?: number | null; check_in_lng?: number | null;
        };
        if (kind === 'in') {
          const { error } = await supabase.from('attendance').insert({
            supervisor_id: item.supervisorId, company_id: item.companyId,
            attendance_date,
            check_in_time: check_in_time ?? new Date().toISOString(),
            check_in_lat: check_in_lat ?? null, check_in_lng: check_in_lng ?? null,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase.from('attendance')
            .update({ check_out_time: check_out_time ?? new Date().toISOString() })
            .eq('company_id', item.companyId).eq('supervisor_id', item.supervisorId)
            .eq('attendance_date', attendance_date);
          if (error) throw error;
        }
      } else if (item.type === 'submit_survey') {
        const { survey_id, visit_id, answers, submitted_at, id } = item.payload as {
          survey_id: string; visit_id: string; answers: Record<string, unknown>; submitted_at: string; id?: string;
        };
        const surveyRow: Record<string, any> = {
          company_id: item.companyId, supervisor_id: item.supervisorId,
          survey_id, visit_id, answers, submitted_at,
        };
        if (id) surveyRow.id = id;
        const { error } = id
          ? await supabase.from('survey_responses').upsert(surveyRow, { onConflict: 'id' })
          : await supabase.from('survey_responses').insert(surveyRow);
        if (error) throw error;
      }

      syncedCount++;
    } catch (err) {
      console.error(`Failed to sync offline item ${item.id} (${item.type}):`, err);
      failedCount++;
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining, companyId, supervisorId);
  return { syncedCount, failedCount, total: queue.length };
}

/**
 * Refetches and downloads all fresh data from the cloud (beat plans, visits, targets, etc.)
 */
export async function downloadFreshData(queryClient: QueryClient): Promise<void> {
  if (!navigator.onLine) {
    throw new Error(t('الهاتف غير متصل بالإنترنت حالياً. يرجى الاتصال بشبكة أولاً.'));
  }
  await queryClient.invalidateQueries();
  await queryClient.refetchQueries();
}
