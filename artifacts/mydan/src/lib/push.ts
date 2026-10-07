// Web Push subscription management
import { supabase } from './supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useEffect, useState } from 'react';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlB64ToUint8(base64: string): Uint8Array<ArrayBuffer> {
  const b64 = base64.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  return new Uint8Array(arr.buffer as ArrayBuffer);
}

async function getOrCreateSub(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8(VAPID_PUBLIC),
  });
}

export function usePushSubscription() {
  const { supervisor } = useAuth();
  const [state, setState] = useState<'idle' | 'loading' | 'subscribed' | 'denied'>('idle');

  // check current state on mount
  useEffect(() => {
    if (!('Notification' in window)) { setState('denied'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    if (Notification.permission === 'granted') { setState('subscribed'); }
  }, []);

  const subscribe = useCallback(async () => {
    if (!supervisor?.id || !VAPID_PUBLIC) return;
    if (Notification.permission === 'denied') { setState('denied'); return; }
    setState('loading');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState('denied'); return; }
      const sub = await getOrCreateSub();
      if (!sub) { setState('idle'); return; }
      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      await supabase.from('push_subscriptions').upsert({
        supervisor_id: supervisor.id,
        company_id: supervisor.company_id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      }, { onConflict: 'supervisor_id,endpoint' });
      setState('subscribed');
    } catch {
      setState('idle');
    }
  }, [supervisor]);

  const unsubscribe = useCallback(async () => {
    const reg = await navigator.serviceWorker?.ready;
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabase.from('push_subscriptions')
        .delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
    setState('idle');
  }, []);

  return { state, subscribe, unsubscribe };
}
