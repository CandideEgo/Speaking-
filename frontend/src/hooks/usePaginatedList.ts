"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Paginated } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mode determines how new pages are merged into the items list. */
export type PaginationMode = "replace" | "append";

export interface UsePaginatedListOptions<T> {
  /**
   * Function that fetches a single page. Receives the 1-based page number.
   * Must return `{ items, has_more, total? }`.
   */
  fetcher: (page: number) => Promise<Paginated<T>>;

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
  loaderRef: React.RefObject<HTMLDivElement | null>;
}

// ---------------------------------------------------------------------------
// Request decision
// ---------------------------------------------------------------------------

/**
 * Which page `loadMore` should request next, or `null` when the call is a
 * no-op.
 *
 * Retrying the page that *failed* is the point: `requestedPage` still points
 * at it, so advancing would silently skip a page the user never saw. That is
 * the FE-01 regression, kept as a pure function so it can be tested without a
 * DOM.
 */
export function nextPageToLoad(input: {
  requestedPage: number;
  hasMore: boolean;
  failed: boolean;
  inflight: boolean;
}): number | null {
  if (input.inflight || !input.hasMore) return null;
  return input.failed ? input.requestedPage : input.requestedPage + 1;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePaginatedList<T>(
  options: UsePaginatedListOptions<T>
): UsePaginatedListReturn<T> {
  const { fetcher, mode = "replace", filters = [], enabled = true } = options;

  // A serialized, fixed-length form of `filters`: the effect below must react to
  // filter values without letting the dep array change size when a caller's
  // filters array length changes (React rejects a growing/shrinking dep array).
  const filtersKey = filters.map((f) => String(f)).join("\u0001");

  // Two pointers, deliberately kept apart:
  //   `page`          — the page whose data is on screen. It advances only when
  //                     a fetch succeeds, so a failure never moves the user
  //                     past a page they never saw.
  //   `request.page`  — the page we are asking for. It may sit ahead of `page`
  //                     while a request is in flight, and it stays on the
  //                     failed page after an error so a retry re-requests that
  //                     exact page instead of the next one.
  // `attempt` is a counter, not a page: it exists so retrying the *same* page
  // produces a new request object (setting state to an equal value is a no-op).
  const [page, setPage] = useState(1);
  const [request, setRequest] = useState<{ page: number; attempt: number }>({
    page: 1,
    attempt: 0,
  });
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // First-fetch gate: the IntersectionObserver shouldn't fire `loadMore`
  // before the initial page-1 fetch has resolved. Otherwise the IO callback
  // runs on mount with hasMore=true (initial state) and !loading (initial
  // state), triggers a page-2 request, and the fetchId guard discards the
  // arriving page-1 response in favor of the empty page-2 result — leaving
  // the list visibly empty.
  const hasFetchedOnceRef = useRef(false);

  // Synchronous guards for the observer and the retry entry: `loading` only
  // turns true on the next render, so two callbacks firing in the same tick
  // would both slip past a `!loading` check.
  const inflightRef = useRef(false);
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const errorRef = useRef(error);
  errorRef.current = error;

  // Guard against stale fetches when filters change rapidly.
  const fetchIdRef = useRef(0);
  // Stable ref for the fetcher to avoid re-creating internal callbacks.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const loaderRef = useRef<HTMLDivElement>(null);

  // Stable read of the pending request for `loadMore`, which must not take a
  // new identity every time `request` changes.
  const requestRef = useRef(request);
  requestRef.current = request;

  // -----------------------------------------------------------------------
  // Core fetch
  // -----------------------------------------------------------------------

  const fetchPage = useCallback(
    async (pg: number) => {
      const fetchId = ++fetchIdRef.current;
      inflightRef.current = true;
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
        setPage(pg);
        setHasMore(data.has_more);
        if (data.total !== undefined) setTotal(data.total);
        hasFetchedOnceRef.current = true;
      } catch (err) {
        if (fetchId !== fetchIdRef.current) return;
        const msg = err instanceof Error ? err.message : "加载失败";
        // `page` intentionally stays put: it keeps naming the last page that
        // actually loaded, and the retry entry re-requests `request.page`.
        setError(msg);
      } finally {
        if (fetchId === fetchIdRef.current) {
          inflightRef.current = false;
          setLoading(false);
        }
      }
    },
    [mode]
  );

  // -----------------------------------------------------------------------
  // Filter change -> reset to page 1
  // -----------------------------------------------------------------------

  // Skip the first render: the fetch effect below already requests page 1 on
  // mount, and resetting again here would fire a second request for it.
  const filtersKeyRef = useRef(filtersKey);
  useEffect(() => {
    if (filtersKeyRef.current === filtersKey) return;
    filtersKeyRef.current = filtersKey;
    setPage(1);
    setHasMore(true);
    setTotal(0);
    setError(null);
    hasFetchedOnceRef.current = false;
    setRequest((prev) => ({ page: 1, attempt: prev.attempt + 1 }));
  }, [filtersKey]);

  // -----------------------------------------------------------------------
  // The single request trigger
  // -----------------------------------------------------------------------

  // Every page request goes through here — next page, retry, prev/next, reset.
  // Having exactly one trigger is what stops `loadMore` and the old page
  // effect from both fetching the same page.
  useEffect(() => {
    if (!enabled) return;
    void fetchPage(request.page);
  }, [request, enabled, fetchPage]);

  // -----------------------------------------------------------------------
  // Infinite scroll via IntersectionObserver (append mode only)
  // -----------------------------------------------------------------------

  const loadMore = useCallback(() => {
    const next = nextPageToLoad({
      requestedPage: requestRef.current.page,
      hasMore: hasMoreRef.current,
      // An error means the last request failed, so `requestRef` is still
      // pointing at the page that failed.
      failed: errorRef.current !== null,
      inflight: inflightRef.current,
    });
    if (next === null) return;
    // Always a new object, even when the page number is unchanged: `attempt`
    // is what makes a same-page retry re-run the fetch effect.
    setRequest((prev) => ({ page: next, attempt: prev.attempt + 1 }));
  }, []);

  // Stable handle for the observer, which must not re-subscribe on every
  // render just to see the latest `loadMore`.
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  useEffect(() => {
    if (mode !== "append") return;
    const el = loaderRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        // A failing page stops the automatic chain: re-requesting it from the
        // observer on every intersection would hammer the API. The explicit
        // retry entry (loadMore) is the way back.
        if (!hasFetchedOnceRef.current || errorRef.current) return;
        loadMoreRef.current();
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [mode]);

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Jump to a page. Also accepts an updater, like `useState`'s setter. */
  const goToPage: React.Dispatch<React.SetStateAction<number>> = useCallback((action) => {
    setRequest((prev) => {
      const next = typeof action === "function" ? action(prev.page) : action;
      const safe = Number.isFinite(next) ? Math.max(1, Math.floor(next)) : prev.page;
      return { page: safe, attempt: prev.attempt + 1 };
    });
  }, []);

  const reload = useCallback(() => {
    setHasMore(true);
    setError(null);
    setPage(1);
    setRequest((prev) => ({ page: 1, attempt: prev.attempt + 1 }));
  }, []);

  return {
    items,
    setItems,
    page,
    setPage: goToPage,
    hasMore,
    total,
    loading,
    error,
    loadMore,
    reload,
    loaderRef,
  };
}
