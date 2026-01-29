/**
 * useApi - A powerful data fetching hook with SWR-like capabilities
 *
 * Features:
 * - Automatic loading/error/data state management
 * - Request deduplication
 * - Automatic revalidation on focus
 * - Optimistic updates support
 * - TypeScript generics for type safety
 * - Stable references to prevent infinite re-renders (TanStack best practice)
 *
 * @see https://tanstack.com/table/latest/docs/guide/data - Stable references
 * @see https://swr.vercel.app/ - SWR patterns
 */

import { useState, useEffect, useCallback, useRef } from "react";


export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function toApiError(response: Response, json: any): ApiError {
  const message =
    (json && typeof json === "object" && typeof json.error === "string" && json.error) ||
    ("HTTP " + response.status + ": " + response.statusText);

  const details = json && typeof json === "object" ? json.details : undefined;
  return new ApiError(message, response.status, details);
}

async function safeParseJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

export interface ApiState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  isValidating: boolean;
}

export interface UseApiOptions<T> {
  /** Initial data to use before fetch completes */
  initialData?: T;
  /** Whether to fetch immediately on mount */
  immediate?: boolean;
  /** Revalidate when window regains focus */
  revalidateOnFocus?: boolean;
  /** Revalidate on interval (ms) - 0 to disable */
  revalidateInterval?: number;
  /** Callback when fetch succeeds */
  onSuccess?: (data: T) => void;
  /** Callback when fetch fails */
  onError?: (error: Error) => void;
  /** Transform response data before storing */
  transform?: (data: unknown) => T;
  /** Dependencies that trigger refetch when changed */
  deps?: ReadonlyArray<unknown>;
}

export interface UseApiReturn<T> extends ApiState<T> {
  /** Manually trigger a refetch */
  refetch: () => Promise<T | null>;
  /** Mutate the local data (optimistic update) */
  mutate: (data: T | ((prev: T | null) => T)) => void;
  /** Reset to initial state */
  reset: () => void;
}

// Request cache for deduplication
type CachedResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: Error };

const requestCache = new Map<string, Promise<CachedResult<any>>>();

let lastAuthExpiredAt = 0;

function notifyAuthExpired() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastAuthExpiredAt < 5000) return;
  lastAuthExpiredAt = now;
  window.dispatchEvent(new CustomEvent("stacksos:auth-expired"));
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "req_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

/**
 * Generic API fetching hook with comprehensive state management
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, refetch } = useApi<Patron[]>(
 *   '/api/evergreen/patrons?q=smith',
 *   { immediate: true }
 * );
 * ```
 */
export function useApi<T = unknown>(
  url: string | null,
  options: UseApiOptions<T> = {}
): UseApiReturn<T> {
  const {
    initialData = null,
    immediate = true,
    revalidateOnFocus = true,
    revalidateInterval = 0,
    deps = [],
  } = options;

  const [state, setState] = useState<ApiState<T>>({
    data: initialData,
    error: null,
    isLoading: immediate && !!url,
    isValidating: false,
  });

  // Use refs to maintain stable references and avoid stale closures
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const isMountedRef = useRef(true);

  const fetchData = useCallback(async (): Promise<T | null> => {
    if (!url) return null;

    // Always set validating state for this hook instance, even when deduping.
    setState((prev) => ({
      ...prev,
      isLoading: prev.data === null,
      isValidating: true,
      error: null,
    }));

    let inflight = requestCache.get(url) as Promise<CachedResult<T>> | undefined;

    if (!inflight) {
      const createRequest = async (): Promise<CachedResult<T>> => {
        try {
          const response = await fetch(url, {
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
          });

          const json = await safeParseJson(response);

          if (response.status === 401) {
            notifyAuthExpired();
          }

          if (!response.ok) {
            throw toApiError(response, json);
          }

          if (json && json.ok === false) {
            throw toApiError(response, json);
          }

          if (json === null) {
            throw new ApiError("Invalid JSON response", response.status);
          }

          const data = optionsRef.current.transform
            ? optionsRef.current.transform(json)
            : (json as T);

          return { ok: true, data };
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          return { ok: false, error };
        }
      };

      inflight = createRequest().finally(() => {
        requestCache.delete(url);
      }) as Promise<CachedResult<T>>;

      requestCache.set(url, inflight as Promise<CachedResult<any>>);
    }

    const result = await inflight;

    if (!isMountedRef.current) {
      return result.ok ? result.data : null;
    }

    if (result.ok) {
      setState({
        data: result.data,
        error: null,
        isLoading: false,
        isValidating: false,
      });
      optionsRef.current.onSuccess?.(result.data);
      return result.data;
    }

    setState((prev) => ({
      ...prev,
      error: result.error,
      isLoading: false,
      isValidating: false,
    }));
    optionsRef.current.onError?.(result.error);
    return null;
  }, [url]);

  // Initial fetch and dependency-triggered refetch
  useEffect(() => {
    if (immediate && url) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, immediate, ...deps]);

  // Revalidate on focus
  useEffect(() => {
    if (!revalidateOnFocus || !url) return;

    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        fetchData();
      }
    };

    document.addEventListener("visibilitychange", handleFocus);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleFocus);
      window.removeEventListener("focus", handleFocus);
    };
  }, [revalidateOnFocus, url, fetchData]);

  // Revalidate on interval
  useEffect(() => {
    if (!revalidateInterval || revalidateInterval <= 0 || !url) return;

    const intervalId = setInterval(fetchData, revalidateInterval);
    return () => clearInterval(intervalId);
  }, [revalidateInterval, url, fetchData]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const mutate = useCallback((updater: T | ((prev: T | null) => T)) => {
    setState((prev) => ({
      ...prev,
      data: typeof updater === "function" ? (updater as (prev: T | null) => T)(prev.data) : updater,
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      data: initialData,
      error: null,
      isLoading: false,
      isValidating: false,
    });
  }, [initialData]);

  return {
    ...state,
    refetch: fetchData,
    mutate,
    reset,
  };
}

/**
 * Hook for POST/PUT/DELETE mutations with optimistic updates
 *
 * @example
 * ```tsx
 * const { mutateAsync, isLoading } = useMutation<CheckoutResult, { action: string; barcode: string }>({
 *   onSuccess: (data, variables) => {
 *     // handle success
 *   },
 *   onError: (error, variables) => {
 *     // handle error
 *   }
 * });
 *
 * const handleCheckout = async () => {
 *   await mutateAsync('/api/evergreen/circulation', {
 *     action: 'checkout',
 *     patronBarcode,
 *     itemBarcode
 *   });
 * };
 * ```
 */
export interface MutationOptions<T, TVariables = any> {
  /** Called when mutation succeeds - receives data and variables */
  onSuccess?: (data: T, variables: TVariables) => void;
  /** Called when mutation fails - receives error and variables */
  onError?: (error: Error, variables: TVariables) => void;
  /** Called before the request - return false to cancel */
  onMutate?: (variables: TVariables) => boolean | void;
  /** Called after mutation completes (success or error) */
  onSettled?: (data: T | null, error: Error | null, variables: TVariables) => void;
}

export interface UseMutationReturn<T, TVariables = any> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  /** Mutate and return promise (throws on error) */
  mutateAsync: (url: string, variables: TVariables) => Promise<T>;
  /** Mutate without throwing (returns null on error) */
  mutate: (url: string, variables: TVariables) => Promise<T | null>;
  reset: () => void;
}

