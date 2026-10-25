import { useEffect, useState } from 'react';
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
  | { status: 'locked'; registeredDeviceId: string; currentDeviceId: string };

/**
 * Hook to enforce single-device binding for field supervisors.
 * Super admins and web admins are exempt to allow office dashboard management.
 */
export function useDeviceBinding(supervisor: Supervisor | null) {
  const [binding, setBinding] = useState<DeviceBindingStatus>({ status: 'checking' });

  useEffect(() => {
    if (!supervisor) {
      setBinding({ status: 'ok' });
      return;
    }

    // Admins and super_admins can log in on multiple workstations/dashboards
    if (supervisor.role === 'super_admin' || supervisor.role === 'admin') {
      setBinding({ status: 'ok' });
      return;
    }

    const currentDeviceId = getDeviceId();

    // 1. If supervisor is not bound yet, bind via SECURITY DEFINER RPC.
    //    The function only succeeds when device_id IS NULL in the database,
    //    preventing a supervisor from re-binding by clearing localStorage.
    if (!supervisor.device_id) {
      void supabase
        .rpc('mdn_bind_device_v1', { p_supervisor_id: supervisor.id, p_device_id: currentDeviceId })
        .then(({ error }) => {
          if (error) console.warn('Could not auto-bind device:', error);
          setBinding({ status: 'ok' });
        });
      return;
    }

    // 2. If already bound and matches
    if (supervisor.device_id === currentDeviceId) {
      setBinding({ status: 'ok' });
      return;
    }

    // 3. Device mismatch: locked!
    setBinding({
      status: 'locked',
      registeredDeviceId: supervisor.device_id,
      currentDeviceId,
    });
  }, [supervisor]);

  return binding;
}

/**
 * Mutation for admins to reset device binding, allowing a supervisor to bind a new device.
 */
export function useResetDeviceBinding() {
  const qc = useQueryClient();
  const sc = useScope();
  return useMutation({
    mutationFn: async (supervisorId: string) => {
      const { error } = await supabase
        .from('supervisors')
        .update({ device_id: null })
        .eq('id', supervisorId)
        .eq('company_id', sc.companyId);
      if (error) throw new Error(error.message || t('تعذر إلغاء اقتران الجهاز.'));
    },
    onSuccess: () => {
      notify(t('تم إلغاء اقتران الجهاز بنجاح. يمكن للمشرف الآن تسجيل الدخول من جهاز جديد.'), 'success');
      void qc.invalidateQueries({ queryKey: ['mydan'] });
    },
    onError: (e: Error) => notify(e.message, 'error'),
  });
}
