'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getToken } from '@/lib/api';

export default function Header() {
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getToken());
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight text-slate-900">
          Speaking
        </Link>
        <nav className="flex items-center gap-6">
          {!loggedIn ? (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                登录
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm"
              >
                免费试用
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/redeem"
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                兑换
              </Link>
              <Link
                href="/dashboard"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm"
              >
                学习面板
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
