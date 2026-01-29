/**
 * useKeyboardShortcut - Handle keyboard shortcuts consistently
 *
 * Supports:
 * - Function keys (F1-F12)
 * - Modifier combinations (Ctrl+K, Cmd+S)
 * - Escape key handling
 * - Focus-aware shortcuts
 *
 * @see https://react-spectrum.adobe.com/react-aria/accessibility.html - Keyboard patterns
 */

import { useEffect, useRef, useState } from "react";

export interface KeyboardShortcut {
  /** The key to listen for (e.g., "F1", "k", "Escape") */
  key: string;
  /** Require Ctrl/Cmd modifier */
  ctrl?: boolean;
  /** Require Shift modifier */
  shift?: boolean;
  /** Require Alt/Option modifier */
  alt?: boolean;
  /** Callback when shortcut is triggered */
  handler: (event: KeyboardEvent) => void;
  /** Description for accessibility/help */
  description?: string;
  /** Whether to prevent default browser behavior */
  preventDefault?: boolean;
  /** Whether to stop event propagation */
  stopPropagation?: boolean;
  /** Only trigger when no input is focused */
  ignoreInputs?: boolean;
}

/**
 * Register a single keyboard shortcut
 *
 * @example
 * ```tsx
 * // F1 for checkout
 * useKeyboardShortcut({
 *   key: 'F1',
 *   handler: () => router.push('/staff/circulation/checkout'),
 *   description: 'Go to Checkout',
 *   preventDefault: true,
 * });
 *
 * // Ctrl+K for search
 * useKeyboardShortcut({
 *   key: 'k',
 *   ctrl: true,
 *   handler: () => setSearchOpen(true),
 *   description: 'Open search',
 * });
 * ```
 */
export function useKeyboardShortcut(shortcut: KeyboardShortcut): void {
  const handlerRef = useRef(shortcut.handler);

  useEffect(() => {
    handlerRef.current = shortcut.handler;
  }, [shortcut.handler]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if we should ignore inputs
      if (shortcut.ignoreInputs !== false) {
        const target = event.target as HTMLElement;
        const isInput =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable;

        // Allow Escape and function keys in inputs
        if (isInput && !event.key.startsWith("F") && event.key !== "Escape") {
          return;
        }
      }

      // Normalize key comparison (case-insensitive for letters)
      const pressedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const targetKey = shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key;

      if (pressedKey !== targetKey) return;

      // Check modifiers - use metaKey for Mac Cmd
      const ctrlPressed = event.ctrlKey || event.metaKey;
      if (shortcut.ctrl && !ctrlPressed) return;
      if (!shortcut.ctrl && ctrlPressed && shortcut.key.length === 1) return;

      if (shortcut.shift && !event.shiftKey) return;
      if (!shortcut.shift && event.shiftKey && shortcut.key.length === 1) return;

      if (shortcut.alt && !event.altKey) return;
      if (!shortcut.alt && event.altKey) return;

      // Trigger the handler
      if (shortcut.preventDefault !== false) {
        event.preventDefault();
      }
      if (shortcut.stopPropagation) {
        event.stopPropagation();
      }

      handlerRef.current(event);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [shortcut.key, shortcut.ctrl, shortcut.shift, shortcut.alt, shortcut.preventDefault, shortcut.stopPropagation, shortcut.ignoreInputs]);
}

/**
 * Register multiple keyboard shortcuts at once
 *
 * @example
 * ```tsx
 * useKeyboardShortcuts([
 *   { key: 'F1', handler: () => goToCheckout(), description: 'Checkout' },
 *   { key: 'F2', handler: () => goToCheckin(), description: 'Checkin' },
 *   { key: 'F3', handler: () => goToPatrons(), description: 'Patron Search' },
 *   { key: 'Escape', handler: () => closeModal(), description: 'Close' },
 * ]);
 * ```
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]): void {
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcutsRef.current) {
        // Check if we should ignore inputs
        if (shortcut.ignoreInputs !== false) {
          const target = event.target as HTMLElement;
          const isInput =
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable;

          if (isInput && !event.key.startsWith("F") && event.key !== "Escape") {
            continue;
          }
        }

        const pressedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        const targetKey = shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key;

        if (pressedKey !== targetKey) continue;

        const ctrlPressed = event.ctrlKey || event.metaKey;
        if (shortcut.ctrl && !ctrlPressed) continue;
        if (!shortcut.ctrl && ctrlPressed && shortcut.key.length === 1) continue;

        if (shortcut.shift && !event.shiftKey) continue;
        if (!shortcut.shift && event.shiftKey && shortcut.key.length === 1) continue;

        if (shortcut.alt && !event.altKey) continue;
        if (!shortcut.alt && event.altKey) continue;

        // Match found
        if (shortcut.preventDefault !== false) {
          event.preventDefault();
        }
        if (shortcut.stopPropagation) {
          event.stopPropagation();
        }

        shortcut.handler(event);
        return; // Only trigger first matching shortcut
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}

/**
 * Hook to detect if a specific key is currently pressed
 * Useful for showing keyboard hints
 */
export function useKeyPressed(targetKey: string): boolean {
  const [isPressed, setIsPressed] = useState(false);

  useEffect(() => {
    const handleDown = (event: KeyboardEvent) => {
      if (event.key === targetKey) {
        setIsPressed(true);
      }
    };

    const handleUp = (event: KeyboardEvent) => {
      if (event.key === targetKey) {
        setIsPressed(false);
      }
    };

    document.addEventListener("keydown", handleDown);
    document.addEventListener("keyup", handleUp);

    return () => {
      document.removeEventListener("keydown", handleDown);
      document.removeEventListener("keyup", handleUp);
    };
  }, [targetKey]);

  return isPressed;
}

// Need to import useState for useKeyPressed

/**
 * Format a shortcut for display
 *
 * @example
 * formatShortcut({ key: 'k', ctrl: true }) // "⌘K" on Mac, "Ctrl+K" on Windows
 */
export function formatShortcut(shortcut: Pick<KeyboardShortcut, "key" | "ctrl" | "shift" | "alt">): string {
  const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  const parts: string[] = [];

  if (shortcut.ctrl) {
    parts.push(isMac ? "⌘" : "Ctrl");
  }
  if (shortcut.alt) {
    parts.push(isMac ? "⌥" : "Alt");
  }
  if (shortcut.shift) {
    parts.push(isMac ? "⇧" : "Shift");
  }

  // Format the key nicely
  let key = shortcut.key;
  if (key.length === 1) {
    key = key.toUpperCase();
  } else if (key === "Escape") {
    key = "Esc";
  }

  parts.push(key);

  return isMac ? parts.join("") : parts.join("+");
}

export default useKeyboardShortcut;
