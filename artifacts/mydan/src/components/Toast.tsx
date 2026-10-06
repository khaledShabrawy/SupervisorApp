import { memo, useSyncExternalStore } from 'react';
import { getToasts, subscribeToasts, type ToastItem } from '@/lib/toast';
import { t } from '@/i18n';

const Message = memo(function Message({ item }: { item: ToastItem }) {
  return <div className={`toast ${item.kind}`} role={item.kind === 'error' ? 'alert' : 'status'}>
    {t(item.msg)}
  </div>;
});

export default function Toast() {
  const items = useSyncExternalStore(subscribeToasts, getToasts);
  return <div className="toasts" aria-label={t('تنبيهات التطبيق')}>
    {items.map(item => <Message key={item.id} item={item} />)}
  </div>;
}