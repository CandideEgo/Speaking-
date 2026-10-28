"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Search } from "lucide-react";

import { useAuthStore } from "@/stores/authStore";
import { useProfileStore } from "@/stores/profileStore";
import { useVocabularyStore } from "@/stores/vocabularyStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { NotificationDropdown } from "@/components/notifications/NotificationDropdown";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { GlobalSearchDialog } from "@/components/search/GlobalSearchDialog";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { MAIN_NAV } from "@/lib/navigation";

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();
  const me = useProfileStore((s) => s.me);
  const fetchMe = useProfileStore((s) => s.fetchMe);
  const due = useVocabularyStore((s) => s.stats.due_review_count);
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const [searchOpen, setSearchOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (user) void fetchMe();
  }, [user, fetchMe]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (
          tag !== "INPUT" &&
          tag !== "TEXTAREA" &&
          !(e.target as HTMLElement)?.isContentEditable
        ) {
          e.preventDefault();
          setSearchOpen(true);
        }
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

  // Close the notification popover whenever the route changes.
  useEffect(() => {
    setShowNotifications(false);
  }, [pathname]);

  return (
    <header className="user-topbar sticky top-0 z-30 h-14 flex-shrink-0 border-b border-hairline bg-topbar-bg">
      <div className="container-page flex h-full items-center gap-3">
        <Link
          href="/"
          className="flex min-h-11 shrink-0 items-center gap-2 min-[1025px]:hidden"
          aria-label="SeeWord 首页"
        >
          <span className="user-brand-mark" aria-hidden="true">
            S
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">SeeWord</span>
        </Link>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-haspopup="dialog"
          aria-label="搜索视频、原句、单词或频道"
          className="hidden h-9 w-full max-w-[42.5rem] items-center gap-2 rounded-pill bg-surface-soft px-4 text-copy text-muted transition-colors hover:bg-surface-card min-[1025px]:flex"
        >
          <Search size={17} className="shrink-0" aria-hidden />
          <span className="flex-1 text-left">搜索视频、原句或单词</span>
          <kbd className="rounded-sm border border-hairline-strong px-1.5 py-0.5 text-caption font-sans">
            ⌘K
          </kbd>
        </button>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="搜索"
          className="grid min-h-11 min-w-11 place-items-center rounded-pill text-muted hover:bg-surface-soft hover:text-ink min-[1025px]:hidden"
        >
          <Search size={19} />
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          {due > 0 && (
            <Link
              href="/vocabulary"
              aria-label={`${due} 个单词待复习`}
              className="flex h-11 items-center gap-1.5 rounded-pill bg-surface-soft px-3 text-meta text-body transition-colors hover:bg-surface-card min-[1025px]:h-8"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
              <strong className="font-semibold text-ink">{due > 99 ? "99+" : due}</strong>
              <span className="hidden sm:inline">词待复习</span>
            </Link>
          )}

          <div className="relative">
            <Button
              onClick={() => setShowNotifications((prev) => !prev)}
              variant="ghost"
              size="icon"
              aria-label={unreadCount > 0 ? `通知，${unreadCount} 条未读` : "通知"}
              aria-haspopup="dialog"
              aria-expanded={showNotifications}
              className="h-11 w-11"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 h-[7px] w-[7px] rounded-full border-2 border-canvas bg-brand-500" />
              )}
            </Button>
            {showNotifications && (
              <NotificationDropdown
                onClose={() => setShowNotifications(false)}
                onUnreadCountChange={(count) => useNotificationStore.getState().setUnread(count)}
              />
            )}
          </div>

          <Link
            href="/profile"
            aria-label="我的账户"
            className="hidden rounded-full min-[1025px]:block"
          >
            <Avatar src={me?.url} name={user} seed={user?.sub} gender={me?.gender} size="sm" />
          </Link>
          <div className="min-[1025px]:hidden">
            <AccountMenu placement="topbar" />
          </div>
        </div>
      </div>

      <GlobalSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
