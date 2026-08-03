"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getWorkerStatus, getUgcPendingCount } from "@/lib/adminData";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseAdminPollingOptions<T> {
  /** Async function that fetches the data. */
  fetcher: () => Promise<T>;
  /** Polling interval in milliseconds. Default: 60000 (1 minute). */
  interval?: number;
  /** Whether polling is enabled. Default: true. */
  enabled?: boolean;
  /** Initial data value. */
  initialData?: T | null;
  /** Called when fetch fails. */
  onError?: (error: Error) => void;
}

export interface UseAdminPollingReturn<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** Manually trigger a refresh. */
  refresh: () => void;
  /** Timestamp of last successful fetch. */
  lastUpdated: Date | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAdminPolling<T>(options: UseAdminPollingOptions<T>): UseAdminPollingReturn<T> {
  const { fetcher, interval = 60000, enabled = true, initialData = null, onError } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const doFetch = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Fetch failed");
      setError(error);
      onErrorRef.current?.(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    doFetch(true);
  }, [doFetch]);

  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    doFetch(true);
  }, [enabled, doFetch]);

  // Polling interval — pauses while the tab is hidden.
  useVisibilityAwareInterval(() => doFetch(false), interval, enabled);

  return {
    data,
    loading,
    error,
    refresh,
    lastUpdated,
  };
}

// ---------------------------------------------------------------------------
// Convenience: useWorkerStatus
// ---------------------------------------------------------------------------

export function useWorkerStatus(enabled = true) {
  return useAdminPolling<{ worker_online: boolean }>({
    fetcher: getWorkerStatus,
    interval: 30000,
    enabled,
  });
}

// ---------------------------------------------------------------------------
// Convenience: useUgcPendingCount
// ---------------------------------------------------------------------------

export function useUgcPendingCount(enabled = true) {
  return useAdminPolling<{ pending_processing: number; pending_review: number; total: number }>({
    fetcher: getUgcPendingCount,
    interval: 60000,
    enabled,
  });
}
