import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useScope } from './data';

/** Screens an admin can switch off per supervisor (supervisor_permissions.screen_key). */
export const SCREENS = [
  { key: 'new_visit', label: 'زيارة جديدة', path: '/visits/new', byDefault: true },
  { key: 'shelf_audit', label: 'مراجعة الرف AI', path: '/shelf-audit', byDefault: true },
  { key: 'competitor_products', label: 'منتجات المنافسين', path: '/competitors', byDefault: true },
  { key: 'my_reports', label: 'تقاريري والأهداف', path: '/targets', byDefault: true },
  { key: 'notifications', label: 'الإشعارات', path: '/notifications', byDefault: true },
  { key: 'beat_plan', label: 'خطة المسار', path: '/beat-plan', byDefault: true },
  { key: 'field_survey', label: 'مسح ميداني AI', path: '/field-survey', byDefault: false },
] as const;
export type ScreenKey = typeof SCREENS[number]['key'];

export { isScreenAllowed } from './screen-permissions';
import { isScreenAvailable } from './screen-permissions';

export function useMyPermissions() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'my-permissions'], staleTime: 300_000, retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('supervisor_permissions').select('screen_key,is_enabled')
        .eq('supervisor_id', sc.supervisorId).eq('company_id', sc.companyId).abortSignal(signal);
      if (error || !Array.isArray(data) || data.some(row => !row || typeof row.screen_key !== 'string' || typeof row.is_enabled !== 'boolean')) {
        throw new Error('تعذر تحميل صلاحيات الشاشات.');
      }
      return data as { screen_key: string; is_enabled: boolean }[];
    },
  });
}

/** Returns true only when permissions are confirmed. Fails closed on load/error (security guardrail #2). */
export function useScreenAllowed(key: ScreenKey): boolean {
  const sc = useScope(); const q = useMyPermissions();
  return isScreenAvailable(q.data, sc.supervisor.role, key, !q.isPending && !q.isError);
}
