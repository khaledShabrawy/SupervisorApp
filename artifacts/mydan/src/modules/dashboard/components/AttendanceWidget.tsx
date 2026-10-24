import { useState } from 'react';
import { CheckCircle2, Clock, LocateFixed, LogIn, LogOut, ShieldAlert, ShieldCheck, X } from '@/components/Icons';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useAttendanceToday } from '@/lib/screen-data';
import { useAttendanceAction } from '@/lib/data';
import { fmtDate, fmtTime, num, todayStr } from '@/lib/format';
import { t } from '@/i18n';
import type { Attendance } from '@/types/database';

export function AttendanceWidget() {
  const { data: att, isPending } = useAttendanceToday();
  const action = useAttendanceAction();
  const busy = action.isPending;
  const gps = useGeolocation();
  const [confirmKind, setConfirmKind] = useState<'in' | 'out' | null>(null);

  if (isPending) {
    return (
      <div className="card" style={{ padding: '12px 16px', marginBottom: 8 }}>
        <div className="skel" style={{ height: 36 }} />
      </div>
    );
  }

  const checkedIn = !!att?.check_in_time;
  const checkedOut = !!att?.check_out_time;

  const modal = confirmKind && (
    <div className="adm-modal-bg" onClick={() => setConfirmKind(null)} style={{ zIndex: 1000 }}>
      <div className="adm-modal col" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360, gap: 16 }}>
        <div className="row between">
          <h3 style={{ margin: 0, fontSize: 16 }}>
            {confirmKind === 'in' ? t('تأكيد الحضور') : t('تأكيد الانصراف')}
          </h3>
          <button type="button" className="icon-btn" onClick={() => setConfirmKind(null)}>
            <X size={18} />
          </button>
        </div>
        <div className="muted" style={{ fontSize: 14 }}>
          {confirmKind === 'in' ? t('هل أنت متأكد من تسجيل الحضور الآن؟') : t('هل أنت متأكد من تسجيل الانصراف الآن؟')}
        </div>
        <div className="alert info" style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Clock size={16} />
          <span>{fmtDate(todayStr())}</span>
        </div>
        {confirmKind === 'in' && (
          <div style={{ marginTop: -4 }}>
            {gps.isMock ? (
              <div className="alert err" role="alert" style={{ fontSize: 13, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
                <ShieldAlert size={16} />
                <span>{gps.mockWarning || t('تم رصد تزييف موقع (Fake GPS). لا يُسمح بتسجيل الحضور بموقع وهمي.')}</span>
              </div>
            ) : gps.loading ? (
              <div className="alert warn" role="status" style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                <Clock size={16} />
                <span>{t('جاري تحديد موقع GPS الحقيقي...')}</span>
              </div>
            ) : gps.latitude != null ? (
              <div className="alert ok" role="status" style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                <ShieldCheck size={16} />
                <span>{t('تم تأكيد موقع GPS بنجاح (دقة {d} م)', { d: num(Math.round(gps.accuracy ?? 0)) })}</span>
              </div>
            ) : (
              <div className="alert err" role="alert" style={{ fontSize: 13 }}>
                <div>{gps.error || t('يلزم تفعيل الـ GPS لتسجيل الحضور.')}</div>
                <button type="button" className="btn ghost sm" onClick={gps.retry} style={{ marginTop: 4 }}>
                  <LocateFixed size={14} /> {t('إعادة تحديد الموقع')}
                </button>
              </div>
            )}
          </div>
        )}
        <div className="row gap-2" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" className="btn ghost sm" onClick={() => setConfirmKind(null)}>
            {t('إلغاء')}
          </button>
          <button
            type="button"
            className={`btn sm ${confirmKind === 'in' ? 'primary' : 'danger'}`}
            disabled={busy || (confirmKind === 'in' && (gps.isMock || gps.latitude == null))}
            onClick={() => {
              const kind = confirmKind;
              setConfirmKind(null);
              action.mutate({
                kind,
                row: kind === 'out' ? (att as Attendance) : null,
                lat: kind === 'in' ? gps.latitude : null,
                lng: kind === 'in' ? gps.longitude : null,
              });
            }}
          >
            {confirmKind === 'in' ? t('تأكيد الحضور') : t('تأكيد الانصراف')}
          </button>
        </div>
      </div>
    </div>
  );

  if (checkedOut) {
    return (
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          marginBottom: 8,
          background: 'var(--color-success,#108981)',
          color: '#fff',
        }}
      >
        <CheckCircle2 size={20} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{t('تم إكمال يوم العمل اليوم')}</span>
        <span style={{ marginRight: 'auto', fontSize: 12, opacity: 0.85 }}>
          {fmtTime(att!.check_in_time)} — {fmtTime(att!.check_out_time)}
        </span>
      </div>
    );
  }

  if (checkedIn) {
    return (
      <>
        {modal}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 8 }}>
          <Clock size={18} style={{ color: 'var(--color-primary,#1A56DB)', flexShrink: 0 }} />
          <div style={{ flexGrow: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t('تم تسجيل الحضور')}</div>
            <div className="muted" style={{ fontSize: 12 }}>{fmtTime(att!.check_in_time)}</div>
          </div>
          <button
            className="btn sm danger"
            disabled={busy}
            onClick={() => setConfirmKind('out')}
            style={{ whiteSpace: 'nowrap' }}
          >
            <LogOut size={15} /> {t('تسجيل انصراف')}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {modal}
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          marginBottom: 8,
          borderRight: '4px solid var(--color-warning,#F59E0B)',
        }}
      >
        <LogIn size={18} style={{ color: 'var(--color-warning,#F59E0B)', flexShrink: 0 }} />
        <div style={{ flexGrow: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{t('لم تسجل حضورك اليوم')}</div>
          <div className="muted" style={{ fontSize: 12 }}>{fmtDate(todayStr())}</div>
        </div>
        <button
          className="btn sm primary"
          disabled={busy}
          onClick={() => setConfirmKind('in')}
          style={{ whiteSpace: 'nowrap' }}
        >
          <LogIn size={15} /> {t('تسجيل حضور')}
        </button>
      </div>
    </>
  );
}
