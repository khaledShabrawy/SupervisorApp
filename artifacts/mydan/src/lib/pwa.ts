import { notify } from './toast';

/** Detect Capacitor native shell without importing the package (avoids a Rollup resolution error in the web build). */
function isNativePlatform(): boolean {
  return typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function'
    && !!((window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform());
}

export function registerPwa(): void {
  // The APK ships its files locally; a service worker there would only pin stale builds.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || isNativePlatform()) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    }).catch(() => {
      notify('تعذر تفعيل تشغيل التطبيق دون اتصال.', 'error');
      window.dispatchEvent(new CustomEvent('mydan:pwa-error'));
    });
  }, { once: true });
}