// Web Push subscription management
import { supabase } from './supabase';
import { hasRegisteredPush, registerPush, unregisterPush } from './push-registration';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useEffect, useRef, useState } from 'react';

export const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlB64ToUint8(base64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
  return new Uint8Array(Uint8Array.from(raw, c => c.charCodeAt(0)).buffer as ArrayBuffer);
}

type PushState = 'checking' | 'idle' | 'loading' | 'subscribed' | 'denied' | 'error' | 'unsupported';

export function usePushSubscription() {
  const { supervisor } = useAuth();
  const [state, setState] = useState<PushState>('checking');
  const generation = useRef(0);
  const supervisorId = supervisor?.id;
  const companyId = supervisor?.company_id;

  useEffect(() => {
    const current = ++generation.current;
    const setCurrent = (next: PushState) => { if (generation.current === current) setState(next); };
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC) {
      setCurrent('unsupported');
    } else if (Notification.permission === 'denied') {
      setCurrent('denied');
    } else if (!supervisorId || !companyId || Notification.permission !== 'granted') {
      setCurrent('idle');
    } else {
      setCurrent('checking');
      void navigator.serviceWorker.getRegistration().then(registration =>
        hasRegisteredPush(supabase, registration, { supervisorId, companyId })
      ).then(registered => setCurrent(registered ? 'subscribed' : 'idle')).catch(() => setCurrent('error'));
    }
    return () => { generation.current++; };
  }, [supervisorId, companyId]);

  const subscribe = useCallback(async () => {
    if (!supervisorId || !companyId || !VAPID_PUBLIC) { setState('error'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    const current = ++generation.current;
    const setCurrent = (next: PushState) => { if (generation.current === current) setState(next); };
    setCurrent('loading');
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') { setCurrent(permission === 'denied' ? 'denied' : 'idle'); return; }
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active) throw new Error('Service worker is not ready');
      await registerPush(supabase, registration, { supervisorId, companyId }, urlB64ToUint8(VAPID_PUBLIC!));
      setCurrent('subscribed');
    } catch { setCurrent('error'); }
  }, [supervisorId, companyId]);

  const unsubscribe = useCallback(async () => {
    if (!supervisorId || !companyId) { setState('error'); return; }
    const current = ++generation.current;
    const setCurrent = (next: PushState) => { if (generation.current === current) setState(next); };
    setCurrent('loading');
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await unregisterPush(supabase, registration, { supervisorId, companyId });
      setCurrent('idle');
    } catch { setCurrent('error'); }
  }, [supervisorId, companyId]);

  return { state, subscribe, unsubscribe };
}
