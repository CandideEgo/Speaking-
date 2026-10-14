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
import { watchHref } from "@/lib/watchEntry";
import { useProfileStore } from "@/stores/profileStore";
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { Search, Bell, Sun, Moon, User, LogOut, HelpCircle, Bookmark, History } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { cn } from "@/lib/utils";

/** Top-level horizontal navigation links (B方案: 顶栏水平导航)。
 *
 * P1-4 导航 IA：桌面与移动统一为「首页 / 频道 / 练习 / 词汇 / 我的」，顺序、
 * 文案、高亮两端口径一致。学习记录/收藏/设置等降为「我的」页或其二级入口，
 * 不再占主干；榜单/周报/通知/兑换/定价同理（见「我的」页）。 */
const NAV = [
  { label: "首页", href: "/", shortcut: "1" },
  { label: "频道", href: "/browse", shortcut: "2" },
  { label: "练习", href: "/practice", shortcut: "3" },
  { label: "词汇", href: "/vocabulary", shortcut: "4" },
  { label: "我的", href: "/profile", shortcut: "5" },
];

/** Avatar dropdown menu (个人中心/收藏/退出) - migrated from Sidebar UserPopover. */
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

  // 1B 设计减法：原「个人资料」「学习偏好」两项同指 /profile，收敛为一项。
  const items = [
    { label: "个人中心", icon: User, href: "/profile" },
    { label: "学习记录", icon: History, href: "/history" },
    { label: "我的收藏", icon: Bookmark, href: "/favorites" },
    { label: "帮助与反馈", icon: HelpCircle, href: "/contact" },
  ];

  return (
    <div
      ref={ref}
      className="absolute top-[calc(100%+8px)] right-0 min-w-[188px] rounded-lg border border-hairline bg-canvas shadow-lift py-1.5 animate-fade-in z-50"
    >
      <div className="px-3.5 py-2 border-b border-hairline mb-1">
        <div className="text-copy font-semibold text-ink">{userName}</div>
      </div>
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          onClick={onClose}
          className="flex items-center gap-2.5 px-3.5 py-2 text-copy text-body hover:bg-surface-card hover:text-ink transition-colors"
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
          className="flex items-center gap-2.5 px-3.5 py-2 text-copy text-muted hover:bg-red-soft hover:text-error transition-colors w-full"
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

  // Avatar - authStore.user is the decoded JWT (no avatar_url / gender), so the profile
  // comes from the shared store: the profile page publishes what it PATCHes, so setting
  // a gender there updates this face without a reload. `undefined` = not answered yet,
  // `null` url = answered "no upload"; Avatar shows a skeleton for the former so a user
  // with a photo never sees a default face flash first.
  const me = useProfileStore((s) => s.me);
  const fetchMe = useProfileStore((s) => s.fetchMe);

  const userName = user?.name || "学习者";

  // Fetch vocab stats for the 单词训练 badge (migrated from Sidebar).
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

  // Fetch the shared profile (avatar_url + gender — neither is on the decoded JWT).
  useEffect(() => {
    if (user) void fetchMe();
  }, [user, fetchMe]);

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
      router.push(watchHref(firstResult.id, { from: "search", extra: { q: searchQuery } }));
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
    <header className="sticky top-0 z-30 h-16 flex-shrink-0 border-b border-hairline bg-topbar-bg/85 backdrop-blur-[10px]">
      {/* 内容套与页面同一个容器：顶栏与内容左右边界才对得齐。padding 只由类里的 gutter
          提供 —— header 自己再写一份会叠加。 */}
      <div className="container-page flex items-center gap-3 sm:gap-5 h-full">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 flex-shrink-0"
          aria-label="SeeWord 首页"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 shadow-brand">
            <span className="text-copy-lg font-extrabold text-white">S</span>
          </div>
          <span className="hidden sm:inline text-title font-extrabold tracking-tight text-ink">
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
                  "relative text-copy font-medium rounded-lg px-3.5 py-2 transition-colors duration-150",
                  active ? "bg-ink text-canvas" : "text-muted hover:bg-surface-card hover:text-ink"
                )}
              >
                {item.label}
                {/* 单词训练 due badge */}
                {item.href === "/vocabulary" && dueCount > 0 && (
                  // BUG-10：写清语义——这是待复习词数，不是未读消息；封顶改成
                  // 「待复习 99+」并补 aria-label/title，与通知小圆点区分。
                  <span
                    className="ml-1.5 inline-flex items-center justify-center h-[18px] px-1.5 text-caption font-semibold bg-brand-500 text-on-primary rounded-pill whitespace-nowrap"
                    aria-label={`待复习 ${dueCount} 个单词`}
                    title={`待复习 ${dueCount} 个单词`}
                  >
                    待复习 {dueCount > 99 ? "99+" : dueCount}
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
              placeholder="搜索视频、字幕…"
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
              onKeyDown={handleSearchKeyDown}
              className="w-full h-10 pl-10 pr-12 rounded-md bg-surface-card border border-transparent
                       text-copy text-ink placeholder:text-muted-soft
                       focus:bg-canvas focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand-500/20
                       transition-colors duration-150"
            />
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-caption text-muted-soft bg-canvas border border-hairline px-1.5 py-0.5 rounded-md font-mono">
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
              <Avatar src={me?.url} name={user} seed={user?.sub} gender={me?.gender} size="md" />
            </button>
            {showAvatarMenu && (
              <AvatarMenu userName={userName} onClose={() => setShowAvatarMenu(false)} />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
