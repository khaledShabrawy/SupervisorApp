import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export function useRealtime(table: string, filter: string | undefined,
  callback: (payload?: RealtimePostgresChangesPayload<Record<string, unknown>>) => void) {
  const latest = useRef(callback);
  latest.current = callback;
  const [status, setStatus] = useState('CONNECTING');
  useEffect(() => {
    let alive = true;
    const channel = supabase.channel(`mydan:${table}:${filter ?? 'all'}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload) => latest.current(payload))
      .subscribe((state) => {
        if (!alive) return;
        setStatus(state);
        if (state === 'SUBSCRIBED') latest.current();
      });
    const refresh = () => latest.current();
    window.addEventListener('online', refresh);
    return () => { alive = false; window.removeEventListener('online', refresh); void supabase.removeChannel(channel); };
  }, [table, filter]);
  return status;
}