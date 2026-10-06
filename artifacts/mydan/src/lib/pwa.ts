import { Capacitor } from '@capacitor/core';
import { notify } from './toast';

export function registerPwa(): void {
  // The APK ships its files locally; a service worker there would only pin stale builds.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || Capacitor.isNativePlatform()) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    }).catch(() => {
      notify('تعذر تفعيل تشغيل التطبيق دون اتصال.', 'error');
      window.dispatchEvent(new CustomEvent('mydan:pwa-error'));
    });
  }, { once: true });
}