"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

/**
 * Lightweight context that keeps the currently-loaded patron visible
 * across circulation sub-pages (checkout, checkin, bills, etc.)
 * without re-fetching on every navigation.
 */

export interface CirculationPatron {
  id: number;
  barcode: string;
  displayName: string;
  alerts?: string[];
  balance?: number;
  isBlocked?: boolean;
}

interface PatronContextValue {
  patron: CirculationPatron | null;
  setPatron: (patron: CirculationPatron | null) => void;
  clearPatron: () => void;
}

const PatronContext = createContext<PatronContextValue>({
  patron: null,
  setPatron: () => {},
  clearPatron: () => {},
});

export function CirculationPatronProvider({ children }: { children: ReactNode }) {
  const [patron, setPatronState] = useState<CirculationPatron | null>(null);

  const setPatron = useCallback((p: CirculationPatron | null) => {
    setPatronState(p);
  }, []);

  const clearPatron = useCallback(() => {
    setPatronState(null);
  }, []);

  return (
    <PatronContext.Provider value={{ patron, setPatron, clearPatron }}>
      {children}
    </PatronContext.Provider>
  );
}

export function useCirculationPatron() {
  return useContext(PatronContext);
}
