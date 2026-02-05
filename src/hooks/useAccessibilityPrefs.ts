"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const DYSLEXIA_KEY = "stacksos:a11y:dyslexia";

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const v = raw.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(v)) return true;
    if (["0", "false", "no", "off"].includes(v)) return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore
  }
}

export function useAccessibilityPrefs() {
  const [dyslexiaFriendly, setDyslexiaFriendlyState] = useState(false);

  useEffect(() => {
    setDyslexiaFriendlyState(readBool(DYSLEXIA_KEY, false));
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DYSLEXIA_KEY) {
        setDyslexiaFriendlyState(readBool(DYSLEXIA_KEY, false));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setDyslexiaFriendly = useCallback((value: boolean) => {
    setDyslexiaFriendlyState(value);
    writeBool(DYSLEXIA_KEY, value);
  }, []);

  return useMemo(
    () => ({
      dyslexiaFriendly,
      setDyslexiaFriendly,
    }),
    [dyslexiaFriendly, setDyslexiaFriendly]
  );
}

