"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type WorkformType = "patron" | "record" | "item" | "marc";

export interface WorkformEntry {
  key: string;
  type: WorkformType;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  pinned: boolean;
}

interface WorkformsContextValue {
  workforms: WorkformEntry[];
  addPin: (entry: Omit<WorkformEntry, "key" | "pinned">) => void;
  removePin: (key: string) => void;
  isPinned: (type: WorkformType, id: string) => boolean;
}

const WorkformsContext = createContext<WorkformsContextValue | null>(null);

const STORAGE_KEY = "stacksos_pinned_v2";
const MAX_PINNED = 20;

function safeParseJson(value: string | null): unknown | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function WorkformsProvider({ children }: { children: React.ReactNode }) {
  const [workforms, setWorkforms] = useState<WorkformEntry[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = safeParseJson(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(raw)) {
      setWorkforms(raw.filter((w) => w.key && w.type && w.id && w.title && w.href).slice(0, MAX_PINNED));
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workforms));
  }, [workforms]);

  const addPin = useCallback((entry: Omit<WorkformEntry, "key" | "pinned">) => {
    const key = `${entry.type}:${entry.id}`;
    setWorkforms((prev) => {
      // Don't add if already exists
      if (prev.some((w) => w.key === key)) return prev;
      return [{ ...entry, key, pinned: true }, ...prev].slice(0, MAX_PINNED);
    });
  }, []);

  const removePin = useCallback((key: string) => {
    setWorkforms((prev) => prev.filter((w) => w.key !== key));
  }, []);

  const isPinned = useCallback((type: WorkformType, id: string) => {
    const key = `${type}:${id}`;
    return workforms.some((w) => w.key === key);
  }, [workforms]);

  return (
    <WorkformsContext.Provider value={{ workforms, addPin, removePin, isPinned }}>
      {children}
    </WorkformsContext.Provider>
  );
}

export function useWorkforms() {
  const context = useContext(WorkformsContext);
  if (!context) {
    throw new Error("useWorkforms must be used within a WorkformsProvider");
  }
  return context;
}
