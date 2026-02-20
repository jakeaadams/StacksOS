"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const DYSLEXIA_KEY = "stacksos:a11y:dyslexia";
const HIGH_CONTRAST_KEY = "opac-high-contrast";
const FONT_SIZE_KEY = "opac-font-size";
const REDUCE_MOTION_KEY = "opac-reduce-motion";

export type FontSizeOption = "small" | "medium" | "large" | "x-large";

const FONT_SIZE_MAP: Record<FontSizeOption, string> = {
  small: "14px",
  medium: "16px",
  large: "18px",
  "x-large": "20px",
};

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

function readString<T extends string>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw.trim() as T;
  } catch {
    return fallback;
  }
}

function writeString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/**
 * Apply accessibility preferences to the <html> element so CSS can respond.
 * Called from the hook and also on initial load.
 */
export function applyA11yPrefsToDOM() {
  if (typeof document === "undefined") return;

  const html = document.documentElement;

  // High contrast
  const highContrast = readBool(HIGH_CONTRAST_KEY, false);
  html.setAttribute("data-high-contrast", highContrast ? "true" : "false");

  // Font size
  const fontSize = readString<FontSizeOption>(FONT_SIZE_KEY, "medium");
  const px = FONT_SIZE_MAP[fontSize] || FONT_SIZE_MAP.medium;
  html.style.setProperty("--opac-font-size", px);
  html.setAttribute("data-opac-font-size", fontSize);

  // Reduced motion
  const reduceMotion = readBool(REDUCE_MOTION_KEY, false);
  html.setAttribute("data-reduce-motion", reduceMotion ? "true" : "false");
}

export function useAccessibilityPrefs() {
  const [dyslexiaFriendly, setDyslexiaFriendlyState] = useState(false);
  const [highContrast, setHighContrastState] = useState(false);
  const [fontSize, setFontSizeState] = useState<FontSizeOption>("medium");
  const [reduceMotion, setReduceMotionState] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setDyslexiaFriendlyState(readBool(DYSLEXIA_KEY, false));
    setHighContrastState(readBool(HIGH_CONTRAST_KEY, false));
    setFontSizeState(readString<FontSizeOption>(FONT_SIZE_KEY, "medium"));
    setReduceMotionState(readBool(REDUCE_MOTION_KEY, false));

    // Apply to DOM on mount
    applyA11yPrefsToDOM();
  }, []);

  // Listen for cross-tab changes
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DYSLEXIA_KEY) {
        setDyslexiaFriendlyState(readBool(DYSLEXIA_KEY, false));
      }
      if (e.key === HIGH_CONTRAST_KEY) {
        setHighContrastState(readBool(HIGH_CONTRAST_KEY, false));
        applyA11yPrefsToDOM();
      }
      if (e.key === FONT_SIZE_KEY) {
        const val = readString<FontSizeOption>(FONT_SIZE_KEY, "medium");
        setFontSizeState(val);
        applyA11yPrefsToDOM();
      }
      if (e.key === REDUCE_MOTION_KEY) {
        setReduceMotionState(readBool(REDUCE_MOTION_KEY, false));
        applyA11yPrefsToDOM();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setDyslexiaFriendly = useCallback((value: boolean) => {
    setDyslexiaFriendlyState(value);
    writeBool(DYSLEXIA_KEY, value);
  }, []);

  const setHighContrast = useCallback((value: boolean) => {
    setHighContrastState(value);
    writeBool(HIGH_CONTRAST_KEY, value);
    applyA11yPrefsToDOM();
  }, []);

  const setFontSize = useCallback((value: FontSizeOption) => {
    setFontSizeState(value);
    writeString(FONT_SIZE_KEY, value);
    applyA11yPrefsToDOM();
  }, []);

  const setReduceMotion = useCallback((value: boolean) => {
    setReduceMotionState(value);
    writeBool(REDUCE_MOTION_KEY, value);
    applyA11yPrefsToDOM();
  }, []);

  return useMemo(
    () => ({
      dyslexiaFriendly,
      setDyslexiaFriendly,
      highContrast,
      setHighContrast,
      fontSize,
      setFontSize,
      reduceMotion,
      setReduceMotion,
    }),
    [
      dyslexiaFriendly,
      setDyslexiaFriendly,
      highContrast,
      setHighContrast,
      fontSize,
      setFontSize,
      reduceMotion,
      setReduceMotion,
    ]
  );
}
