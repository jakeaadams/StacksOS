/**
 * Recent Search History
 *
 * Manages a per-browser recent searches list backed by localStorage.
 * SSR-safe — all reads/writes short-circuit when `window` is unavailable.
 */

const STORAGE_KEY = "stacksos_recent_searches";
const MAX_ITEMS = 10;

/** Return the recent searches list (newest first). */
export function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string").slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

/** Add a search term to the top of the list (deduplicates, trims, caps at MAX). */
export function addRecentSearch(term: string): void {
  if (typeof window === "undefined") return;
  const trimmed = term.trim();
  if (!trimmed) return;
  try {
    const current = getRecentSearches();
    const deduped = current.filter((s) => s.toLowerCase() !== trimmed.toLowerCase());
    const updated = [trimmed, ...deduped].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Storage full or disabled — silently ignore.
  }
}

/** Remove a single entry by exact (case-insensitive) match. */
export function removeRecentSearch(term: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = getRecentSearches();
    const lower = term.toLowerCase();
    const updated = current.filter((s) => s.toLowerCase() !== lower);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors.
  }
}

/** Clear all recent searches. */
export function clearRecentSearches(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}
