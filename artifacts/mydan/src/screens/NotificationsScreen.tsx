import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, BellOff, CheckCheck, MapPin, Target } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useMarkRead, useNotifications } from '@/lib/data';
import { relativeArabicTime } from '@/lib/screen-helpers';
import { PageTitle } from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import { ErrorState, LoadMore, SkeletonList } from '@/components/States';
import { Chip, useMinuteTick, useRefetch } from './shared';
import type { Notification } from '@/types/database';
import { t } from '@/i18n';
import { usePushSubscription, VAPID_PUBLIC } from '@/lib/push';

const Item = memo(function Item({
  n,
  fresh,
  now,
  onRead,
  onAction,
}: {
  n: Notification;
  fresh: boolean;
  now: number;
  onRead: (id: string) => void;
  onAction: (path: string) => void;
}) {
  const click = useCallback(() => {
    if (!n.is_read) onRead(n.id);
  }, [n.is_read, n.id, onRead]);

  const isBeat = n.type === 'beat_plan_update';
  const isTarget = n.type === 'target_update';
  const isOor = n.type === 'oor_visit';
  const isOos = n.type === 'oos_critical';

  const borderColor = isOos ? '#EF4444' : isOor ? '#F59E0B' : isBeat ? '#3B82F6' : isTarget ? '#10B981' : 'var(--color-border)';

  return (
    <div
      className={`card col ${n.is_read ? '' : 's-unread'} ${fresh ? 's-slide' : ''}`}
      style={{
        textAlign: 'start',
        borderRight: `4px solid ${borderColor}`,
        minHeight: 44,
        padding: '12px 14px',
        gap: 6,
      }}
      data-testid={`card-notification-${n.id}`}
      onClick={click}
    >
      <div className="row between items-center" style={{ gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          {isBeat && <MapPin size={16} color="#3B82F6" />}
          {isTarget && <Target size={16} color="#10B981" />}
          {isOor && <AlertTriangle size={16} color="#F59E0B" />}
          {isOos && <AlertTriangle size={16} color="#EF4444" />}
          {!isBeat && !isTarget && !isOor && !isOos && <Bell size={16} color="var(--color-primary)" />}
          <span className="title" style={{ fontSize: 14.5, fontWeight: n.is_read ? 600 : 700 }}>
            {n.title_ar}
          </span>
        </div>
        {!n.is_read && <span className="badge b-blue" style={{ fontSize: 10 }}>{t('جديد')}</span>}
      </div>

      <div style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.5 }}>
        {n.body_ar}
      </div>

      <div className="row between items-center" style={{ marginTop: 4 }}>
        <span className="muted" style={{ fontSize: 11.5 }}>
          {relativeArabicTime(n.created_at, now)}
        </span>

        {isBeat && (
          <button
            type="button"
            className="btn sm"
            style={{ fontSize: 11.5, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={(e) => {
              e.stopPropagation();
              if (!n.is_read) onRead(n.id);
              onAction('/beat-plan');
            }}
          >
            <MapPin size={12} /> {t('عرض خط السير')}
          </button>
        )}

        {isTarget && (
          <button
            type="button"
            className="btn sm"
            style={{ fontSize: 11.5, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, background: '#10B981' }}
            onClick={(e) => {
              e.stopPropagation();
              if (!n.is_read) onRead(n.id);
              onAction('/targets');
            }}
          >
            <Target size={12} /> {t('عرض الأهداف')}
          </button>
        )}
      </div>
    </div>
  );
});

function PushBanner() {
  const { state, subscribe, unsubscribe } = usePushSubscription();
  if (!('Notification' in window) || !VAPID_PUBLIC) return null;
  if (state === 'subscribed') {
    return (
      <div
        className="card row"
        style={{
          gap: 10,
          fontSize: 14,
          background: 'var(--color-success-light, #dcfce7)',
          color: 'var(--color-success, #16a34a)',
          border: 'none',
        }}
      >
        <Bell size={18} />
        <span style={{ flex: 1 }}>{t('الإشعارات الفورية مفعّلة')}</span>
        <button className="btn sm ghost" style={{ fontSize: 12 }} onClick={() => void unsubscribe()}>
          {t('إلغاء')}
        </button>
      </div>
    );
  }
  if (state === 'denied') return null;
  return (
    <button
      className="card row"
      style={{
        gap: 10,
        fontSize: 14,
        cursor: 'pointer',
        textAlign: 'start',
        font: 'inherit',
        border: '1.5px dashed var(--color-border)',
      }}
      onClick={() => void subscribe()}
      disabled={state === 'loading'}
    >
      <Bell size={18} style={{ color: 'var(--color-primary)' }} />
      <span style={{ flex: 1 }}>
        {state === 'loading' ? t('جاري التفعيل...') : t('فعّل إشعارات الجوال لتصلك الرسائل فوراً')}
      </span>
    </button>
  );
}

export default function NotificationsScreen() {
  const { supervisor } = useAuth();
  const settings = useAppSettings();
  const now = useMinuteTick();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'all' | 'unread' | 'plans' | 'admin'>('all');

  const onTab = useCallback((v: string) => setTab(v as any), []);
  const q = useNotifications(tab === 'unread');
  const m = useMarkRead();
  const retry = useRefetch(q.refetch);
  const seen = useRef<Set<string> | null>(null);
  const fresh = new Set<string>();

  if (!q.isPending && !q.isError) {
    if (seen.current === null) seen.current = new Set(q.items.map((n) => n.id));
    else for (const n of q.items) if (!seen.current.has(n.id)) fresh.add(n.id);
  }

  const mark = m.mutate;
  const onRead = useCallback((id: string) => mark(id), [mark]);
  const all = useCallback(() => mark('all'), [mark]);
  const onAction = useCallback((path: string) => navigate(path), [navigate]);

  const filteredItems = useMemo(() => {
    if (tab === 'plans') {
      return q.items.filter((n) => n.type === 'beat_plan_update' || n.type === 'target_update');
    }
    if (tab === 'admin') {
      return q.items.filter((n) => n.type === 'admin_message');
    }
    return q.items;
  }, [q.items, tab]);

  return (
    <div className="page" aria-label={settings.app_name} data-role={supervisor?.role}>
      <PageTitle
        action={
          <button className="btn sm ghost" disabled={m.isPending} data-testid="button-read-all" onClick={all}>
            <CheckCheck size={18} /> {t('تحديد الكل كمقروء')}
          </button>
        }
      >
        {t('الإشعارات')}
      </PageTitle>

      <PushBanner />

      <div className="tabs" style={{ flexWrap: 'wrap', gap: 6 }}>
        <Chip value="all" label={t('الكل')} active={tab === 'all'} onSelect={onTab} />
        <Chip value="unread" label={t('غير المقروءة')} active={tab === 'unread'} onSelect={onTab} />
        <Chip value="plans" label={t('الخطط والأهداف 🎯')} active={tab === 'plans'} onSelect={onTab} />
        <Chip value="admin" label={t('رسائل الإدارة 📢')} active={tab === 'admin'} onSelect={onTab} />
      </div>

      {q.isPending ? (
        <SkeletonList />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={retry} />
      ) : filteredItems.length === 0 ? (
        <EmptyState icon={<BellOff />} title={t('لا توجد إشعارات')} />
      ) : (
        <>
          {filteredItems.map((n) => (
            <Item key={n.id} n={n} fresh={fresh.has(n.id)} now={now} onRead={onRead} onAction={onAction} />
          ))}
          <LoadMore q={q} />
        </>
      )}
    </div>
  );
}
