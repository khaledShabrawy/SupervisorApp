import { useState } from 'react';
import { useCompanySubscription } from '@/lib/subscription';
import { t } from '@/i18n';

export function TrialBanner() {
  const { isLoading, isLocked, daysRemaining, company, isSuperAdmin } = useCompanySubscription();
  const [dismissed, setDismissed] = useState(false);

  if (isSuperAdmin || isLoading || isLocked || !company?.expires_at || dismissed) {
    return null;
  }

  // Critical: 1-3 days — red banner, non-dismissable
  if (daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 3) {
    return (
      <div
        className="alert danger"
        style={{
          margin: '0 0 12px',
          borderRadius: 8,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          background: '#FEF2F2',
          borderColor: '#EF4444',
          boxShadow: '0 1px 4px rgba(239, 68, 68, 0.25)',
        }}
      >
        <span style={{ fontSize: 22 }}>🚨</span>
        <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
          <strong>{t('تنبيه عاجل — الاشتراك على وشك الانتهاء:')} </strong>
          <span>
            {daysRemaining === 1
              ? t('ينتهي اشتراك شركتكم {name} غداً! يرجى التواصل الفوري مع إدارة المنصة لتجديد الترخيص.', { name: company.name })
              : t('ينتهي اشتراك شركتكم {name} خلال {days} أيام فقط ({date}). التجديد الفوري ضروري لتفادي إيقاف الخدمة.', {
                  name: company.name,
                  days: daysRemaining,
                  date: new Date(company.expires_at).toLocaleDateString('ar-EG'),
                })}
          </span>
        </div>
      </div>
    );
  }

  // Urgent: 4-7 days — orange/warn banner
  if (daysRemaining !== null && daysRemaining > 3 && daysRemaining <= 7) {
    return (
      <div
        className="alert warn"
        style={{
          margin: '0 0 12px',
          borderRadius: 8,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          background: '#FFFBEB',
          borderColor: '#F59E0B',
          boxShadow: '0 1px 3px rgba(245, 158, 11, 0.2)',
        }}
      >
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
          <strong>{t('تنبيه تجديد الاشتراك:')} </strong>
          <span>
            {t('ينتهي اشتراك شركتكم {name} خلال {days} أيام ({date}). يرجى تجديد الترخيص لتجنب توقف الخدمة.', {
              name: company.name,
              days: daysRemaining,
              date: new Date(company.expires_at).toLocaleDateString('ar-EG'),
            })}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#92400E', padding: '0 4px', flexShrink: 0 }}
          aria-label={t('إخفاء التنبيه')}
        >×</button>
      </div>
    );
  }

  // Early warning: 8-14 days — blue/info banner (all license types)
  if (daysRemaining !== null && daysRemaining > 7 && daysRemaining <= 14) {
    return (
      <div
        style={{
          margin: '0 0 12px',
          borderRadius: 8,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '10px 14px',
          background: '#EFF6FF',
          border: '1px solid #93C5FD',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <span style={{ fontSize: 18 }}>🔔</span>
        <span style={{ flex: 1 }}>
          {company.license_type === 'trial'
            ? t('التجربة المجانية لشركة {name} تنتهي خلال {days} يوماً ({date}) — تواصل معنا لتفعيل اشتراكك', {
                name: company.name, days: daysRemaining,
                date: new Date(company.expires_at).toLocaleDateString('ar-EG'),
              })
            : t('تنبيه مبكر: ينتهي اشتراك شركتكم {name} خلال {days} يوماً ({date}). يُنصح ببدء إجراءات التجديد.', {
                name: company.name, days: daysRemaining,
                date: new Date(company.expires_at).toLocaleDateString('ar-EG'),
              })}
        </span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#1D4ED8', padding: '0 4px', flexShrink: 0 }}
          aria-label={t('إخفاء التنبيه')}
        >×</button>
      </div>
    );
  }

  return null;
}
