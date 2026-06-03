'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';
import { useSidebar } from '@/components/SidebarProvider';
import { useThemeContext } from '@/components/ThemeProvider';
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
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

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

  useEffect(() => {
    const token = getToken();
    setLoggedIn(!!token);
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setIsAdmin(payload?.role === 'admin');
      } catch {
        setIsAdmin(false);
      }
    } else {
      setIsAdmin(false);
    }
  }, [pathname]);

  function handleLogout() {
    localStorage.removeItem('speaking_token');
    setLoggedIn(false);
    setIsAdmin(false);
    router.push('/');
  }

  function handleHamburger() {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileOpen(!mobileOpen);
    } else {
      toggle();
    }
  }

  const isAuthPage = pathname === '/login' || pathname === '/register';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-hairline bg-canvas px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={handleHamburger}
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
          <div className="relative w-full max-w-[440px]">
            <input
              type="text"
              placeholder="搜索视频..."
              className="w-full h-10 pl-10 pr-4 rounded-md bg-cream-soft border border-hairline
                         text-sm text-ink placeholder:text-muted-foreground
                         focus:border-coral focus:outline-none focus:ring-[3px] focus:ring-coral/15
                         transition-colors duration-150"
            />
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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

        {!loggedIn ? (
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
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-cream-soft transition-colors relative"
              aria-label="通知"
            >
              <BellIcon className="h-5 w-5 text-ink/70" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-coral" />
            </button>

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
                onClick={handleLogout}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-cream-soft transition-colors"
                aria-label="退出登录"
              >
                <LogOutIcon className="h-4 w-4 text-muted-foreground" />
              </button>
              <Link
                href="/dashboard"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-coral text-white text-sm font-medium"
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