import { Capacitor } from '@capacitor/core';
import { notify } from './toast';
export function registerPwa(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || Capacitor.isNativePlatform()) return;
  const register = () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope:import.meta.env.BASE_URL })
      .then(registration => {
        void registration.update().catch(() => {});
        const inform = () => notify('تحديث جديد جاهز. احفظ عملك ثم أغلق نوافذ ميدان وأعد فتح التطبيق لتطبيقه.', 'info');
        if (registration.waiting) inform();
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) inform();
          });
        });
      }).catch(() => {
        notify('تعذر تفعيل تخزين واجهة التطبيق. العمليات المحفوظة على الجهاز لا تُحذف.', 'error');
        window.dispatchEvent(new CustomEvent('mydan:pwa-error'));
      });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, {once:true});
}