export function useMutation<T = any, TVariables = any>(
  options: MutationOptions<T, TVariables> = {}
): UseMutationReturn<T, TVariables> {
  const [state, setState] = useState<{
    data: T | null;
    error: Error | null;
    isLoading: boolean;
  }>({
    data: null,
    error: null,
    isLoading: false,
  });

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const mutateAsync = useCallback(
    async (url: string, variables: TVariables): Promise<T> => {
      // Call onMutate - can cancel by returning false
      if (optionsRef.current.onMutate?.(variables) === false) {
        throw new Error("Mutation cancelled");
      }

      setState({ data: null, error: null, isLoading: true });

      try {
        const requestId = createRequestId();
        const idempotencyKey = requestId;
        const baseTimeoutMs = 15000;
        const safeRetry = url.includes("/api/evergreen/circulation");

        let attempt = 0;
        let timeoutMs = baseTimeoutMs;

        while (true) {
          attempt += 1;
          const controller = new AbortController();
          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs);

          try {
            const response = await fetch(url, {
            credentials: "include",
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-request-id": requestId,
                "x-idempotency-key": idempotencyKey,
              },
              body: JSON.stringify(variables),
              signal: controller.signal,
            });

            const json = await safeParseJson(response);

            if (response.status === 401) {
              notifyAuthExpired();
            }

            if (!response.ok || (json && json.ok === false)) {
              throw toApiError(response, json);
            }

            if (json === null) {
              throw new ApiError("Invalid JSON response", response.status);
            }

            setState({ data: json, error: null, isLoading: false });
            optionsRef.current.onSuccess?.(json, variables);
            optionsRef.current.onSettled?.(json, null, variables);
            return json;
          } catch (err) {
            if (timedOut) {
              // Retry once (circulation endpoints are protected by server idempotency).
              if (safeRetry && attempt === 1) {
                timeoutMs = Math.min(timeoutMs * 2, 60000);
                continue;
              }

              throw new ApiError("Request timed out. Safe to retry.", 408, {
                requestId,
                idempotencyKey,
                timeoutMs,
                attempt,
              });
            }

            throw err;
          } finally {
            clearTimeout(timer);
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ data: null, error, isLoading: false });
        optionsRef.current.onError?.(error, variables);
        optionsRef.current.onSettled?.(null, error, variables);
        throw error;
      }
    },
    []
  );

  const mutate = useCallback(
    async (url: string, variables: TVariables): Promise<T | null> => {
      try {
        return await mutateAsync(url, variables);
      } catch (_error) {
        return null;
      }
    },
    [mutateAsync]
  );

  const reset = useCallback(() => {
    setState({ data: null, error: null, isLoading: false });
  }, []);

  return {
    ...state,
    mutateAsync,
    mutate,
    reset,
  };
}

export default useApi;
