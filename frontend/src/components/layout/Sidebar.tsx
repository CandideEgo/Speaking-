"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/layout/SidebarProvider";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { DURATIONS, EASES, MEDIA, motionDuration } from "@/lib/animations";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Sparkles,
  Users,
  Compass,
  Crown,
  Upload,
  User,
  LogOut,
} from "lucide-react";
import { ComplianceInfo } from "@/components/common/ComplianceInfo";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    title: "主菜单",
    items: [
      { label: "首页", href: "/", icon: Sparkles },
      { label: "浏览视频", href: "/browse", icon: Compass },
    ],
  },
  {
    title: "社区",
    items: [{ label: "社区精选", href: "/community", icon: Users }],
  },
  {
    title: "学习",
    items: [{ label: "词汇本", href: "/vocabulary", icon: BookOpen }],
  },
  {
    title: "创作",
    items: [{ label: "创作者中心", href: "/my-videos", icon: Upload }],
  },
  {
    title: "账户",
    items: [
      { label: "个人中心", href: "/profile", icon: User },
      { label: "Pro 会员", href: "/pricing", icon: Crown },
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
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium",
        "transition-colors duration-150",
        isActive
          ? "bg-ink text-on-primary"
          : "text-olive hover:bg-surface-card hover:text-ink",
        collapsed && "justify-center px-2",
      )}
    >
      <item.icon
        size={18}
        className={cn("flex-shrink-0", isActive && "text-on-primary")}
      />
      <span className="nav-label truncate">{item.label}</span>
      {item.badge && !collapsed && (
        <span className="nav-badge ml-auto text-[11px] font-semibold bg-brand-500 text-on-primary px-[7px] py-0.5 rounded-pill">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

/** Renders the sidebar content (logo + nav sections + plan card). */
function SidebarNavContent({
  collapsed,
  onNavClick,
  pathname,
}: {
  collapsed?: boolean;
  onNavClick?: () => void;
  pathname: string;
}) {
  const logout = useAuthStore((s) => s.logout);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside className="flex flex-col h-full flex-shrink-0 overflow-y-auto overflow-x-hidden bg-canvas border-r border-hairline custom-scrollbar">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-hairline px-5">
        <Link href="/" className="flex items-center gap-3 overflow-hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-on-primary text-base font-extrabold flex-shrink-0 shadow-brand">
            S
          </span>
          <span className="nav-label text-[17px] font-display font-bold text-ink tracking-tight whitespace-nowrap">
            Speaking
          </span>
        </Link>
      </div>

      {/* Navigation sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-3.5">
        {navigation.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-0" : ""}>
            <div className="section-title px-3 pt-3.5 pb-1.5 text-[11px] font-semibold uppercase tracking-caption-wide text-muted-soft">
              {section.title}
            </div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  isActive={isActive(item.href)}
                  collapsed={collapsed}
                  onClick={onNavClick}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom plan card */}
      <div className="p-3 border-t border-hairline">
        {!collapsed ? (
          <div className="bg-surface-soft border border-hairline rounded-lg p-3.5">
            <div className="text-[13px] font-semibold">
              升级 Pro · 前往小商店
            </div>
            <div className="text-xs text-muted mt-0.5">解锁无限词汇复习</div>
            <Link
              href="/pricing"
              className="block w-full mt-2.5 bg-ink text-on-primary text-[13px] font-semibold py-2 rounded-sm text-center hover:bg-black transition-colors duration-150"
            >
              升级 Pro →
            </Link>
          </div>
        ) : (
          <Link
            href="/pricing"
            className="flex items-center justify-center w-10 h-10 mx-auto rounded-sm bg-ink text-on-primary hover:bg-black transition-colors duration-150"
            aria-label="升级 Pro"
          >
            <Crown size={16} />
          </Link>
        )}
        {!collapsed && <ComplianceInfo className="mt-2.5 text-center" />}
        {/* Logout */}
        <button
          onClick={() => {
            logout();
            onNavClick?.();
          }}
          className={cn(
            "mt-2.5 flex items-center gap-3 rounded-sm text-sm font-medium text-olive hover:bg-surface-card hover:text-ink transition-colors duration-150",
            collapsed
              ? "justify-center w-10 h-10 mx-auto"
              : "w-full px-3 py-2.5",
          )}
          aria-label="退出登录"
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span>退出登录</span>}
        </button>
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

        // Section titles
        const titles = desktopRef.current?.querySelectorAll(".section-title");
        if (titles) {
          gsap.to(titles, {
            autoAlpha: collapsed ? 0 : 1,
            duration: motionDuration(0.15, reduceMotion),
            ease: EASES.smooth,
          });
        }
      });
      return () => mm.revert();
    },
    { scope: desktopRef, dependencies: [collapsed] },
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
            { autoAlpha: 1, duration, ease: EASES.smooth },
          );
          gsap.fromTo(
            mobilePanelRef.current,
            { xPercent: -100 },
            {
              xPercent: 0,
              duration: motionDuration(DURATIONS.medium, reduceMotion),
              ease: EASES.snappy,
            },
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
    { dependencies: [mobileOpen] },
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
          <SidebarNavContent
            pathname={pathname}
            onNavClick={() => setMobileOpen(false)}
          />
        </div>
      </div>
    </>
  );
}
