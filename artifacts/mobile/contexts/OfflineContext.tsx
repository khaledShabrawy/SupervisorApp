/**
 * OfflineContext — tracks network state and drives automatic queue sync.
 *
 * Exposes:
 *   isOnline       — current connectivity status
 *   pendingCount   — items waiting in the offline queue
 *   isSyncing      — sync in progress
 *   syncNow()      — manually trigger a sync attempt
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { getPendingCount, processQueue } from '@/lib/offlineQueue';

interface OfflineContextType {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  syncNow: () => Promise<void>;
  refreshCount: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncLock = useRef(false);

  const refreshCount = useCallback(async () => {
    const n = await getPendingCount();
    setPendingCount(n);
  }, []);

  const syncNow = useCallback(async () => {
    if (syncLock.current) return;
    syncLock.current = true;
    setIsSyncing(true);
    try {
      await processQueue();
      await refreshCount();
    } finally {
      setIsSyncing(false);
      syncLock.current = false;
    }
  }, [refreshCount]);

  // Watch network state
  useEffect(() => {
    refreshCount();

    const unsub = NetInfo.addEventListener((state: NetInfoState) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);

      // Auto-sync when connectivity is restored
      if (online) {
        syncNow();
      }
    });

    return () => unsub();
  }, [syncNow, refreshCount]);

  return (
    <OfflineContext.Provider value={{ isOnline, pendingCount, isSyncing, syncNow, refreshCount }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline(): OfflineContextType {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error('useOffline must be used within OfflineProvider');
  return ctx;
}
