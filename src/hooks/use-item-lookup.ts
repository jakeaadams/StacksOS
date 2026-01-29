/**
 * useItemLookup - Reusable item/copy search and lookup hook
 *
 * Provides consistent item lookup across all pages:
 * - Lookup by barcode (exact match)
 * - Search by title/author
 * - Copy status tracking
 * - Circulation info
 * - Proper cleanup with AbortController
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useDebounce } from "./use-debounce";

export interface CopyStatus {
  id: number;
  name: string;
  isAvailable: boolean;
  isCheckedOut: boolean;
  isInTransit: boolean;
  isOnHoldsShelf: boolean;
  isLost: boolean;
  isMissing: boolean;
  isDamaged: boolean;
}

export interface ItemSummary {
  id: number;
  barcode: string;
  title: string;
  author: string;
  callNumber: string;
  copyNumber: number;
  location: string;
  circulationLibrary: string;
  owningLibrary: string;
  status: CopyStatus;
  price?: number;
  holdable: boolean;
  circulate: boolean;
  refItem: boolean;
}

export interface ItemFull extends ItemSummary {
  bibRecordId: number;
  volumeId: number;
  isbn?: string;
  publisher?: string;
  pubDate?: string;
  format?: string;
  edition?: string;
  copyNotes?: Array<{
    id: number;
    title: string;
    value: string;
    isPublic: boolean;
  }>;
  alerts?: Array<{
    id: number;
    type: string;
    message: string;
  }>;
  currentCirculation?: {
    id: number;
    patronId: number;
    patronBarcode: string;
    patronName: string;
    checkoutDate: string;
    dueDate: string;
    renewals: number;
    isOverdue: boolean;
    finesAccrued: number;
  };
  holdInfo?: {
    totalHolds: number;
    availableCopies: number;
    queuePosition?: number;
  };
  lastCirculation?: {
    returnDate: string;
    checkoutDate: string;
  };
}

export interface UseItemLookupOptions {
  autoSearch?: boolean;
  debounceMs?: number;
  minChars?: number;
  onFound?: (item: ItemSummary) => void;
  onNotFound?: () => void;
  onError?: (error: Error) => void;
}

export interface UseItemLookupReturn {
  query: string;
  setQuery: (query: string) => void;
  results: ItemSummary[];
  selectedItem: ItemFull | null;
  isLoading: boolean;
  isSearching: boolean;
  error: Error | null;
  lookupByBarcode: (barcode: string) => Promise<ItemFull | null>;
  search: (query?: string) => Promise<ItemSummary[]>;
  clear: () => void;
}

const STATUS_MAP: Record<number, Partial<CopyStatus>> = {
  0: { name: "Available", isAvailable: true },
  1: { name: "Checked Out", isCheckedOut: true },
  2: { name: "Bindery", isAvailable: false },
  3: { name: "Lost", isLost: true },
  4: { name: "Missing", isMissing: true },
  5: { name: "In Process", isAvailable: false },
  6: { name: "In Transit", isInTransit: true },
  7: { name: "Reshelving", isAvailable: true },
  8: { name: "On Holds Shelf", isOnHoldsShelf: true },
  9: { name: "On Order", isAvailable: false },
  10: { name: "ILL", isAvailable: false },
  11: { name: "Cataloging", isAvailable: false },
  12: { name: "Reserves", isAvailable: false },
  13: { name: "Discard/Weed", isAvailable: false },
  14: { name: "Damaged", isDamaged: true },
};

function parseStatus(statusId: number): CopyStatus {
  const base: CopyStatus = {
    id: statusId,
    name: `Status ${statusId}`,
    isAvailable: false,
    isCheckedOut: false,
    isInTransit: false,
    isOnHoldsShelf: false,
    isLost: false,
    isMissing: false,
    isDamaged: false,
  };
  return { ...base, ...STATUS_MAP[statusId] };
}

export function useItemLookup(options: UseItemLookupOptions = {}): UseItemLookupReturn {
  const {
    autoSearch = false,
    debounceMs = 300,
    minChars = 3,
    onFound,
    onNotFound,
    onError,
  } = options;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ItemSummary[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemFull | null>(null);
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

  const transformItem = (copy: any, bib?: any): ItemSummary => ({
    id: copy.id,
    barcode: copy.barcode || "",
    title: bib?.title || copy.call_number?.record?.simple_record?.title || copy.title || "Unknown Title",
    author: bib?.author || copy.call_number?.record?.simple_record?.author || copy.author || "",
    callNumber: copy.call_number?.label || copy.callNumber || "",
    copyNumber: copy.copy_number || 1,
    location: copy.location?.name || copy.location || "",
    circulationLibrary: copy.circ_lib?.shortname || copy.circ_lib?.name || "",
    owningLibrary: copy.call_number?.owning_lib?.shortname || "",
    status: parseStatus(typeof copy.status === "object" ? copy.status.id : copy.status),
    price: copy.price ? parseFloat(copy.price) : undefined,
    holdable: copy.holdable !== false,
    circulate: copy.circulate !== false,
    refItem: copy.ref === true,
  });

  const transformApiItem = (item: any): ItemFull => ({
    id: item.id,
    barcode: item.barcode || "",
    title: item.title || "Unknown Title",
    author: item.author || "",
    callNumber: item.callNumber || "",
    copyNumber: item.copyNumber || 1,
    location: item.location || "",
    circulationLibrary: item.circLib || "",
    owningLibrary: item.owningLib || "",
    status: parseStatus(item.statusId ?? 0),
    price: item.price ? parseFloat(item.price) : undefined,
    holdable: item.holdable !== false,
    circulate: item.circulate !== false,
    refItem: item.refItem === true,
    bibRecordId: item.recordId || 0,
    volumeId: item.callNumberId || 0,
    isbn: item.isbn,
    publisher: item.publisher,
    pubDate: item.pubdate || item.pubDate,
    format: item.format,
    edition: item.edition,
    currentCirculation: item.currentCirculation,
    holdInfo: item.holdInfo,
  });

  const lookupByBarcode = useCallback(async (barcode: string): Promise<ItemFull | null> => {
    if (!barcode) return null;

    // Abort previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const response = await fetch(`/api/evergreen/items?barcode=${encodeURIComponent(barcode)}`, {
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

      const apiItem = json.item;
      if (!apiItem?.id) {
        onNotFound?.();
        return null;
      }

      const item = transformApiItem(apiItem);
      setSelectedItem(item);
      onFound?.(item);

      return item;
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

  const search = useCallback(async (searchQuery?: string): Promise<ItemSummary[]> => {
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
      const response = await fetch(`/api/evergreen/catalog?q=${encodeURIComponent(q)}`, {
        signal: abortControllerRef.current.signal,
      });
      const json = await response.json();

      if (!isMountedRef.current) return [];

      if (!response.ok || json.ok === false) {
        throw new Error(json.error || "Search failed");
      }

      const items: ItemSummary[] = [];

      if (json.records) {
        for (const record of json.records) {
          const copies = record.copies || [];
          for (const copy of copies) {
            items.push(transformItem(copy, record));
          }
        }
      } else if (json.copies) {
        for (const copy of json.copies) {
          items.push(transformItem(copy));
        }
      }

      setResults(items);
      return items;
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
  }, [query, minChars, onError]);

  const clear = useCallback(() => {
    abortControllerRef.current?.abort();
    setQuery("");
    setResults([]);
    setSelectedItem(null);
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
  }, [autoSearch, debouncedQuery, minChars, search]);

  return {
    query,
    setQuery,
    results,
    selectedItem,
    isLoading,
    isSearching,
    error,
    lookupByBarcode,
    search,
    clear,
  };
}

export default useItemLookup;
