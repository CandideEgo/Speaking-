"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSidebar } from "@/components/layout/SidebarProvider";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { DURATIONS, EASES, MEDIA, motionDuration } from "@/lib/animations";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Sparkles,
  Compass,
  Crown,
  User,
  LogOut,
  History,
  Search,
  Sun,
  Moon,
  Settings,
  MessageSquare,
} from "lucide-react";
import { ComplianceInfo } from "@/components/common/ComplianceInfo";
import { useAuthStore } from "@/stores/authStore";
import { useVocabularyStore } from "@/stores/vocabularyStore";
import { useThemeContext } from "@/components/common/ThemeProvider";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  shortcut?: string;
}

const navigation: NavItem[] = [
  { label: "首页", href: "/", icon: Sparkles, shortcut: "1" },
  { label: "发现", href: "/browse", icon: Compass, shortcut: "2" },
  { label: "词汇本", href: "/vocabulary", icon: BookOpen, shortcut: "3" },
  { label: "学习记录", href: "/history", icon: History, shortcut: "4" },
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
      aria-current={isActive ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
        "transition-all duration-150",
        isActive
          ? "bg-ink text-canvas shadow-sm"
          : "text-muted hover:bg-surface-card hover:text-ink",
        collapsed && "justify-center px-2"
      )}
    >
      <item.icon size={18} className={cn("flex-shrink-0", isActive && "text-canvas")} />
      <span className="nav-label truncate">{item.label}</span>
      {item.badge != null && item.badge > 0 && !collapsed && (
        <span className="nav-badge ml-auto text-[11px] font-semibold bg-brand-500 text-on-primary px-[7px] py-0.5 rounded-pill">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
      {item.badge != null && item.badge > 0 && collapsed && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-500" />
      )}
    </Link>
  );
}

/** User popover menu at sidebar bottom. */
function UserPopover({ onClose }: { onClose: () => void }) {
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
    { label: "联系我们", icon: MessageSquare, href: "/contact" },
    { label: "Pro 会员", icon: Crown, href: "/pricing" },
  ];

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 mb-2 mx-3 rounded-lg border border-hairline bg-canvas shadow-lift py-1.5 animate-fade-in z-50"
    >
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          onClick={onClose}
          className="flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-surface-card hover:text-ink transition-colors"
        >
          <item.icon size={16} className="text-muted" />
          {item.label}
        </Link>
      ))}
      <div className="border-t border-hairline mt-1 pt-1">
        <button
          onClick={() => {
            onClose();
            logout();
          }}
          className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted hover:bg-surface-card hover:text-error transition-colors w-full"
        >
          <LogOut size={16} />
          退出登录
        </button>
      </div>
    </div>
  );
}

