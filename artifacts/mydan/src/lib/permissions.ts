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
  { key: 'beat_plan', label: 'خطة المسار', path: '/beat-plan', byDefault: false },
] as const;
export type ScreenKey = typeof SCREENS[number]['key'];

/**
 * A screen is blocked only by an explicit is_enabled=false row. Accounts created
 * before permissions existed have no rows and keep full access; invites write
 * the defaults above as explicit rows.
 */
export function isScreenAllowed(rows: { screen_key: string; is_enabled: boolean }[], key: ScreenKey): boolean {
  return rows.find((r) => r.screen_key === key)?.is_enabled !== false;
}

export function useMyPermissions() {
  const sc = useScope();
  return useQuery({
    queryKey: [...sc.base, 'my-permissions'], staleTime: 300_000, retry: 1,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('supervisor_permissions').select('screen_key,is_enabled')
        .eq('supervisor_id', sc.supervisorId).eq('company_id', sc.companyId).abortSignal(signal);
      if (error) throw new Error('تعذر تحميل صلاحيات الشاشات.');
      return data as { screen_key: string; is_enabled: boolean }[];
    },
  });
}

/** True while loading or on error, so a flaky read never locks a supervisor out mid-visit. */
export function useScreenAllowed(key: ScreenKey): boolean {
  const sc = useScope(); const q = useMyPermissions();
  if (sc.isAdmin || !q.data) return true;
  return isScreenAllowed(q.data, key);
}
