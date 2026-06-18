'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/components/SidebarProvider';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { DURATIONS, EASES, MEDIA, motionDuration } from '@/lib/animations';
import {
  LayoutDashboardIcon,
  BookOpenIcon,
  GiftIcon,
  SettingsIcon,
  YoutubeIcon,
  BilibiliIcon,
  DouyinIcon,
  SparklesIcon,
  UsersIcon,
} from '@/components/Icons';
import { cn } from '@/lib/utils';

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
    title: '视频平台',
    items: [
      { label: 'YouTube', href: '/browse', icon: YoutubeIcon },
      { label: 'Bilibili', href: '/bilibili', icon: BilibiliIcon },
      { label: '抖音', href: '/douyin', icon: DouyinIcon },
    ],
  },
  {
    title: '社区推荐',
    items: [
      { label: '社区精选', href: '/community', icon: UsersIcon },
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

/** Renders a single nav link with active state and optional collapse. */
function NavLink({
  item,
  isActive,
  collapsed,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium',
        'transition-colors duration-150',
        isActive
          ? 'bg-cream-card text-ink'
          : 'text-olive hover:bg-cream-soft hover:text-ink',
        collapsed && 'justify-center px-2'
      )}
    >
      <item.icon className="h-5 w-5 flex-shrink-0" />
      <span className="nav-label truncate">{item.label}</span>
    </Link>
  );
}

/** Renders the sidebar content (logo + nav sections + bottom links). */
function SidebarNavContent({
  collapsed,
  onNavClick,
  pathname,
}: {
  collapsed?: boolean;
  onNavClick?: () => void;
  pathname: string;
}) {
  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <aside className="flex flex-col h-full flex-shrink-0 overflow-y-auto overflow-x-hidden bg-parchment border-r border-hairline-cream custom-scrollbar">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-hairline-cream px-5">
        <Link href="/" className="flex items-center gap-3 overflow-hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-terracotta text-ivory text-sm font-semibold flex-shrink-0">
            S
          </span>
          <span className="nav-label text-lg font-display font-medium text-ink tracking-tight whitespace-nowrap">
            Speaking
          </span>
        </Link>
      </div>

      {/* Navigation sections */}
      {navigation.map((section, si) => (
        <div key={si} className={si > 0 ? 'border-t border-hairline-cream pt-2 mt-2' : 'pt-2'}>
          <div className="section-title px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-caption-wide text-olive">
            {section.title}
          </div>
          <nav className="flex flex-col gap-0.5 px-2.5 py-1">
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={isActive(item.href)}
                collapsed={collapsed}
                onClick={onNavClick}
              />
            ))}
          </nav>
        </div>
      ))}

      <div className="flex-1" />

      {/* Bottom links */}
      <div className="border-t border-hairline-cream pt-2 pb-4">
        <nav className="flex flex-col gap-0.5 px-2.5 py-1">
          <NavLink
            item={{ label: '兑换', href: '/redeem', icon: GiftIcon }}
            isActive={isActive('/redeem')}
            collapsed={collapsed}
            onClick={onNavClick}
          />
          <NavLink
            item={{ label: '管理', href: '/admin', icon: SettingsIcon }}
            isActive={isActive('/admin')}
            collapsed={collapsed}
            onClick={onNavClick}
          />
        </nav>
      </div>
    </aside>
  );
}

export function Sidebar() {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();
  const pathname = usePathname();

  const desktopRef = useRef<HTMLElement>(null);
  const mobileOverlayRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);

  // Desktop sidebar collapse/expand animation
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(MEDIA.desktop, (context) => {
      const reduceMotion = context.conditions?.reduceMotion as boolean;
      const duration = motionDuration(DURATIONS.medium, reduceMotion);

      // Animate width
      gsap.to(desktopRef.current, {
        width: collapsed ? 72 : 240,
        duration,
        ease: EASES.snappyInOut,
      });

      // Stagger nav labels
      const labels = desktopRef.current?.querySelectorAll('.nav-label');
      if (labels) {
        gsap.to(labels, {
          autoAlpha: collapsed ? 0 : 1,
          duration: motionDuration(0.15, reduceMotion),
          stagger: 0.02,
          ease: EASES.smooth,
        });
      }

      // Section titles
      const titles = desktopRef.current?.querySelectorAll('.section-title');
      if (titles) {
        gsap.to(titles, {
          autoAlpha: collapsed ? 0 : 1,
          duration: motionDuration(0.15, reduceMotion),
          ease: EASES.smooth,
        });
      }
    });
    return () => mm.revert();
  }, { scope: desktopRef, dependencies: [collapsed] });

  // Mobile sidebar overlay animation
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(MEDIA.mobile, (context) => {
      const reduceMotion = context.conditions?.reduceMotion as boolean;
      const duration = motionDuration(DURATIONS.normal, reduceMotion);

      if (mobileOpen) {
        // Show overlay
        gsap.set(mobileOverlayRef.current, { display: 'flex' });
        gsap.fromTo(mobileOverlayRef.current,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration, ease: EASES.smooth },
        );
        gsap.fromTo(mobilePanelRef.current,
          { xPercent: -100 },
          { xPercent: 0, duration: motionDuration(DURATIONS.medium, reduceMotion), ease: EASES.snappy },
        );
      } else {
        // Hide overlay
        gsap.to(mobilePanelRef.current, {
          xPercent: -100,
          duration: motionDuration(DURATIONS.normal, reduceMotion),
          ease: EASES.snappyIn,
        });
        gsap.to(mobileOverlayRef.current, {
          autoAlpha: 0,
          duration: motionDuration(DURATIONS.normal, reduceMotion),
          ease: EASES.smooth,
          onComplete: () => {
            gsap.set(mobileOverlayRef.current, { display: 'none' });
          },
        });
      }
    });
    return () => mm.revert();
  }, { dependencies: [mobileOpen] });

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:block h-full flex-shrink-0">
        <aside
          ref={desktopRef}
          style={{ width: collapsed ? 72 : 240 }}
          className="flex flex-col h-full flex-shrink-0 overflow-y-auto overflow-x-hidden bg-parchment border-r border-hairline-cream custom-scrollbar"
        >
          <SidebarNavContent collapsed={collapsed} pathname={pathname} />
        </aside>
      </div>

      {/* Mobile overlay — always in DOM, GSAP controls visibility */}
      <div
        ref={mobileOverlayRef}
        className="fixed inset-0 z-50 md:hidden"
        style={{ display: 'none', opacity: 0, visibility: 'hidden' as const }}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/50"
          onClick={() => setMobileOpen(false)}
          aria-label="关闭侧边栏"
        />
        <div
          ref={mobilePanelRef}
          className="absolute left-0 top-0 bottom-0 w-[240px]"
          style={{ transform: 'translateX(-100%)' }}
        >
          <SidebarNavContent pathname={pathname} onNavClick={() => setMobileOpen(false)} />
        </div>
      </div>
    </>
  );
}
