"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Response shape that every paginated API must return. */
export interface PaginatedResponse<T> {
  items: T[];
  has_more: boolean;
  total?: number;
}

/** Mode determines how new pages are merged into the items list. */
export type PaginationMode = "replace" | "append";

export interface UsePaginatedListOptions<T> {
  /**
   * Function that fetches a single page. Receives the 1-based page number.
   * Must return `{ items, has_more, total? }`.
   */
  fetcher: (page: number) => Promise<PaginatedResponse<T>>;

  /** How to merge new pages into the items list.
   *  - "replace": each fetch replaces the list (page-based tables).
   *  - "append": page-1 replaces, later pages append (infinite scroll).
   *  @default "replace"
   */
  mode?: PaginationMode;

  /**
   * Reactive filter dependencies. When any value changes, the list resets
   * to page 1 and re-fetches. Pass an empty array to fetch once on mount.
   */
  filters?: unknown[];

  /** Whether to enable fetching. Defaults to true. Set false while auth is loading. */
  enabled?: boolean;
}

export interface UsePaginatedListReturn<T> {
  /** Current items (full accumulated list in append mode, current page in replace mode). */
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;

  /** Current 1-based page number. */
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;

  /** Whether more pages are available. */
  hasMore: boolean;

  /** Total item count (if the API returns it). */
  total: number;

  /** Whether a fetch is in progress. */
  loading: boolean;

  /** Last error message, or null. */
  error: string | null;

  /** Fetch the next page (page + 1). No-op if loading or no more pages. */
  loadMore: () => void;

  /** Re-fetch the current page (or page 1 if you want a full reset). */
  reload: () => void;

  /** Sentinel ref for IntersectionObserver-based infinite scroll. */
  loaderRef: React.RefObject<HTMLDivElement>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePaginatedList<T>(
  options: UsePaginatedListOptions<T>,
): UsePaginatedListReturn<T> {
  const { fetcher, mode = "replace", filters = [], enabled = true } = options;

  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard against stale fetches when filters change rapidly.
  const fetchIdRef = useRef(0);
  // Stable ref for the fetcher to avoid re-creating internal callbacks.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Track latest page in a ref so IntersectionObserver can read it
  // without stale closures.
  const pageRef = useRef(page);
  pageRef.current = page;

  const loaderRef = useRef<HTMLDivElement>(null);

  // -----------------------------------------------------------------------
  // Core fetch
  // -----------------------------------------------------------------------

  const fetchPage = useCallback(
    async (pg: number) => {
      const fetchId = ++fetchIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const data = await fetcherRef.current(pg);
        // Discard if a newer fetch has been initiated.
        if (fetchId !== fetchIdRef.current) return;

        if (mode === "append") {
          if (pg === 1) {
            setItems(data.items);
          } else {
            setItems((prev) => [...prev, ...data.items]);
          }
        } else {
          setItems(data.items);
        }
        setHasMore(data.has_more);
        if (data.total !== undefined) setTotal(data.total);
      } catch (err) {
        if (fetchId !== fetchIdRef.current) return;
        const msg = err instanceof Error ? err.message : "加载失败";
        setError(msg);
      } finally {
        if (fetchId === fetchIdRef.current) setLoading(false);
      }
    },
    [mode],
  );

  // -----------------------------------------------------------------------
  // Filter change -> reset to page 1
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!enabled) return;
    setPage(1);
    setHasMore(true);
    setTotal(0);
    setError(null);
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...filters, enabled]);

  // -----------------------------------------------------------------------
  // Page change (for replace mode, user clicking prev/next)
  // -----------------------------------------------------------------------

  useEffect(() => {
    // Skip the initial mount -- the filter effect already fetches page 1.
    // Also skip if filters just changed (the filter effect handles it).
    if (!enabled) return;
    if (page === 1) return;
    fetchPage(page);
  }, [page, enabled, fetchPage]);

  // -----------------------------------------------------------------------
  // Infinite scroll via IntersectionObserver (append mode only)
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (mode !== "append") return;
    const el = loaderRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          const nextPage = pageRef.current + 1;
          setPage(nextPage);
          fetchPage(nextPage);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [mode, hasMore, loading, fetchPage]);

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(nextPage);
  }, [loading, hasMore, page, fetchPage]);

  const reload = useCallback(() => {
    setPage(1);
    setHasMore(true);
    fetchPage(1);
  }, [fetchPage]);

  return {
    items,
    setItems,
    page,
    setPage,
    hasMore,
    total,
    loading,
    error,
    loadMore,
    reload,
    loaderRef,
  };
}
