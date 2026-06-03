'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/components/SidebarProvider';
import {
  HomeIcon,
  LayoutDashboardIcon,
  BookOpenIcon,
  GiftIcon,
  SettingsIcon,
  YoutubeIcon,
  SparklesIcon,
  UsersIcon,
} from '@/components/Icons';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    title: '精选推荐',
    items: [
      { label: '首页', href: '/', icon: SparklesIcon },
    ],
  },
  {
    title: '社区推荐',
    items: [
      { label: '社区精选', href: '/community', icon: UsersIcon },
    ],
  },
  {
    title: 'Youtube频道',
    items: [
      { label: '发现', href: '/browse', icon: YoutubeIcon },
    ],
  },
  {
    title: '学习记录',
    items: [
      { label: '学习面板', href: '/dashboard', icon: LayoutDashboardIcon },
      { label: '词汇本', href: '/vocabulary', icon: BookOpenIcon },
    ],
  },
];

export function Sidebar() {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  const sidebar = (
    <aside
      className={`
        flex flex-col h-full flex-shrink-0 overflow-y-auto overflow-x-hidden
        bg-canvas border-r border-hairline custom-scrollbar
        transition-[width] duration-300 ease-in-out
        ${collapsed ? 'w-[72px]' : 'w-[240px]'}
      `}
    >
      <div className="flex h-16 items-center border-b border-hairline px-5">
        <Link href="/" className="flex items-center gap-3 overflow-hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-coral text-white text-sm font-semibold flex-shrink-0">
            S
          </span>
          {!collapsed && (
            <span className="text-lg font-display font-normal text-ink tracking-tight whitespace-nowrap">
              Speaking
            </span>
          )}
        </Link>
      </div>

      {navigation.map((section, si) => (
        <div key={si} className={si > 0 ? 'border-t border-hairline pt-2 mt-2' : 'pt-2'}>
          {!collapsed && section.title && (
            <div className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-caption-wide text-muted-foreground">
              {section.title}
            </div>
          )}
          <nav className="flex flex-col gap-0.5 px-2.5 py-1">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`
                  flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium
                  transition-colors duration-150
                  ${isActive(item.href)
                    ? 'bg-cream-card text-ink'
                    : 'text-muted-foreground hover:bg-cream-soft hover:text-ink'
                  }
                  ${collapsed ? 'justify-center px-2' : ''}
                `}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            ))}
          </nav>
        </div>
      ))}

      <div className="flex-1" />

      <div className="border-t border-hairline pt-2 pb-4">
        <nav className="flex flex-col gap-0.5 px-2.5 py-1">
          <Link
            href="/redeem"
            onClick={() => setMobileOpen(false)}
            className={`
              flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium
              transition-colors duration-150
              ${isActive('/redeem')
                ? 'bg-cream-card text-ink'
                : 'text-muted-foreground hover:bg-cream-soft hover:text-ink'
              }
              ${collapsed ? 'justify-center px-2' : ''}
            `}
          >
            <GiftIcon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span className="truncate">兑换</span>}
          </Link>
          <Link
            href="/admin"
            onClick={() => setMobileOpen(false)}
            className={`
              flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium
              transition-colors duration-150
              ${isActive('/admin')
                ? 'bg-cream-card text-ink'
                : 'text-muted-foreground hover:bg-cream-soft hover:text-ink'
              }
              ${collapsed ? 'justify-center px-2' : ''}
            `}
          >
            <SettingsIcon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span className="truncate">管理</span>}
          </Link>
        </nav>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden md:block h-full flex-shrink-0">{sidebar}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[240px] animate-slide-in">{sidebar}</div>
        </div>
      )}
    </>
  );
}
