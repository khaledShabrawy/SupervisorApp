import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Supervisor } from '@/types/database';
import { notify } from '@/lib/toast';
import { useScope } from '@/lib/data';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { t } from '@/i18n';

const DEVICE_STORAGE_KEY = 'mydan_device_uuid';

/**
 * Returns or generates a persistent, unique device identifier for this mobile / browser installation.
 */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!id) {
      id = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'dev-' + Math.random().toString(36).substring(2, 12) + '-' + Date.now().toString(36);
      localStorage.setItem(DEVICE_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return 'temp-device-' + Date.now();
  }
}

export type DeviceBindingStatus =
  | { status: 'checking' }
  | { status: 'ok' }
  | { status: 'error' }
  | { status: 'locked'; registeredDeviceId: string; currentDeviceId: string };

/**
 * Hook to enforce single-device binding for field supervisors.
 * Super admins and web admins are exempt to allow office dashboard management.
 */
export function useDeviceBinding(supervisor: Supervisor | null) {
  const [binding, setBinding] = useState<DeviceBindingStatus>({ status: 'checking' });

  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    let alive = true;
    if (!supervisor || ['super_admin', 'admin'].includes(supervisor.role)) {
      setBinding({ status: 'ok' });
      return;
    }
    const currentDeviceId = getDeviceId();
    const resolve = (registeredDeviceId: string) => {
      if (!alive) return;
      setBinding(registeredDeviceId === currentDeviceId
        ? { status: 'ok' }
        : { status: 'locked', registeredDeviceId, currentDeviceId });
    };
    if (supervisor.device_id) {
      resolve(supervisor.device_id);
    } else {
      setBinding({ status: 'checking' });
      void (async () => {
        try {
          const { error } = await supabase.rpc('mdn_bind_device_v1', {
            p_supervisor_id: supervisor.id, p_device_id: currentDeviceId,
          });
          if (error) throw error;
          const { data, error: readError } = await supabase.from('supervisors').select('device_id')
            .eq('id', supervisor.id).eq('company_id', supervisor.company_id).single();
          if (readError || !data?.device_id) throw readError ?? new Error('Device binding not confirmed');
          resolve(data.device_id);
        } catch {
          if (alive) setBinding({ status: 'error' });
        }
      })();
    }
    return () => { alive = false; };
  }, [supervisor, attempt]);

  return { ...binding, retry };
}

/**
 * Mutation for admins to reset device binding, allowing a supervisor to bind a new device.
 */
export function useResetDeviceBinding() {
  const qc = useQueryClient();
  const sc = useScope();
  return useMutation({
    mutationFn: async (supervisorId: string) => {
      const { error } = await supabase.rpc('admin_update_supervisor', {
        p_supervisor_id: supervisorId, p_reset_device: true,
      });
      if (error) throw new Error(error.message || t('تعذر إلغاء اقتران الجهاز.'));
    },
    onSuccess: () => {
      notify(t('تم إلغاء اقتران الجهاز بنجاح. يمكن للمشرف الآن تسجيل الدخول من جهاز جديد.'), 'success');
      void qc.invalidateQueries({ queryKey: ['mydan'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
