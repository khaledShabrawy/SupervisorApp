import { useAuth } from '@/contexts/AuthContext';
import { sessionIdentity } from './session-identity';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import type { Supervisor } from '@/types/database';
import { notify } from './toast';
import { useScope } from './data';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDeviceId } from './device-identity';
export { getDeviceId } from './device-identity';

export type DeviceBindingStatus =
  | { status: 'checking' }
  | { status: 'ok' }
  | { status: 'locked'; registeredDeviceId: string; currentDeviceId: string }
  | { status: 'error'; message: string };

export function useDeviceBinding(supervisor: Supervisor | null) {
  const {session} = useAuth();
  const [attempt, setAttempt] = useState(0);
  const scope = supervisor ? `${sessionIdentity(session?.access_token)}:${supervisor.id}:${supervisor.company_id}:${supervisor.role}:${supervisor.device_id ?? ''}` : '';
  const [state, setState] = useState<{ scope: string; result: DeviceBindingStatus }>({ scope: '', result: { status: 'checking' } });
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    let alive = true;
    const finish = (result: DeviceBindingStatus) => { if (alive) setState({ scope, result }); };
    if (!supervisor || ['admin', 'super_admin'].includes(supervisor.role)) { finish({ status: 'ok' }); return; }
    finish({ status: 'checking' });
    void (async () => {
      try {
        const deviceId = getDeviceId();
        if (supervisor.device_id && supervisor.device_id !== deviceId) {
          finish({ status: 'locked', registeredDeviceId: '', currentDeviceId: '' }); return;
        }
        const { data, error } = await supabase.rpc('mdn_bind_device_v1', { p_supervisor_id: supervisor.id, p_device_id: deviceId });
        if (error || data !== true) throw new Error('تعذر اعتماد الجهاز. أعد المحاولة أو تواصل مع مسؤول الشركة.');
        finish({ status: 'ok' });
      } catch (error) { finish({ status: 'error', message: error instanceof Error ? error.message : 'تعذر التحقق من الجهاز.' }); }
    })();
    return () => { alive = false; };
  }, [scope, attempt]);
  return { ...(state.scope === scope ? state.result : { status: 'checking' as const }), retry };
}

export function useResetDeviceBinding() {
  const qc = useQueryClient(), sc = useScope();
  return useMutation({
    mutationFn: async (supervisorId: string) => {
      const { data, error } = await supabase.rpc('mdn_reset_device_v1', { p_supervisor_id: supervisorId });
      if (error || data !== true) throw new Error('تعذر إلغاء اقتران الجهاز.');
    },
    onSuccess: () => {
      notify('تم إلغاء اقتران الجهاز. يمكن تسجيل جهاز جديد.', 'success');
      void qc.invalidateQueries({ queryKey: ['mydan', sc.companyId] });
    },
    onError: (error: Error) => notify(error.message, 'error'),
  });
}
