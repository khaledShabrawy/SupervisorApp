import { useCompanySubscription } from '@/lib/subscription';
import { t } from '@/i18n';

export function TrialBanner() {
  const { isLoading, isLocked, daysRemaining, company, isSuperAdmin } = useCompanySubscription();

  if (isSuperAdmin || isLoading || isLocked || !company?.expires_at) {
    return null;
  }

  // Urgent expiry warning (≤ 5 days)
  if (daysRemaining !== null && daysRemaining <= 5 && daysRemaining > 0) {
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
            {daysRemaining === 1
              ? t('ينتهي اشتراك شركتكم غداً! يرجى التواصل لتجديد الباقة لتفادي توقف الخدمة عن المشرفين.')
              : t('ينتهي اشتراك شركتكم خلال {days} أيام ({date}). يرجى تجديد الترخيص لتجنب توقف الخدمة.', {
                  days: daysRemaining,
                  date: new Date(company.expires_at).toLocaleDateString('ar-EG'),
                })}
          </span>
        </div>
      </div>
    );
  }

  // Expiring trial (≤ 14 days)
  if (daysRemaining !== null && daysRemaining > 5 && daysRemaining <= 14 && company.license_type === 'trial') {
    return (
      <div
        className="alert warn"
        style={{
          margin: '0 0 12px',
          borderRadius: 8,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 18 }}>🕐</span>
        <span style={{ fontSize: 13 }}>
          {t('التجربة المجانية تنتهي خلال {days} يوماً — تواصل معنا لتفعيل اشتراكك', { days: daysRemaining })}
        </span>
      </div>
    );
  }

  return null;
}
