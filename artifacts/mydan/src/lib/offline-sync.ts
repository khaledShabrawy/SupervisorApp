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

const STORAGE_KEY = 'mydan_offline_queue_v1';
const QUEUE_EVENT = 'mydan:offline-queue-changed';

/** Retrieves the current offline queue from localStorage */
export function getOfflineQueue(): OfflineAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Saves the offline queue to localStorage */
function saveOfflineQueue(queue: OfflineAction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('Failed to save offline queue to localStorage:', err);
  }
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: queue.length }));
}

/** Enqueues an action to be executed when connection is available */
export function enqueueOfflineAction(action: Omit<OfflineAction, 'id' | 'createdAt'>): void {
  const queue = getOfflineQueue();
  const item: OfflineAction = {
    ...action,
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36),
    createdAt: new Date().toISOString(),
  };
  queue.push(item);
  saveOfflineQueue(queue);
}

/** Returns the count of pending offline actions */
export function getPendingCount(): number {
  return getOfflineQueue().length;
}

/** Subscribes to changes in the offline queue count */
export function subscribeToQueueChanges(callback: (count: number) => void): () => void {
  const handler = () => callback(getPendingCount());
  window.addEventListener(QUEUE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(QUEUE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

/**
 * Uploads all pending offline actions to Supabase sequentially.
 * Any successful action is removed from the queue.
 */
export async function uploadPendingOfflineActions(): Promise<{
  syncedCount: number;
  failedCount: number;
  total: number;
}> {
  if (!navigator.onLine) {
    throw new Error(t('الهاتف غير متصل بالإنترنت حالياً. يرجى الاتصال بشبكة أولاً.'));
  }

  const queue = getOfflineQueue();
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
          const { error } = await supabase.from('visits').insert({
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
          });
          if (error) throw error;
        }
      } else if (item.type === 'update_visit_status') {
        const { id, status, check_out_time } = item.payload;
        const patch: Record<string, any> = { status };
        if (status === 'completed') patch.check_out_time = check_out_time || new Date().toISOString();
        const { error } = await supabase.from('visits').update(patch).eq('id', id);
        if (error) throw error;
      } else if (item.type === 'set_visit_outcome') {
        const { id, outcome } = item.payload;
        const { error } = await supabase.from('visits').update({ visit_outcome: outcome }).eq('id', id);
        if (error) throw error;
      } else if (item.type === 'save_order') {
        const { error } = await supabase.from('orders').insert(item.payload);
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
        const { survey_id, visit_id, answers, submitted_at } = item.payload as {
          survey_id: string; visit_id: string; answers: Record<string, unknown>; submitted_at: string;
        };
        const { error } = await supabase.from('survey_responses').insert({
          company_id: item.companyId, supervisor_id: item.supervisorId,
          survey_id, visit_id, answers, submitted_at,
        });
        if (error) throw error;
      }

      syncedCount++;
    } catch (err) {
      console.error(`Failed to sync offline item ${item.id} (${item.type}):`, err);
      failedCount++;
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
  return { syncedCount, failedCount, total: queue.length };
}

/**
 * Refetches and downloads all fresh data from the cloud (beat plans, visits, targets, etc.)
 */
export async function downloadFreshData(queryClient: QueryClient): Promise<void> {
  if (!navigator.onLine) {
    throw new Error(t('الهاتف غير متصل بالإنترنت حالياً. يرجى الاتصال بشبكة أولاً.'));
  }
  // Invalidate and refetch all active queries
  await queryClient.invalidateQueries();
  await queryClient.refetchQueries();
}
