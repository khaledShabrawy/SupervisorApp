import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useScope } from './data';

export { SCREENS, isScreenAllowed } from './screen-policy';
export type { ScreenKey } from './screen-policy';
import { isScreenAllowed, type ScreenKey } from './screen-policy';

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

/** Returns true only when permissions are confirmed. Fails closed on load/error (security guardrail #2). */
export function useScreenAllowed(key: ScreenKey): boolean {
  const sc = useScope(); const q = useMyPermissions();
  if (sc.isAdmin) return true;
  if (!q.data) return false;
  return isScreenAllowed(q.data, key);
}
