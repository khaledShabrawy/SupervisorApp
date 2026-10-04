import { memo, useCallback, useRef, useState } from 'react';
import { BellOff, CheckCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useMarkRead, useNotifications } from '@/lib/data';
import { relativeArabicTime } from '@/lib/screen-helpers';
import { PageTitle } from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import { Chip, useMinuteTick, useRefetch } from './shared';
import type { Notification } from '@/types/database';

const Item = memo(function Item({ n, fresh, now, onRead }: { n: Notification; fresh: boolean; now: number; onRead: (id: string) => void }) {
  const click = useCallback(() => { if (!n.is_read) onRead(n.id); }, [n.is_read, n.id, onRead]);
  return <button className={`card col ${n.is_read ? '' : 's-unread'} ${fresh ? 's-slide' : ''}`} style={{ textAlign: 'start', font: 'inherit', cursor: 'pointer', minHeight: 44 }} onClick={click} data-testid={`card-notification-${n.id}`}>
    <div className="row between"><span className="title">{n.title_ar}</span>{!n.is_read && <span className="badge b-blue">جديد</span>}</div>
    <div>{n.body_ar}</div><div className="muted">{relativeArabicTime(n.created_at, now)}</div>
  </button>;
});
export default function NotificationsScreen() {
  const { supervisor } = useAuth(); const settings = useAppSettings(); const now = useMinuteTick();
  const [unread, setUnread] = useState(false); const onTab = useCallback((v: string) => setUnread(v === 'unread'), []); const q = useNotifications(unread); const m = useMarkRead(); const retry = useRefetch(q.refetch);
  const seen = useRef<Set<string> | null>(null);
  const fresh = new Set<string>();
  if (!q.isPending && !q.isError) {
    if (seen.current === null) seen.current = new Set(q.items.map((n) => n.id));
    else for (const n of q.items) if (!seen.current.has(n.id)) fresh.add(n.id);
  }
  const mark = m.mutate;
  const onRead = useCallback((id: string) => mark(id), [mark]);
  const all = useCallback(() => mark('all'), [mark]);
  return <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
    <PageTitle action={<button className="btn sm ghost" disabled={m.isPending} data-testid="button-read-all" onClick={all}><CheckCheck size={18} /> تحديد الكل كمقروء</button>}>الإشعارات</PageTitle>
    <div className="tabs"><Chip value="all" label="الكل" active={!unread} onSelect={onTab} /><Chip value="unread" label="غير المقروءة" active={unread} onSelect={onTab} /></div>
    {q.isPending ? <SkeletonList /> : q.isError ? <ErrorState error={q.error} onRetry={retry} />
      : q.items.length === 0 ? <EmptyState icon={<BellOff />} title="لا توجد إشعارات" />
      : <>{q.items.map((n) => <Item key={n.id} n={n} fresh={fresh.has(n.id)} now={now} onRead={onRead} />)}<LoadMore q={q} /></>}
  </div>;
}
