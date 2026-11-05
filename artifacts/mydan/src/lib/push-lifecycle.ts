import { supabase } from './supabase';
export async function removeDevicePush(owner?: { supervisorId: string; companyId: string }): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  // Unsubscribe on the device even if server cleanup is temporarily unavailable.
  const removed = await subscription.unsubscribe();
  if (!removed) throw new Error('تعذر إيقاف إشعارات هذا الجهاز.');
  if (!owner) return;
  // A delayed cleanup must never remove a subsequent account's endpoint.
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
    .eq('supervisor_id', owner.supervisorId).eq('company_id', owner.companyId);
  if (error) throw new Error('أوقفت إشعارات الجهاز؛ تعذر تأكيد إزالة الاشتراك من الخادم.');
}
