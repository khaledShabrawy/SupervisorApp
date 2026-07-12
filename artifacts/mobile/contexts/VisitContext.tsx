import React, { createContext, useContext, useState } from 'react';

export interface ActiveVisit {
  visitId: string;
  customerId: string;
  customerName: string;
  customerType: string;
  visitStatus: 'متعامل' | 'غير متعامل' | 'غير موجود';
}

interface VisitContextType {
  activeVisit: ActiveVisit | null;
  setActiveVisit: (visit: ActiveVisit) => void;
  clearVisit: () => void;
}

const VisitContext = createContext<VisitContextType | undefined>(undefined);

export function VisitProvider({ children }: { children: React.ReactNode }) {
  const [activeVisit, setActiveVisitState] = useState<ActiveVisit | null>(null);

  const setActiveVisit = (visit: ActiveVisit) => setActiveVisitState(visit);
  const clearVisit = () => setActiveVisitState(null);

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
