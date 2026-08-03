"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { useVocabularyStore } from "@/stores/vocabularyStore";
import { useThemeContext } from "@/components/common/ThemeProvider";
import {
  SearchDropdown,
  type SearchResultItem,
  type SubtitleSearchResult,
} from "@/components/search/SearchDropdown";
import { NotificationDropdown } from "@/components/notifications/NotificationDropdown";
import { api } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { Search, Bell, Sun, Moon, User, Settings, Crown, LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { cn } from "@/lib/utils";

/** Top-level horizontal navigation links (B方案: 顶栏水平导航). */
const NAV = [
  { label: "首页", href: "/", shortcut: "1" },
  { label: "发现", href: "/browse", shortcut: "2" },
  { label: "练习专题", href: "/practice", shortcut: "3" },
  { label: "词汇本", href: "/vocabulary", shortcut: "4" },
  { label: "学习记录", href: "/history", shortcut: "5" },
];

/** Avatar dropdown menu (资料/偏好/会员/退出) - migrated from Sidebar UserPopover. */
function AvatarMenu({ userName, onClose }: { userName: string; onClose: () => void }) {
  const logout = useAuthStore((s) => s.logout);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const items = [
    { label: "个人资料", icon: User, href: "/profile" },
    { label: "学习偏好", icon: Settings, href: "/profile" },
    { label: "Pro 会员", icon: Crown, href: "/pricing" },
  ];

  return (
    <div
      ref={ref}
      className="absolute top-[calc(100%+8px)] right-0 min-w-[188px] rounded-lg border border-hairline bg-canvas shadow-lift py-1.5 animate-fade-in z-50"
    >
      <div className="px-3.5 py-2 border-b border-hairline mb-1">
        <div className="text-[13px] font-semibold text-ink">{userName}</div>
        <div className="text-[11px] text-muted mt-0.5">SeeWord 学习者</div>
      </div>
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          onClick={onClose}
          className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-body hover:bg-surface-card hover:text-ink transition-colors"
        >
          <item.icon size={15} className="text-muted" />
          {item.label}
        </Link>
      ))}
      <div className="border-t border-hairline mt-1 pt-1">
        <button
          onClick={() => {
            onClose();
            logout();
          }}
          className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-muted hover:bg-red-soft hover:text-error transition-colors w-full"
        >
          <LogOut size={15} />
          退出登录
        </button>
      </div>
    </div>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme, mounted } = useThemeContext();
  const { user } = useAuthStore();
  const fetchStats = useVocabularyStore((s) => s.fetchStats);
  const dueCount = useVocabularyStore((s) => s.stats.due_count);

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

  // Avatar menu state
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const avatarWrapRef = useRef<HTMLDivElement>(null);

  // Avatar URL - authStore.user is the decoded JWT (no avatar_url), so fetch
  // the profile to render the user's avatar image.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const userName = user?.name || "学习者";

  // Fetch vocab stats for the 词汇本 badge (migrated from Sidebar).
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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
      if (avatarWrapRef.current && !avatarWrapRef.current.contains(e.target as Node)) {
        setShowAvatarMenu(false);
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
    setShowAvatarMenu(false);
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

  // Fetch the user's avatar URL (not present on the decoded JWT).
  useEffect(() => {
    if (!user) {
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    api<{ avatar_url?: string | null }>("/api/v1/users/me")
      .then((u) => {
        if (!cancelled) setAvatarUrl(u.avatar_url ?? null);
      })
      .catch(() => {
        /* silently fail - fallback to initial */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

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
      const item = NAV.find((n) => n.shortcut === e.key);
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
    if (e.key === "Enter" && searchResults.length > 0) {
      e.preventDefault();
      const firstResult = searchResults[0];
      setShowDropdown(false);
      router.push(`/watch/${firstResult.id}`);
    }
  }

  function handleSelect(_videoId: string) {
    setShowDropdown(false);
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-30 h-16 flex-shrink-0 border-b border-hairline bg-topbar-bg/85 backdrop-blur-[10px] flex items-center gap-3 sm:gap-5 px-4 sm:px-7">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 flex-shrink-0" aria-label="SeeWord 首页">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 shadow-brand">
          <span className="text-[17px] font-extrabold text-white">S</span>
        </div>
        <span className="hidden sm:inline text-[18px] font-extrabold tracking-tight text-ink">
          See<span className="text-brand-500">Word</span>
        </span>
      </Link>

      {/* Desktop horizontal nav-links */}
      <nav className="hidden md:flex items-center gap-0.5 flex-shrink-0">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative text-sm font-medium rounded-lg px-3.5 py-2 transition-colors duration-150",
                active ? "bg-ink text-canvas" : "text-muted hover:bg-surface-card hover:text-ink"
              )}
            >
              {item.label}
              {/* 词汇本 due badge */}
              {item.href === "/vocabulary" && dueCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-semibold bg-brand-500 text-on-primary rounded-pill">
                  {dueCount > 99 ? "99+" : dueCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Search - centered */}
      <div className="flex flex-1 justify-center max-w-[520px] mx-auto">
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
            placeholder="搜索视频、字幕、单词…"
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowDropdown(true);
            }}
            onKeyDown={handleSearchKeyDown}
            className="w-full h-10 pl-10 pr-12 rounded-md bg-surface-card border border-transparent
                       text-sm text-ink placeholder:text-muted-soft
                       focus:bg-canvas focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand-500/20
                       transition-colors duration-150"
          />
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft" />
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

      {/* Right actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Theme toggle (migrated from Sidebar) */}
        {mounted && (
          <Button
            onClick={toggleTheme}
            variant="ghost"
            size="icon"
            aria-label="切换主题"
            title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
        )}

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

        {/* Avatar with dropdown menu */}
        <div ref={avatarWrapRef} className="relative ml-1.5">
          <button
            onClick={() => setShowAvatarMenu((v) => !v)}
            aria-label="账号菜单"
            className="rounded-full transition-transform duration-150 hover:scale-105"
          >
            <Avatar src={avatarUrl} name={user} seed={user?.sub} size="md" />
          </button>
          {showAvatarMenu && (
            <AvatarMenu userName={userName} onClose={() => setShowAvatarMenu(false)} />
          )}
        </div>
      </div>
    </header>
  );
}
