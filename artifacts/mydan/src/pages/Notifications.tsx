import { useState } from 'react';
import { BellOff, CheckCheck } from '@/components/Icons';
import { useMarkRead, useNotifications } from '@/lib/data';
import { PageTitle } from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import { fmtDateTime } from '@/lib/format';

export default function Notifications() {
  const [unread, setUnread] = useState(false); const q = useNotifications(unread); const m = useMarkRead();
  return <div className="page">
    <PageTitle action={<button className="btn sm ghost" disabled={m.isPending} data-testid="button-read-all" onClick={() => m.mutate('all')}><CheckCheck size={18} /> قراءة الكل</button>}>الإشعارات</PageTitle>
    <div className="tabs"><button className={`chip ${!unread ? 'on' : ''}`} onClick={() => setUnread(false)}>الكل</button><button className={`chip ${unread ? 'on' : ''}`} onClick={() => setUnread(true)}>غير المقروءة</button></div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      : q.items.length === 0 ? <EmptyState icon={<BellOff />} title={unread ? 'لا إشعارات غير مقروءة' : 'لا توجد إشعارات'} />
      : <>{q.items.map((n) => <button key={n.id} className="card col" style={{ textAlign: 'start', font: 'inherit', cursor: 'pointer', minHeight: 44, borderInlineStart: n.is_read ? undefined : '5px solid var(--color-primary)', background: n.is_read ? '#fff' : '#F0F5FF' }}
        onClick={() => !n.is_read && m.mutate(n.id)} data-testid={`card-notification-${n.id}`}>
        <div className="row between"><span className="title">{n.title_ar}</span>{!n.is_read && <span className="badge b-blue">جديد</span>}</div>
        <div>{n.body_ar}</div><div className="muted">{fmtDateTime(n.created_at)}</div>
      </button>)}<LoadMore q={q} /></>}
  </div>;
}
