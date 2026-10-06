import { t } from '@/i18n';

export default function LoadingSpinner() {
  return <div className="loading-screen" role="status" aria-live="polite">
    <span className="loading-spinner" aria-hidden="true" /><p>{t('جاري التحميل...')}</p>
  </div>;
}
