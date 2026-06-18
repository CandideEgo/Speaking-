'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useSidebar } from '@/components/SidebarProvider';
import { useThemeContext } from '@/components/ThemeProvider';
import { SearchDropdown, type SearchResultItem } from '@/components/SearchDropdown';
import { NotificationDropdown } from '@/components/NotificationDropdown';
import { api } from '@/lib/api';
import {
  MenuIcon,
  SearchIcon,
  BellIcon,
  SunIcon,
  MoonIcon,
  UserIcon,
  LogOutIcon,
  ShieldIcon,
  SparklesIcon,
} from '@/components/Icons';

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle, setMobileOpen, mobileOpen } = useSidebar();
  const { theme, toggleTheme, mounted } = useThemeContext();
  const { isAuthenticated, user, logout } = useAuthStore();

  const isAdmin = user?.role === 'admin';

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
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
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const results = await api<SearchResultItem[]>(
        `/api/v1/videos/search?q=${encodeURIComponent(query)}&limit=20`
      );
      setSearchResults(results);
      setShowDropdown(true);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!value.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }

    // Debounce: 300ms after last keystroke
    debounceTimerRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  }, [performSearch]);

  // Close dropdown on click-away
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setShowDropdown(false);
    setSearchQuery('');
    setSearchResults([]);
    setShowNotifications(false);
  }, [pathname]);

  // Fetch unread notification count on mount and when auth changes
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    async function fetchUnreadCount() {
      try {
        const data = await api<{ count: number }>('/api/v1/notifications/unread-count');
        if (!cancelled) setUnreadCount(data.count);
      } catch {
        // Silently fail — badge is non-critical
      }
    }
    fetchUnreadCount();
    // Poll every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isAuthenticated]);

  // Keyboard handling
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
          setMobileOpen(!mobileOpen);
        } else {
          toggle();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, toggle, setMobileOpen]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setShowDropdown(false);
      searchInputRef.current?.blur();
    }
    if (e.key === 'Enter' && searchResults.length > 0) {
      e.preventDefault();
      const firstResult = searchResults[0];
      setShowDropdown(false);
      router.push(`/watch/${firstResult.id}`);
    }
  }

  function handleSelect(videoId: string) {
    setShowDropdown(false);
  }

  const isAuthPage = pathname === '/login' || pathname === '/register';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-hairline bg-canvas px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (typeof window !== 'undefined' && window.innerWidth < 768) {
              setMobileOpen(!mobileOpen);
            } else {
              toggle();
            }
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-cream-soft transition-colors"
          aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          <MenuIcon className="h-5 w-5 text-ink/70" />
        </button>

        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-coral text-white text-sm font-semibold">
            S
          </span>
          <span className="hidden sm:inline text-lg font-display font-normal text-ink tracking-tight">
            Speaking
          </span>
        </Link>
      </div>

      {!isAuthPage && (
        <div className="flex flex-1 justify-center max-w-[600px] mx-auto">
          <div ref={searchContainerRef} className="relative w-full max-w-[440px]">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="搜索视频..."
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
              onKeyDown={handleSearchKeyDown}
              className="w-full h-10 pl-10 pr-4 rounded-md bg-cream-soft border border-hairline
                         text-sm text-ink placeholder:text-muted-foreground
                         focus:border-coral focus:outline-none focus:ring-[3px] focus:ring-coral/15
                         transition-colors duration-150"
            />
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            {showDropdown && (
              <SearchDropdown
                results={searchResults}
                isLoading={isSearching}
                query={searchQuery}
                onSelect={handleSelect}
                onClose={() => setShowDropdown(false)}
              />
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 ml-auto">
        {mounted && (
          <button
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-cream-soft transition-colors"
            aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          >
            {theme === 'dark' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
          </button>
        )}

        {!isAuthenticated ? (
          <>
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-ink transition-colors px-3 py-2"
            >
              登录
            </Link>
            <Link
              href="/register"
              className="btn-primary !py-2 !px-4 text-sm"
            >
              <SparklesIcon className="h-4 w-4" />
              免费试用
            </Link>
          </>
        ) : (
          <>
            <div className="relative">
              <button
                onClick={() => setShowNotifications(prev => !prev)}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-cream-soft transition-colors relative"
                aria-label="通知"
              >
                <BellIcon className="h-5 w-5 text-ink/70" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-coral text-white text-[10px] font-bold leading-none px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <NotificationDropdown
                  onClose={() => setShowNotifications(false)}
                  onUnreadCountChange={setUnreadCount}
                />
              )}
            </div>

            <div className="flex items-center gap-2 pl-2">
              {!isAuthPage && isAdmin && (
                <Link
                  href="/admin"
                  className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-cream-soft transition-colors"
                  aria-label="管理面板"
                >
                  <ShieldIcon className="h-5 w-5 text-coral" />
                </Link>
              )}
              <button
                onClick={logout}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-cream-soft transition-colors"
                aria-label="退出登录"
              >
                <LogOutIcon className="h-4 w-4 text-muted-foreground" />
              </button>
              <Link
                href="/dashboard"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-coral text-white text-sm font-medium"
                aria-label="个人中心"
              >
                <UserIcon className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
