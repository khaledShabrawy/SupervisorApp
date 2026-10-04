import { Workbox } from 'workbox-window';
import { notify } from './toast';

export function registerPwa(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const worker = new Workbox(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    });
    void worker.register().catch(() => {
      notify('تعذر تفعيل تشغيل التطبيق دون اتصال.', 'error');
      window.dispatchEvent(new CustomEvent('mydan:pwa-error'));
    });
  }, { once: true });
}