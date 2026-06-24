"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { useSidebar } from "@/components/layout/SidebarProvider";
import { useThemeContext } from "@/components/common/ThemeProvider";
import {
  SearchDropdown,
  type SearchResultItem,
  type SubtitleSearchResult,
} from "@/components/search/SearchDropdown";
import { NotificationDropdown } from "@/components/notifications/NotificationDropdown";
import { api } from "@/lib/api";
import { SearchIcon, BellIcon, SunIcon, MoonIcon, SparklesIcon } from "@/components/common/Icons";

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { setMobileOpen } = useSidebar();
  const { theme, toggleTheme, mounted } = useThemeContext();
  const { isAuthenticated, user } = useAuthStore();

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [subtitleResults, setSubtitleResults] = useState<SubtitleSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Notification state
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Debounced search
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSubtitleResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const [videoResults, subResults] = await Promise.all([
        api<SearchResultItem[]>(`/api/v1/videos/search?q=${encodeURIComponent(query)}&limit=10`),
        api<SubtitleSearchResult[]>(
          `/api/v1/videos/search/subtitles?q=${encodeURIComponent(query)}&limit=5`
        ).catch(() => [] as SubtitleSearchResult[]),
      ]);
      setSearchResults(videoResults);
      setSubtitleResults(subResults);
      setShowDropdown(true);
    } catch {
      setSearchResults([]);
      setSubtitleResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (!value.trim()) {
        setSearchResults([]);
        setSubtitleResults([]);
        setShowDropdown(false);
        setIsSearching(false);
        return;
      }
      debounceTimerRef.current = setTimeout(() => {
        performSearch(value);
      }, 300);
    },
    [performSearch]
  );

  // Close dropdown on click-away
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setShowDropdown(false);
    setSearchQuery("");
    setSearchResults([]);
    setSubtitleResults([]);
    setShowNotifications(false);
  }, [pathname]);

  // Fetch unread notification count
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    async function fetchUnreadCount() {
      try {
        const data = await api<{ count: number }>("/api/v1/notifications/unread-count");
        if (!cancelled) setUnreadCount(data.count);
      } catch {
        // silently fail
      }
    }
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  // Cmd+K / Ctrl+K to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setShowDropdown(false);
      searchInputRef.current?.blur();
    }
    if (e.key === "Enter" && searchResults.length > 0) {
      e.preventDefault();
      const firstResult = searchResults[0];
      setShowDropdown(false);
      router.push(`/watch/${firstResult.id}`);
    }
  }

  function handleSelect(videoId: string) {
    setShowDropdown(false);
  }

  const isAuthPage = pathname === "/login" || pathname === "/register";
  const userInitial = (user?.name?.[0] || user?.email?.[0] || "?").toUpperCase();

  return (
    <header className="sticky top-0 z-30 h-16 flex-shrink-0 border-b border-hairline bg-white/85 backdrop-blur-[10px] flex items-center gap-4 px-4 sm:px-7">
      {/* Search — centered */}
      {!isAuthPage && (
        <div className="flex flex-1 justify-center max-w-[520px] mx-auto">
          {/* Mobile: search icon button */}
          <div className="md:hidden flex items-center">
            <Link href="/search" className="btn-icon" aria-label="搜索">
              <SearchIcon className="h-[17px] w-[17px]" />
            </Link>
          </div>
          {/* Desktop: search input */}
          <div ref={searchContainerRef} className="hidden md:block relative w-full">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="搜索视频、字幕、单词…"
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
              onKeyDown={handleSearchKeyDown}
              className="w-full h-10 pl-10 pr-12 rounded-sm bg-surface-card border border-transparent
                         text-sm text-ink placeholder:text-muted-soft
                         focus:bg-canvas focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-[rgba(10,10,10,0.06)]
                         transition-colors duration-150"
            />
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-[17px] w-[17px] text-muted-soft" />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-soft bg-canvas border border-hairline px-1.5 py-0.5 rounded-md font-mono">
              ⌘K
            </kbd>
            {showDropdown && (
              <SearchDropdown
                results={searchResults}
                subtitleResults={subtitleResults}
                isLoading={isSearching}
                query={searchQuery}
                onSelect={handleSelect}
                onClose={() => setShowDropdown(false)}
              />
            )}
          </div>
        </div>
      )}

      {/* Right actions */}
      <div className="flex items-center gap-1.5">
        {mounted && (
          <button
            onClick={toggleTheme}
            className="btn-icon"
            aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          >
            {theme === "dark" ? (
              <SunIcon className="h-[18px] w-[18px]" />
            ) : (
              <MoonIcon className="h-[18px] w-[18px]" />
            )}
          </button>
        )}

        {!isAuthenticated ? (
          <>
            <Link href="/login" className="btn-ghost">
              登录
            </Link>
            <Link href="/register" className="btn-primary !py-2 !px-4 text-[13px]">
              免费试用
            </Link>
          </>
        ) : (
          <>
            {/* Notification */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications((prev) => !prev)}
                className="btn-icon relative"
                aria-label="通知"
              >
                <BellIcon className="h-[18px] w-[18px]" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-[7px] h-[7px] rounded-full bg-brand-500 border-2 border-canvas" />
                )}
              </button>
              {showNotifications && (
                <NotificationDropdown
                  onClose={() => setShowNotifications(false)}
                  onUnreadCountChange={setUnreadCount}
                />
              )}
            </div>

            {/* Avatar */}
            <Link
              href="/profile"
              className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-brand-500 to-brand-400 text-on-primary font-bold text-sm flex items-center justify-center ml-1.5"
              aria-label="个人中心"
            >
              {userInitial}
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
