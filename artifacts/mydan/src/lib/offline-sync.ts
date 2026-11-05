import { sessionIdentity } from './session-identity';
import { supabase } from './supabase';
import type { QueryClient } from '@tanstack/react-query';
import { putAction, listActions, acknowledgeAction, migrateLegacyQueue, type OfflineAction } from './outbox-store';
import { replayActions } from './outbox-replay';
import { mayRetryOffline } from './operation-errors';
export type { OfflineAction, OfflineActionType } from './outbox-store';

const QUEUE_EVENT = 'mydan:offline-queue-changed';
const CHANNEL = 'mydan-outbox';
function changed() {
  window.dispatchEvent(new Event(QUEUE_EVENT));
  if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel(CHANNEL); channel.postMessage('changed'); channel.close(); }
}
export async function enqueueOfflineAction(action: Omit<OfflineAction, 'id' | 'createdAt'>): Promise<OfflineAction> {
  const item = { ...action, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await putAction(item);
  changed();
  return item;
}
export async function getPendingCount(companyId?: string, supervisorId?: string): Promise<number> {
  return companyId && supervisorId ? (await listActions(companyId, supervisorId)).length : 0;
}
export function subscribeToQueueChanges(callback: (count: number) => void, companyId?: string, supervisorId?: string,
  onError: (error: unknown) => void = () => {}): () => void {
  let alive = true;
  const handler = () => { void getPendingCount(companyId, supervisorId).then(n => { if (alive) callback(n); }).catch(onError); };
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  if (channel) channel.onmessage = handler;
  window.addEventListener(QUEUE_EVENT, handler);
  handler();
  return () => { alive = false; channel?.close(); window.removeEventListener(QUEUE_EVENT, handler); };
}
const drains = new Map<string, Promise<{ syncedCount: number; failedCount: number; total: number }>>();
export async function uploadPendingOfflineActions(companyId?: string, supervisorId?: string) {
  if (!companyId || !supervisorId) throw new Error('بيانات الحساب مطلوبة للمزامنة.');
  if (!navigator.onLine) throw new Error('اتصل بالإنترنت لمزامنة العمل المحفوظ.');
  const scope = `${companyId}:${supervisorId}`;
  const active = drains.get(scope);
  if (active) return active;
  const drain = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error('يجب تسجيل الدخول لمزامنة العمل.');
    const userId = data.session.user.id;
    const sid = sessionIdentity(data.session.access_token);
    const assertIdentity = async () => {
      const current = await supabase.auth.getSession();
      if (current.error || current.data.session?.user.id !== userId || sessionIdentity(current.data.session?.access_token) !== sid) throw new Error('تغير الحساب أثناء المزامنة.');
      const profile = await supabase.from('supervisors').select('id,company_id,is_active,force_password_change')
        .eq('user_id', userId).eq('id', supervisorId).eq('company_id', companyId).maybeSingle();
      if (profile.error || !profile.data?.is_active || profile.data.force_password_change) throw new Error('تعذر اعتماد صلاحية الحساب للمزامنة.');
    };
    await assertIdentity();
    await migrateLegacyQueue(companyId, supervisorId, userId, localStorage);
    const actions = await listActions(companyId, supervisorId);
    return replayActions({ actions, companyId, supervisorId, userId, assertIdentity,
      execute: async action => {
        const response = await supabase.rpc('mdn_apply_offline_action_v1', {
          p_action_id: action.id, p_action_type: action.type, p_payload: action.payload,
          p_company_id: companyId, p_supervisor_id: supervisorId,
        });
        if (response.error || response.data !== true) throw new Error('لم يؤكد الخادم تطبيق العملية.');
      },
      acknowledge: async action => { await acknowledgeAction(action.id, companyId, supervisorId); changed(); },
    });
  };
  const operation = (async () => navigator.locks ? await navigator.locks.request(`mydan-sync:${scope}`, drain) : await drain())()
    .finally(() => { drains.delete(scope); changed(); });
  drains.set(scope, operation);
  return operation;
}

/** Persist intent before its first request. Both online submission and later replay use one server receipt. */
export async function submitFieldAction(action: Omit<OfflineAction, 'id' | 'createdAt'>): Promise<{ queued: boolean }> {
  const item = await enqueueOfflineAction(action);
  if (!navigator.onLine) return { queued: true };
  const session = await supabase.auth.getSession();
  if (session.error || session.data.session?.user.id !== action.userId) throw new Error('تغيرت الجلسة. احتُفظ بالعملية لهذا الحساب.');
  const response = await supabase.rpc('mdn_apply_offline_action_v1', { p_action_id: item.id, p_action_type: item.type,
    p_payload: item.payload, p_company_id: item.companyId, p_supervisor_id: item.supervisorId });
  if (response.error) {
    if (mayRetryOffline(response.error, response.status)) return { queued: true };
    // Rejected intentions stay recoverable; they are never described as completed.
    throw new Error(response.error.message || 'رفض الخادم العملية. احتُفظ بها للمراجعة.');
  }
  if (response.data !== true) return { queued: true }; // Unconfirmed work stays pending; never invite a duplicate form submission.
  await acknowledgeAction(item.id, item.companyId, item.supervisorId); changed();
  return { queued: false };
}
/** Refresh active queries; a complete persistent offline read cache is not implied. */
export async function downloadFreshData(queryClient: QueryClient): Promise<void> {
  if (!navigator.onLine) throw new Error('اتصل بالإنترنت لتحديث البيانات.');
  await queryClient.invalidateQueries();
  await queryClient.refetchQueries({ type: 'active' }, { throwOnError: true });
}
