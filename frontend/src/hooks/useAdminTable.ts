"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { SortDirection } from "@/components/admin/ui/AdminTable";
import type { Paginated } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseAdminTableOptions<T> {
  /** Fetcher function that returns paginated data. */
  fetcher: (params: AdminTableParams) => Promise<Paginated<T>>;
  /** Initial page size. */
  pageSize?: number;
  /** Initial filters. */
  initialFilters?: Record<string, string | undefined>;
}

export interface AdminTableParams {
  page: number;
  pageSize: number;
  sortKey?: string;
  sortDirection?: SortDirection;
  filters: Record<string, string | undefined>;
  search?: string;
}

export interface UseAdminTableReturn<T> {
  // Data
  data: T[];
  loading: boolean;
  error: string | null;
  total: number;

  // Pagination
  page: number;
  pageSize: number;
  hasMore: boolean;
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;

  // Sorting
  sortKey: string | null;
  sortDirection: SortDirection;
  handleSort: (key: string, direction: SortDirection) => void;

  // Filtering
  filters: Record<string, string | undefined>;
  setFilter: (key: string, value: string | undefined) => void;
  resetFilters: () => void;

  // Search
  search: string;
  setSearch: (value: string) => void;

  // Selection
  selectedKeys: Set<string>;
  setSelectedKeys: (keys: Set<string>) => void;
  clearSelection: () => void;

  // Expand
  expandedKey: string | null;
  setExpandedKey: (key: string | null) => void;

  // Actions
  reload: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAdminTable<T>(options: UseAdminTableOptions<T>): UseAdminTableReturn<T> {
  const { fetcher, pageSize: initialPageSize = 20, initialFilters = {} } = options;

  // State
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [page, setPageState] = useState(1);
  const [pageSize] = useState(initialPageSize);

  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const [filters, setFilters] = useState<Record<string, string | undefined>>(initialFilters);
  const [search, setSearchState] = useState("");

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Fetch data (with stale-response guard)
  const fetchIdRef = useRef(0);
  const fetchData = useCallback(
    async (params: AdminTableParams) => {
      const fetchId = ++fetchIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const result = await fetcher(params);
        if (fetchId !== fetchIdRef.current) return;
        setData(result.items);
        setTotal(result.total ?? 0);
        setHasMore(result.has_more);
      } catch (err) {
        if (fetchId !== fetchIdRef.current) return;
        setError(err instanceof Error ? err.message : "加载失败");
        setData([]);
      } finally {
        if (fetchId === fetchIdRef.current) setLoading(false);
      }
    },
    [fetcher]
  );

  // Build params and fetch
  const doFetch = useCallback(
    (pg: number) => {
      fetchData({
        page: pg,
        pageSize,
        sortKey: sortKey ?? undefined,
        sortDirection,
        filters,
        search: search || undefined,
      });
    },
    [fetchData, pageSize, sortKey, sortDirection, filters, search]
  );

  // Pagination
  const setPage = useCallback(
    (pg: number) => {
      setPageState(pg);
      doFetch(pg);
    },
    [doFetch]
  );

  const nextPage = useCallback(() => {
    if (hasMore) setPage(page + 1);
  }, [hasMore, page, setPage]);

  const prevPage = useCallback(() => {
    if (page > 1) setPage(page - 1);
  }, [page, setPage]);

  // Sorting
  const handleSort = useCallback(
    (key: string, direction: SortDirection) => {
      setSortKey(direction ? key : null);
      setSortDirection(direction);
      setPageState(1);
      fetchData({
        page: 1,
        pageSize,
        sortKey: direction ? key : undefined,
        sortDirection: direction,
        filters,
        search: search || undefined,
      });
    },
    [fetchData, pageSize, filters, search]
  );

  // Filtering
  const setFilter = useCallback(
    (key: string, value: string | undefined) => {
      const newFilters = { ...filters, [key]: value };
      setFilters(newFilters);
      setPageState(1);
      setSelectedKeys(new Set());
      fetchData({
        page: 1,
        pageSize,
        sortKey: sortKey ?? undefined,
        sortDirection,
        filters: newFilters,
        search: search || undefined,
      });
    },
    [fetchData, filters, pageSize, sortKey, sortDirection, search]
  );

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
    setSearchState("");
    setPageState(1);
    setSelectedKeys(new Set());
    fetchData({
      page: 1,
      pageSize,
      sortKey: sortKey ?? undefined,
      sortDirection,
      filters: initialFilters,
      search: undefined,
    });
  }, [fetchData, initialFilters, pageSize, sortKey, sortDirection]);

  // Search
  const setSearch = useCallback(
    (value: string) => {
      setSearchState(value);
      setPageState(1);
      fetchData({
        page: 1,
        pageSize,
        sortKey: sortKey ?? undefined,
        sortDirection,
        filters,
        search: value || undefined,
      });
    },
    [fetchData, pageSize, sortKey, sortDirection, filters]
  );

  // Selection
  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  // Reload
  const reload = useCallback(() => {
    setPageState(1);
    setSelectedKeys(new Set());
    doFetch(1);
  }, [doFetch]);

  // Initial fetch
  useEffect(() => {
    doFetch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    data,
    loading,
    error,
    total,
    page,
    pageSize,
    hasMore,
    setPage,
    nextPage,
    prevPage,
    sortKey,
    sortDirection,
    handleSort,
    filters,
    setFilter,
    resetFilters,
    search,
    setSearch,
    selectedKeys,
    setSelectedKeys,
    clearSelection,
    expandedKey,
    setExpandedKey,
    reload,
  };
}
