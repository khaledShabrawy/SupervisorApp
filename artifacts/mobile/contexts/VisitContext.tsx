/**
 * VisitContext — tracks the active visit during a field visit session.
 * State is persisted to AsyncStorage so it survives app backgrounding/crash.
 * isPendingVisit = true means the visit was created offline (LOCAL_ id).
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@mydan/active_visit';

export interface ActiveVisit {
  visitId: string;          // LOCAL_<uuid> if offline, real UUID if online
  customerId: string;
  customerName: string;
  customerType: string;
  visitStatus: 'متعامل' | 'غير متعامل' | 'غير موجود';
  isPending: boolean;       // true = queued offline, not yet synced
}

interface VisitContextType {
  activeVisit: ActiveVisit | null;
  setActiveVisit: (visit: ActiveVisit) => void;
  clearVisit: () => void;
}

const VisitContext = createContext<VisitContextType | undefined>(undefined);

export function VisitProvider({ children }: { children: React.ReactNode }) {
  const [activeVisit, setActiveVisitState] = useState<ActiveVisit | null>(null);

  // Rehydrate on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setActiveVisitState(JSON.parse(raw) as ActiveVisit);
        } catch {
          /* ignore corrupt data */
        }
      }
    });
  }, []);

  const setActiveVisit = (visit: ActiveVisit) => {
    setActiveVisitState(visit);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(visit));
  };

  const clearVisit = () => {
    setActiveVisitState(null);
    AsyncStorage.removeItem(STORAGE_KEY);
  };

  return (
    <VisitContext.Provider value={{ activeVisit, setActiveVisit, clearVisit }}>
      {children}
    </VisitContext.Provider>
  );
}

export function useVisit(): VisitContextType {
  const ctx = useContext(VisitContext);
  if (!ctx) throw new Error('useVisit must be used within VisitProvider');
  return ctx;
}
