import { memo, useSyncExternalStore } from 'react';
import { getToasts, subscribeToasts, type ToastItem } from '@/lib/toast';

const Message = memo(function Message({ item }: { item: ToastItem }) {
  return <div className={`toast ${item.kind}`} role={item.kind === 'error' ? 'alert' : 'status'} dir="rtl">
    {item.msg}
  </div>;
});

export default function Toast() {
  const items = useSyncExternalStore(subscribeToasts, getToasts);
  return <div className="toasts" aria-label="تنبيهات التطبيق">
    {items.map(item => <Message key={item.id} item={item} />)}
  </div>;
}