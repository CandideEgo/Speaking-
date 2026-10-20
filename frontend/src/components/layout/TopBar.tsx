"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import {
  SearchDropdown,
  type SearchResultItem,
  type SubtitleSearchResult,
} from "@/components/search/SearchDropdown";
import { NotificationDropdown } from "@/components/notifications/NotificationDropdown";
import { api } from "@/lib/api";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { Search, Bell } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { MAIN_NAV } from "@/lib/navigation";

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();

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

  // Close dropdowns on route change
  useEffect(() => {
    setShowDropdown(false);
    setSearchQuery("");
    setSearchResults([]);
    setSubtitleResults([]);
    setShowNotifications(false);
  }, [pathname]);

  // Fetch unread notification count — polling pauses while the tab is hidden.
  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await api<{ count: number }>("/api/v1/notifications/unread-count");
      setUnreadCount(data.count);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    fetchUnreadCount();
  }, [user, fetchUnreadCount]);

  useVisibilityAwareInterval(fetchUnreadCount, 30000, Boolean(user));

  // Cmd+K / Ctrl+K to focus search; Ctrl/Cmd+1~5 to jump nav (migrated from Sidebar)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const item = MAIN_NAV.find((n) => n.shortcut === e.key);
      if (item) {
        e.preventDefault();
        router.push(item.href);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setShowDropdown(false);
      searchInputRef.current?.blur();
    }
    if (e.key === "Enter" && searchQuery.trim()) {
      e.preventDefault();
      setShowDropdown(false);
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  }

  function handleSelect(_videoId: string) {
    setShowDropdown(false);
  }

  return (
    <header className="user-topbar sticky top-0 z-30 h-16 flex-shrink-0 border-b border-hairline bg-topbar-bg">
      {/* 内容套与页面同一个容器：顶栏与内容左右边界才对得齐。padding 只由类里的 gutter
          提供 —— header 自己再写一份会叠加。 */}
      <div className="container-page flex items-center gap-3 sm:gap-5 h-full">
        {/* Logo——与设计顶栏品牌区一致：品牌标 24px + 15px/800 字标 */}
        <Link
          href="/"
          className="flex items-center gap-2 flex-shrink-0 md:hidden mr-auto"
          aria-label="SeeWord 首页"
        >
          <Image src="/logo.png" alt="" width={24} height={24} priority />
          <span className="text-[15px] font-extrabold tracking-[-0.03em] text-ink">SeeWord</span>
        </Link>

        {/* 搜索页使用正文输入框，其余页面在工具栏搜索。 */}
        {pathname !== "/search" && (
          <div className="flex min-w-0 md:flex-1 md:max-w-[320px]">
            {/* Mobile: search icon button */}
            <div className="md:hidden flex items-center">
              <LinkButton href="/search" variant="ghost" size="icon" aria-label="搜索">
                <Search size={17} />
              </LinkButton>
            </div>
            {/* Desktop: search input */}
            <div ref={searchContainerRef} className="hidden md:block relative w-full">
              <input
                ref={searchInputRef}
                type="text"
                aria-label="搜索视频与字幕"
                placeholder="搜索视频、字幕…"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowDropdown(true);
                }}
                onKeyDown={handleSearchKeyDown}
                className="w-full h-9 pl-10 pr-12 rounded-md bg-surface-soft border border-transparent
                       text-copy text-ink placeholder:text-muted
                       focus:bg-canvas focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand-500/20
                       transition-colors duration-150"
              />
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-caption text-muted bg-transparent border border-hairline-strong px-1 py-0.5 rounded-sm font-sans">
                ⌘K
              </kbd>
              {showDropdown && (
                <SearchDropdown
                  results={searchResults}
                  subtitleResults={subtitleResults}
                  isLoading={isSearching}
                  query={searchQuery}
                  onSelect={handleSelect}
                />
              )}
            </div>
          </div>
        )}

        {/* Right actions */}
        <div className="md:ml-auto flex items-center gap-1.5 flex-shrink-0">
          {/* Notification */}
          <div className="relative">
            <Button
              onClick={() => setShowNotifications((prev) => !prev)}
              variant="ghost"
              size="icon"
              aria-label="通知"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-[7px] h-[7px] rounded-full bg-brand-500 border-2 border-canvas" />
              )}
            </Button>
            {showNotifications && (
              <NotificationDropdown
                onClose={() => setShowNotifications(false)}
                onUnreadCountChange={setUnreadCount}
              />
            )}
          </div>

          <div className="md:hidden">
            <AccountMenu placement="topbar" />
          </div>
        </div>
      </div>
    </header>
  );
}
