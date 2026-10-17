import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/i18n';

export interface CompanySubscription {
  id: string;
  name: string;
  expires_at: string | null;
  license_type: string | null;
  is_active: boolean;
}

export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function useCompanySubscription() {
  const { supervisor } = useAuth();
  const companyId = supervisor?.company_id;
  const isSuperAdmin = supervisor?.role === 'super_admin';

  const query = useQuery({
    queryKey: ['company-subscription', companyId],
    enabled: !!companyId && !isSuperAdmin,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CompanySubscription | null> => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, expires_at, license_type, is_active')
        .eq('id', companyId!)
        .maybeSingle();

      if (error) {
        console.warn('Failed to load company subscription:', error);
        return null;
      }
      return data as CompanySubscription | null;
    },
  });

  if (isSuperAdmin) {
    return {
      isLoading: false,
      isLocked: false,
      isExpired: false,
      isInactive: false,
      daysRemaining: null,
      company: null,
      isSuperAdmin: true,
    };
  }

  const company = query.data;
  const daysRemaining = company?.expires_at ? daysUntil(company.expires_at) : null;
  const isInactive = company ? !company.is_active : false;
  const isExpired = daysRemaining !== null && daysRemaining <= 0;
  const isLocked = isInactive || isExpired;

  return {
    isLoading: query.isLoading,
    isLocked,
    isExpired,
    isInactive,
    daysRemaining,
    company,
    isSuperAdmin: false,
  };
}

export function SubscriptionLockedView({
  companyName,
  expiresAt,
  isInactive,
}: {
  companyName?: string | null;
  expiresAt?: string | null;
  isInactive?: boolean;
}) {
  const { signOut } = useAuth();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)',
        direction: 'rtl',
      }}
    >
      <div
        className="card col"
        style={{
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
          gap: 20,
          padding: '36px 28px',
          borderRadius: 20,
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.12)',
          background: '#fff',
        }}
      >
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: '50%',
            background: isInactive ? '#FEE2E2' : '#FEF3C7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 38,
            margin: '0 auto',
          }}
        >
          {isInactive ? '🚫' : '⏳'}
        </div>

        <div>
          <h2 style={{ margin: '0 0 8px', color: '#1E293B', fontSize: 22, fontWeight: 700 }}>
            {isInactive ? t('تم إيقاف حساب الشركة') : t('انتهت فترة اشتراك الشركة')}
          </h2>
          <p className="muted" style={{ lineHeight: 1.7, fontSize: 14, margin: 0 }}>
            {isInactive
              ? t('تم تعطيل حساب الشركة مؤقتاً من قبل إدارة المنصة. يرجى التواصل مع الدعم الفني لإعادة التفعيل.')
              : t('انتهت صلاحية باقة الاشتراك الخاصة بشركتكم. لتفادي انقطاع الخدمة ومواصلة العمل، يرجى التواصل مع إدارة النظام لتجديد الترخيص.')}
          </p>
        </div>

        <div
          style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            padding: 16,
            fontSize: 13,
            textAlign: 'start',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {companyName && (
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #EDF2F7', paddingBottom: 8 }}>
              <span style={{ color: '#64748B' }}>{t('الشركة:')}</span>
              <strong style={{ color: '#0F172A' }}>{companyName}</strong>
            </div>
          )}
          {expiresAt && !isInactive && (
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #EDF2F7', paddingBottom: 8 }}>
              <span style={{ color: '#64748B' }}>{t('تاريخ الانتهاء:')}</span>
              <strong style={{ color: '#DC2626' }}>{new Date(expiresAt).toLocaleDateString('ar-EG')}</strong>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748B' }}>{t('الحالة:')}</span>
            <span className={`badge ${isInactive ? 'badge-danger' : 'badge-warning'}`}>
              {isInactive ? t('معطّل') : t('منتهي الصلاحية')}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <button
            type="button"
            className="btn primary block"
            onClick={() => void signOut()}
            style={{ padding: '12px 20px', fontSize: 15 }}
          >
            {t('تسجيل الخروج')}
          </button>
        </div>
      </div>
    </div>
  );
}
