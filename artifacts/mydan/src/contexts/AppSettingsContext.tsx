import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { readableForeground, validateSettings } from '@/lib/policy';
import { useAuth } from './AuthContext';
import type { AppSettings } from '@/types/database';
import LoadingSpinner from '@/components/LoadingSpinner';
import { SETTINGS_COLUMNS } from '@/lib/columns';
import { t } from '@/i18n';

const Context = createContext<AppSettings | undefined>(undefined);
const publicCompanyId = (import.meta.env.VITE_PUBLIC_COMPANY_ID as string | undefined)?.trim();
// A public login shell is not an authorized company settings record.
const publicDefaults: AppSettings = {
  id: '', company_id: '', app_name: 'Mydan', logo_url: null, primary_color: '#1A56DB',
  success_color: '#108981', danger_color: '#EF4444', background_color: '#F8FAFC',
  geofence_radius_m: 100, target_brand_name: '', competitor_brands: [], ai_audit_enabled: false,
};
const properties = ['--color-primary', '--color-success', '--color-danger', '--color-bg', '--primary-foreground'];
export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const { supervisor, isAuthenticated, signOut } = useAuth();
  const companyId = supervisor?.company_id;
  const publicBrand = useQuery({
    queryKey: ['public-login-brand', publicCompanyId],
    enabled: !isAuthenticated && !!publicCompanyId,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('app_settings').select('company_id,app_name,logo_url')
        .eq('company_id', publicCompanyId!).abortSignal(signal).single();
      if (error || !data || data.company_id !== publicCompanyId || !data.app_name?.trim()
        || (data.logo_url && !/^https:\/\/[^\s]+$/.test(data.logo_url))) {
        throw new Error(t('تعذر تحميل هوية صفحة الدخول. تحقق من إعداد الشركة وصلاحية قراءة الاسم والشعار.'));
      }
      return { ...publicDefaults, company_id: data.company_id, app_name: data.app_name, logo_url: data.logo_url };
    },
    staleTime: 300_000, retry: 1,
  });
  const settings = useQuery({
    queryKey: ['company-settings', companyId],
    enabled: isAuthenticated && !!companyId,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('app_settings').select(SETTINGS_COLUMNS)
        .eq('company_id', companyId!).abortSignal(signal).single();
      if (error) throw new Error(t('تعذر تحميل إعدادات الشركة. تحقق من وجود إعداد واحد للشركة وسياسات Supabase.'));
      return validateSettings(data as AppSettings, companyId!);
    },
    staleTime: 300_000, retry: 1,
  });
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (settings.data && isAuthenticated) {
      const s = settings.data;
      [s.primary_color, s.success_color, s.danger_color, s.background_color, readableForeground(s.primary_color)]
        .forEach((color, i) => root.style.setProperty(properties[i], color));
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta) meta.content = s.primary_color;
    }
    return () => {
      properties.forEach((property) => root.style.removeProperty(property));
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta) meta.content = getComputedStyle(root).getPropertyValue('--color-primary').trim();
    };
  }, [settings.data, isAuthenticated]);
  if (!isAuthenticated) return <Context.Provider value={publicBrand.data ?? publicDefaults}>
    {publicBrand.isError && <div className="alert err" role="alert">{t(publicBrand.error.message)}</div>}
    {children}
  </Context.Provider>;
  if (settings.isPending) return <LoadingSpinner />;
  if (settings.isError) return <div className="settings-error" role="alert">
    <h1>{t('تعذر تحميل هوية الشركة')}</h1><p>{t(settings.error.message)}</p>
    <button onClick={() => void settings.refetch()}>{t('إعادة المحاولة')}</button>
    <button onClick={() => void signOut().catch(() => undefined)}>{t('تسجيل الخروج')}</button>
  </div>;
  return <Context.Provider value={settings.data}>{children}</Context.Provider>;
}
export function useAppSettings(): AppSettings {
  const settings = useContext(Context);
  if (!settings) throw new Error('Company settings are unavailable outside an authenticated company.');
  return settings;
}