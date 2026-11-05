import { supabase } from './supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import { removeDevicePush } from './push-lifecycle';
export const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() ?? '';
const supported = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
function publicKey(): Uint8Array<ArrayBuffer> {
  const raw = atob(VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
export function usePushSubscription() {
  const { supervisor } = useAuth();
  const owner = supervisor ? `${supervisor.company_id}:${supervisor.id}` : '';
  const currentOwner = useRef(owner); currentOwner.current = owner;
  const [state, setState] = useState<'idle' | 'loading' | 'subscribed' | 'denied'>('idle');
  const [error, setError] = useState<string | null>(null);
  const persist = useCallback(async (sub: PushSubscription) => {
    if (!supervisor || currentOwner.current !== owner) throw new Error('تغير الحساب أثناء تفعيل الإشعارات.');
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('اشتراك الإشعارات غير مكتمل.');
    const response = await supabase.from('push_subscriptions').upsert({ supervisor_id:supervisor.id,
      company_id:supervisor.company_id, endpoint:json.endpoint, p256dh:json.keys.p256dh, auth:json.keys.auth },
      { onConflict:'supervisor_id,endpoint' });
    if (response.error) throw new Error('تعذر حفظ اشتراك الإشعارات. أعد المحاولة.');
    if (currentOwner.current === owner) setState('subscribed');
  }, [owner, supervisor]);
  useEffect(() => {
    let alive = true; setState('idle'); setError(null);
    if (!supported() || Notification.permission === 'denied' || !VAPID_PUBLIC) { setState('denied'); return; }
    if (!owner || Notification.permission !== 'granted') return;
    void navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL).then(async reg => {
      const sub = await reg?.pushManager.getSubscription();
      if (alive && sub) await persist(sub);
    }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [owner, persist]);
  const subscribe = useCallback(async () => {
    if (!supported() || !supervisor || !VAPID_PUBLIC) return;
    setState('loading'); setError(null);
    try {
      if (await Notification.requestPermission() !== 'granted') { setState('denied'); return; }
      const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
      if (!reg) throw new Error('افتح التطبيق بعد تفعيل خدمة الإشعارات ثم أعد المحاولة.');
      const sub = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey()});
      await persist(sub);
    } catch (e) { if (currentOwner.current === owner) { setState('idle'); setError(e instanceof Error ? e.message : 'تعذر تفعيل الإشعارات.'); } }
  }, [owner, supervisor, persist]);
  const unsubscribe = useCallback(async () => {
    try { await removeDevicePush(supervisor ? { supervisorId: supervisor.id, companyId: supervisor.company_id } : undefined); setState('idle'); setError(null); }
    catch(e) { setError(e instanceof Error ? e.message : 'تعذر إيقاف الإشعارات.'); }
  }, [supervisor]);
  return { state, error, subscribe, unsubscribe };
}
