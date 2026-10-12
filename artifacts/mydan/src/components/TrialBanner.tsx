import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/i18n';

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function TrialBanner() {
  const { supervisor } = useAuth();
  const companyId = supervisor?.company_id;

  const { data } = useQuery({
    queryKey: ['company-trial', companyId],
    enabled: !!companyId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('companies')
        .select('expires_at, license_type, is_active')
        .eq('id', companyId!)
        .single();
      return data;
    },
  });

  if (!data?.expires_at) return null;

  const days = daysUntil(data.expires_at);

  // Company deactivated
  if (!data.is_active) {
    return (
      <div className="alert err" style={{ margin: '0 0 12px', borderRadius: 8 }}>
        {t('⛔ الحساب معطّل. تواصل مع الدعم لإعادة التفعيل.')}
      </div>
    );
  }

  // Expired
  if (days <= 0) {
    return (
      <div className="alert err" style={{ margin: '0 0 12px', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 18 }}>⏰</span>
        <span>{t('انتهت فترة التجربة. تواصل مع الدعم لتجديد الاشتراك.')}</span>
      </div>
    );
  }

  // Expiring soon (≤ 7 days) — trial or any license
  if (days <= 7) {
    const isTrial = data.license_type === 'trial';
    return (
      <div className="alert warn" style={{ margin: '0 0 12px', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 18 }}>🕐</span>
        <span>
          {isTrial
            ? t('التجربة المجانية تنتهي خلال {days} أيام — تواصل معنا لتفعيل اشتراكك', { days })
            : t('الترخيص ينتهي خلال {days} أيام', { days })}
        </span>
      </div>
    );
  }

  return null;
}
