import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  ClipboardList,
  GraduationCap,
  MapPin,
  Plus,
  Route,
  ScanSearch,
  Target as TargetIcon,
} from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useRealtime } from '@/hooks/useRealtime';
import { canAdmin } from '@/lib/policy';
import { useScreenAllowed } from '@/lib/permissions';
import { useScreenDashboard } from '@/lib/screen-data';
import { KPICard } from '@/components/KPICard';
import EmptyState from '@/components/EmptyState';
import { ErrorState } from '@/components/States';
import { PageTitle } from '@/components/Layout';
import { fmtDate, num, todayStr } from '@/lib/format';
import { Act, useRefetch } from '@/screens/shared';
import { t } from '@/i18n';
import { AttendanceWidget } from '../components/AttendanceWidget';
import { RecentVisitItem } from '../components/RecentVisitItem';

export default function DashboardScreen() {
  const nav = useNavigate();
  const { supervisor } = useAuth();
  const settings = useAppSettings();
  const q = useScreenDashboard();
  const d = q.data;
  const L = q.isPending;
  const admin = canAdmin(supervisor);
  const fieldSurveyAllowed = useScreenAllowed('field_survey');
  const retry = useRefetch(q.refetch);

  useRealtime(
    'visits',
    supervisor
      ? admin
        ? `company_id=eq.${supervisor.company_id}`
        : `supervisor_id=eq.${supervisor.id}`
      : undefined,
    retry
  );

  const go = useCallback((p: string) => nav(p), [nav]);
  const goNew = useCallback(() => nav('/visits/new'), [nav]);
  const open = useCallback(() => nav('/visits'), [nav]);
  const recent = useMemo(() => d?.recent.slice(0, 5) ?? [], [d?.recent]);

  return (
    <div className="page field-dashboard" aria-label={settings.app_name} data-role={supervisor?.role}>
      <div className="field-greeting">
        <p className="field-date">{fmtDate(todayStr())}</p>
        <h2>{t('أهلًا، {name}', { name: supervisor?.full_name.split(' ')[0] ?? '' })}</h2>
        <p>{t('كل ما تحتاجه ليومك في الميدان.')}</p>
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={retry} />
      ) : (
        <>
          <AttendanceWidget />
          <div className="s-kpis">
            <KPICard icon={<MapPin size={18} />} title={t('زيارات اليوم')} value={d && num(d.visits)} loading={L} />
            <KPICard
              icon={<Camera size={18} />}
              title={t('مراجعات الرف')}
              value={d && num(d.audits)}
              loading={L}
              color="var(--color-primary)"
            />
            <KPICard
              icon={<TargetIcon size={18} />}
              title={t('إنجاز الزيارات')}
              value={d && `${num(Math.round(d.visitsProgress))}%`}
              loading={L}
              color="var(--color-success)"
            />
          </div>

          <Act id="/visits/new" onAct={go} className="field-primary-action" testId="button-new-visit">
            <span className="field-primary-icon"><Plus size={25} /></span>
            <span><strong>{t('زيارة جديدة')}</strong><small>{t('ابدأ الزيارة وسجل نتائجها')}</small></span>
            <MapPin size={22} />
          </Act>
          <h3 className="field-section-label">{t('أدواتك الميدانية')}</h3>
          <div className="field-tools">
            <Act id="/shelf-audit" onAct={go} className="field-tool"><Camera size={23} /><span>{t('مراجعة الرف')}</span></Act>
            <Act id="/beat-plan" onAct={go} className="field-tool"><Route size={23} /><span>{t('خطة الزيارات')}</span></Act>
            <Act id="/training" onAct={go} className="field-tool"><GraduationCap size={23} /><span>{t('أكاديمية التدريب')}</span></Act>
            {fieldSurveyAllowed && <Act id="/field-survey" onAct={go} className="field-tool"><ScanSearch size={23} /><span>{t('مسح ميداني')}</span></Act>}
          </div>

          <PageTitle>{t('آخر الزيارات')}</PageTitle>
          {L ? (
            <div className="skel" style={{ height: 70 }} />
          ) : d!.recent.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<ClipboardList />}
                title={t('لا توجد زيارات بعد')}
                action={{ label: t('بدء زيارة'), onClick: goNew }}
              />
            </div>
          ) : (
            recent.map((v) => <RecentVisitItem key={v.id} v={v} onOpen={open} />)
          )}
        </>
      )}
    </div>
  );
}
