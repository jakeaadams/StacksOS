/**
 * usePatronLookup - Reusable patron search/lookup hook
 *
 * Provides consistent patron lookup across all pages:
 * - Search by barcode (exact match)
 * - Search by name (partial match)
 * - Auto-focus handling
 * - Loading and error states
 * - Proper cleanup with AbortController
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useDebounce } from "./use-debounce";
import type { PatronRaw, PatronPenaltyRaw } from "@/types/api-responses";

export interface PatronSummary {
  id: number;
  barcode: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email?: string;
  phone?: string;
  homeLibrary?: string;
  profileGroup?: string;
  active: boolean;
  barred: boolean;
  hasAlerts: boolean;
  alertCount: number;
  balanceOwed: number;
  checkoutsCount: number;
  holdsCount: number;
  overdueCount: number;
}

export interface PatronFull extends PatronSummary {
  address?: {
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country?: string;
  };
  dateOfBirth?: string;
  created: string;
  expires: string;
  lastActivity?: string;
  notes?: Array<{
    id: number;
    title: string;
    content: string;
    isAlert: boolean;
    created: string;
  }>;
  penalties?: Array<{
    id: number;
    type: string;
    message: string;
    standing?: string;
  }>;
}

export interface UsePatronLookupOptions {
  autoSearch?: boolean;
  debounceMs?: number;
  minChars?: number;
  onFound?: (patron: PatronSummary) => void;
  onNotFound?: () => void;
  onError?: (error: Error) => void;
}

export interface UsePatronLookupReturn {
  query: string;
  setQuery: (query: string) => void;
  results: PatronSummary[];
  selectedPatron: PatronFull | null;
  isLoading: boolean;
  isSearching: boolean;
  error: Error | null;
  search: (query?: string) => Promise<PatronSummary[]>;
  lookupByBarcode: (barcode: string) => Promise<PatronFull | null>;
  selectPatron: (patronId: number) => Promise<PatronFull | null>;
  clear: () => void;
}

function transformPatron(p: PatronRaw): PatronSummary {
  return {
    id: p.id,
    barcode: p.card?.barcode || p.barcode || "",
    firstName: p.first_given_name || p.firstName || "",
    lastName: p.family_name || p.lastName || "",
    displayName:
      p.displayName ||
      `${p.family_name || ""}, ${p.first_given_name || ""}`.trim() ||
      "Unknown",
    email: p.email,
    phone: p.day_phone || p.evening_phone || p.phone,
    homeLibrary: p.home_ou?.name || p.homeLibrary,
    profileGroup: p.profile?.name || p.profileGroup,
    active: p.active !== false,
    barred: p.barred === true,
    hasAlerts: (p.alerts?.length || 0) > 0 || (p.penalties?.length || 0) > 0,
    alertCount: (p.alerts?.length || 0) + (p.standing_penalties?.length || 0),
    balanceOwed: parseFloat(String(p.balance_owed || p.balanceOwed || 0)),
    checkoutsCount: p.checkouts_count || p.checkoutsCount || 0,
    holdsCount: p.holds_count || p.holdsCount || 0,
    overdueCount: p.overdue_count || p.overdueCount || 0,
  };
}

function transformPatronFull(p: PatronRaw): PatronFull {
  return {
    ...transformPatron(p),
    address:
      p.addresses?.[0] || p.address
        ? {
            street1: p.addresses?.[0]?.street1 || p.address?.street1 || "",
            street2: p.addresses?.[0]?.street2 || p.address?.street2,
            city: p.addresses?.[0]?.city || p.address?.city || "",
            state: p.addresses?.[0]?.state || p.address?.state || "",
            zip: p.addresses?.[0]?.post_code || p.address?.post_code || "",
            country: p.addresses?.[0]?.country || p.address?.country,
          }
        : undefined,
    dateOfBirth: p.dob || p.dateOfBirth,
    created: p.create_date || p.created || "",
    expires: p.expire_date || p.expires || "",
    lastActivity: p.last_xact_id || p.lastActivity,
    notes: p.notes,
    penalties: p.standing_penalties?.map((pen: PatronPenaltyRaw) => ({
      id: pen.id,
      type: pen.standing_penalty?.name || "Unknown",
      message: pen.note || pen.standing_penalty?.label || "",
      standing: pen.standing_penalty?.block_list,
    })),
  };
}

export function usePatronLookup(options: UsePatronLookupOptions = {}): UsePatronLookupReturn {
  const {
    autoSearch = true,
    debounceMs = 300,
    minChars = 2,
    onFound,
    onNotFound,
    onError,
  } = options;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatronSummary[]>([]);
  const [selectedPatron, setSelectedPatron] = useState<PatronFull | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  // Track abort controller for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);

  const debouncedQuery = useDebounce(query, debounceMs);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Search by query
  const search = useCallback(async (searchQuery?: string): Promise<PatronSummary[]> => {
    const q = searchQuery ?? query;
    if (!q || q.length < minChars) {
      if (isMountedRef.current) setResults([]);
      return [];
    }

    // Abort previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    if (isMountedRef.current) {
      setIsSearching(true);
      setError(null);
    }

    try {
      const response = await fetch(`/api/evergreen/patrons?q=${encodeURIComponent(q)}`, {
        signal: abortControllerRef.current.signal,
      });
      const json = await response.json();

      if (!isMountedRef.current) return [];

      if (!response.ok || json.ok === false) {
        throw new Error(json.error || "Search failed");
      }

      const patrons = (json.patrons || []).map((patron: PatronRaw) => transformPatron(patron));
      setResults(patrons);

      if (patrons.length === 0) {
        onNotFound?.();
      }

      return patrons;
    } catch (err) {
      if (!isMountedRef.current) return [];
      if (err instanceof Error && err.name === "AbortError") return [];

      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
      return [];
    } finally {
      if (isMountedRef.current) setIsSearching(false);
    }
  }, [query, minChars, onNotFound, onError]);

  // Lookup by barcode (exact match, full details)
  const lookupByBarcode = useCallback(async (barcode: string): Promise<PatronFull | null> => {
    if (!barcode) return null;

    // Abort previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const response = await fetch(`/api/evergreen/patrons?barcode=${encodeURIComponent(barcode)}`, {
        signal: abortControllerRef.current.signal,
      });
      const json = await response.json();

      if (!isMountedRef.current) return null;

      if (!response.ok || json.ok === false) {
        if (json.error?.includes("not found") || response.status === 404) {
          onNotFound?.();
          return null;
        }
        throw new Error(json.error || "Lookup failed");
      }

      const patron = json.patron ? transformPatronFull(json.patron as PatronRaw) : null;

      if (patron) {
        setSelectedPatron(patron);
        onFound?.(patron);
      } else {
        onNotFound?.();
      }

      return patron;
    } catch (err) {
      if (!isMountedRef.current) return null;
      if (err instanceof Error && err.name === "AbortError") return null;

      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
      return null;
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [onFound, onNotFound, onError]);

  // Select patron by ID
  const selectPatron = useCallback(async (patronId: number): Promise<PatronFull | null> => {
    // Abort previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const response = await fetch(`/api/evergreen/patrons?id=${patronId}`, {
        signal: abortControllerRef.current.signal,
      });
      const json = await response.json();

      if (!isMountedRef.current) return null;

      if (!response.ok || json.ok === false) {
        throw new Error(json.error || "Failed to load patron");
      }

      const patron = json.patron ? transformPatronFull(json.patron as PatronRaw) : null;

      if (patron) {
        setSelectedPatron(patron);
        onFound?.(patron);
      }

      return patron;
    } catch (err) {
      if (!isMountedRef.current) return null;
      if (err instanceof Error && err.name === "AbortError") return null;

      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
      return null;
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [onFound, onError]);

  // Clear everything
  const clear = useCallback(() => {
    abortControllerRef.current?.abort();
    setQuery("");
    setResults([]);
    setSelectedPatron(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!autoSearch) return;

    if (debouncedQuery.length >= minChars) {
      search(debouncedQuery);
      return;
    }

    if (debouncedQuery.length === 0 && isMountedRef.current) {
      setResults([]);
    }
  }, [autoSearch, debouncedQuery, minChars]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    query,
    setQuery,
    results,
    selectedPatron,
    isLoading,
    isSearching,
    error,
    search,
    lookupByBarcode,
    selectPatron,
    clear,
  };
}

export default usePatronLookup;