/** Renders the sidebar content (logo + flat nav + bottom user area). */
function SidebarNavContent({
  collapsed,
  onNavClick,
  pathname,
}: {
  collapsed?: boolean;
  onNavClick?: () => void;
  pathname: string;
}) {
  const { theme, toggleTheme, mounted } = useThemeContext();
  const { user } = useAuthStore();
  const fetchStats = useVocabularyStore((s) => s.fetchStats);
  const dueCount = useVocabularyStore((s) => s.stats.due_count);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const router = useRouter();

  // Fetch vocab stats for badge
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Keyboard shortcuts: Ctrl/Cmd + 1~4
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const item = navigation.find((n) => n.shortcut === e.key);
      if (item) {
        e.preventDefault();
        router.push(item.href);
        onNavClick?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, onNavClick]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  // Inject due badge into vocabulary item
  const navItems = navigation.map((item) =>
    item.href === "/vocabulary" ? { ...item, badge: dueCount } : item
  );

  return (
    <aside className="flex flex-col h-full flex-shrink-0 overflow-y-auto overflow-x-hidden bg-canvas border-r border-hairline custom-scrollbar">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-hairline px-5">
        <Link href="/" className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 shadow-brand">
            <span className="text-sm font-bold text-white">S</span>
          </div>
          <span className="nav-label text-[16px] font-display font-bold text-ink tracking-tight whitespace-nowrap">
            SeeWord
          </span>
        </Link>
      </div>

      {/* Flat navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={isActive(item.href)}
              collapsed={collapsed}
              onClick={onNavClick}
            />
          ))}
          {/* Search trigger */}
          <button
            onClick={() => {
              // Focus the TopBar search input via keyboard shortcut simulation
              const input = document.querySelector<HTMLInputElement>("header input[type=text]");
              input?.focus();
              onNavClick?.();
            }}
            title={collapsed ? "搜索" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium w-full",
              "text-muted hover:bg-surface-card hover:text-ink transition-all duration-150",
              collapsed && "justify-center px-2"
            )}
          >
            <Search size={18} className="flex-shrink-0" />
            <span className="nav-label truncate">搜索</span>
            {!collapsed && (
              <kbd className="nav-badge ml-auto text-[10px] text-muted-soft bg-surface-card border border-hairline px-1.5 py-0.5 rounded font-mono">
                ⌘K
              </kbd>
            )}
          </button>
        </div>
      </nav>

      {/* Bottom area */}
      <div className="p-3 border-t border-hairline relative">
        {/* User popover */}
        {popoverOpen && <UserPopover onClose={() => setPopoverOpen(false)} />}

        {/* Theme toggle */}
        {mounted && (
          <button
            onClick={toggleTheme}
            title={collapsed ? (theme === "dark" ? "切换到浅色模式" : "切换到深色模式") : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg text-sm font-medium text-muted hover:bg-surface-card hover:text-ink transition-all duration-150 w-full",
              collapsed ? "justify-center w-10 h-10 mx-auto" : "px-3 py-2"
            )}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            {!collapsed && <span>{theme === "dark" ? "浅色模式" : "深色模式"}</span>}
          </button>
        )}

        {/* User avatar row */}
        <button
          onClick={() => setPopoverOpen((v) => !v)}
          className={cn(
            "flex items-center gap-3 rounded-lg text-sm font-medium text-muted hover:bg-surface-card hover:text-ink transition-all duration-150 w-full mt-1",
            collapsed ? "justify-center w-10 h-10 mx-auto" : "px-3 py-2.5"
          )}
        >
          <Avatar name={user} seed={user?.sub} size="sm" />
          {!collapsed && (
            <span className="truncate text-ink font-medium">{user?.name || "学习者"}</span>
          )}
        </button>

        {/* Compliance — expanded only, extra subtle */}
        {!collapsed && <ComplianceInfo className="mt-3 text-center opacity-60" />}
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
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MEDIA.desktop, (context) => {
        const reduceMotion = context.conditions?.reduceMotion as boolean;
        const duration = motionDuration(DURATIONS.medium, reduceMotion);

        // Animate width
        gsap.to(desktopRef.current, {
          width: collapsed ? 72 : 248,
          duration,
          ease: EASES.snappyInOut,
        });

        // Stagger nav labels
        const labels = desktopRef.current?.querySelectorAll(".nav-label");
        if (labels) {
          gsap.to(labels, {
            autoAlpha: collapsed ? 0 : 1,
            duration: motionDuration(0.15, reduceMotion),
            stagger: 0.02,
            ease: EASES.smooth,
          });
        }
      });
      return () => mm.revert();
    },
    { scope: desktopRef, dependencies: [collapsed] }
  );

  // Mobile sidebar overlay animation
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MEDIA.mobile, (context) => {
        const reduceMotion = context.conditions?.reduceMotion as boolean;
        const duration = motionDuration(DURATIONS.normal, reduceMotion);

        if (mobileOpen) {
          gsap.set(mobileOverlayRef.current, { display: "flex" });
          gsap.fromTo(
            mobileOverlayRef.current,
            { autoAlpha: 0 },
            { autoAlpha: 1, duration, ease: EASES.smooth }
          );
          gsap.fromTo(
            mobilePanelRef.current,
            { xPercent: -100 },
            {
              xPercent: 0,
              duration: motionDuration(DURATIONS.medium, reduceMotion),
              ease: EASES.snappy,
            }
          );
        } else {
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
              gsap.set(mobileOverlayRef.current, { display: "none" });
            },
          });
        }
      });
      return () => mm.revert();
    },
    { dependencies: [mobileOpen] }
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:block h-full flex-shrink-0">
        <aside
          ref={desktopRef}
          style={{ width: collapsed ? 72 : 248 }}
          className="flex flex-col h-full flex-shrink-0 overflow-y-auto overflow-x-hidden bg-canvas border-r border-hairline custom-scrollbar"
        >
          <SidebarNavContent collapsed={collapsed} pathname={pathname} />
        </aside>
      </div>

      {/* Mobile overlay */}
      <div
        ref={mobileOverlayRef}
        className="fixed inset-0 z-50 md:hidden"
        style={{ display: "none", opacity: 0, visibility: "hidden" as const }}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/50"
          onClick={() => setMobileOpen(false)}
          aria-label="关闭侧边栏"
        />
        <div
          ref={mobilePanelRef}
          className="absolute left-0 top-0 bottom-0 w-[248px]"
          style={{ transform: "translateX(-100%)" }}
        >
          <SidebarNavContent pathname={pathname} onNavClick={() => setMobileOpen(false)} />
        </div>
      </div>
    </>
  );
}
