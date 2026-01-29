/**
 * useAutoRefresh - Hook for automatic data refresh with interval polling
 *
 * Features:
 * - Configurable refresh interval
 * - Auto-pause when tab is not visible
 * - Manual refresh trigger
 * - Loading state tracking
 * - Cleanup on unmount
 *
 * @example
 * ```tsx
 * const { isRefreshing, lastRefresh, triggerRefresh } = useAutoRefresh({
 *   onRefresh: async () => {
 *     await fetchData();
 *   },
 *   interval: 30000, // 30 seconds
 *   enabled: true,
 * });
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { clientLogger } from "@/lib/client-logger";

export interface UseAutoRefreshOptions {
  /** Async function to call on each refresh */
  onRefresh: () => Promise<void>;
  /** Refresh interval in milliseconds (default: 30000 = 30 seconds) */
  interval?: number;
  /** Whether auto-refresh is enabled (default: true) */
  enabled?: boolean;
  /** Pause refresh when tab is not visible (default: true) */
  pauseOnHidden?: boolean;
}

export interface UseAutoRefreshReturn {
  /** Whether a refresh is currently in progress */
  isRefreshing: boolean;
  /** Timestamp of last successful refresh */
  lastRefresh: Date | null;
  /** Manually trigger a refresh */
  triggerRefresh: () => Promise<void>;
  /** Start auto-refresh */
  start: () => void;
  /** Stop auto-refresh */
  stop: () => void;
}

export function useAutoRefresh(options: UseAutoRefreshOptions): UseAutoRefreshReturn {
  const {
    onRefresh,
    interval = 30000,
    enabled = true,
    pauseOnHidden = true,
  } = options;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isActive, setIsActive] = useState(enabled);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const performRefresh = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      await onRefreshRef.current();
      setLastRefresh(new Date());
    } catch (error) {
      clientLogger.error("Auto-refresh error:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  const triggerRefresh = useCallback(async () => {
    await performRefresh();
  }, [performRefresh]);

  const start = useCallback(() => {
    setIsActive(true);
  }, []);

  const stop = useCallback(() => {
    setIsActive(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Set up interval
  useEffect(() => {
    if (!isActive || interval <= 0) {
      return;
    }

    intervalRef.current = setInterval(() => {
      // Check if document is visible (if pauseOnHidden is enabled)
      if (pauseOnHidden && typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      performRefresh();
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, interval, pauseOnHidden, performRefresh]);

  // Handle visibility change - refresh immediately when tab becomes visible
  useEffect(() => {
    if (!pauseOnHidden || typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isActive) {
        // Refresh immediately when tab becomes visible
        performRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pauseOnHidden, isActive, performRefresh]);

  // Sync enabled prop with isActive state
  useEffect(() => {
    setIsActive(enabled);
  }, [enabled]);

  return {
    isRefreshing,
    lastRefresh,
    triggerRefresh,
    start,
    stop,
  };
}

export default useAutoRefresh;
