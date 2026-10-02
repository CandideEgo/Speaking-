"use client";

import { cloneElement } from "react";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { WatchChromeState } from "@/components/watch/WatchChromeProvider";

/**
 * WatchTopBar — 观看页形态的壳顶栏（DEC-069 / #31）。
 *
 * 真机读数（`docs/design/mobile/app-shots/13-device-414-first-screen.jpg`）：414×896 的
 * 首屏可视 776px 里，64px 的全局顶栏全是噪音（logo/搜索/主题/通知/头像），观看时一条都用不上。
 * 所以在 `/watch/*`（**仅 ≤1023px**）换成 44px 的观看页形态：
 *
 *     ┌ ←   E2E Demo Video (CI seed)…   SeeWord · B2·≈六级   [四级▾]   ⋯ ┐
 *
 * 桌面（≥1024px）**零改动**：直接渲染原来的 `TopBar`，页面里的桌面版式也没动。
 *
 * 顶栏**滚动时不隐藏**（§2 第 4 条，不做沉浸式状态机）：它是 `main#main-scroll` 之上
 * 的常规流行，滚的只有 main，顶栏天然常驻。
 */
export function WatchTopBar({ chrome = {} }: { chrome?: WatchChromeState }) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  if (isDesktop) return <TopBar />;

  const { title, levelText, levelSelector, onBack, onMore, moreOpen } = chrome;

  return (
    <header
      data-testid="watch-top-bar"
      className="z-30 flex h-11 flex-shrink-0 items-center gap-1 border-b border-hairline bg-topbar-bg/85 px-1 backdrop-blur-[10px]"
    >
      {/* 返回 44×44 —— `?from=` 的语义由页面给的回调带过来，顶栏不碰路由 */}
      <button
        type="button"
        data-testid="watch-top-back"
        onClick={onBack}
        aria-label="返回"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-card cursor-pointer"
      >
        <ArrowLeft size={18} />
      </button>

      {/* 中栏：标题一行 truncate + 级别文本（来源与桌面 meta 细行同源） */}
      <div className="min-w-0 flex-1">
        <div data-testid="watch-top-title" className="truncate text-[15px] font-semibold text-ink">
          {title ?? ""}
        </div>
        <div
          data-testid="watch-top-level"
          className="-mt-0.5 truncate text-[10px] font-medium leading-tight text-muted"
        >
          {levelText ?? ""}
        </div>
      </div>

      {/* 右端：级别选择器（从画面里的药丸搬上来）+ ⋯ 44×44 */}
      {levelSelector &&
        cloneElement(levelSelector as React.ReactElement<{ variant?: "pill" | "inline" }>, {
          variant: "inline",
        })}
      <button
        type="button"
        data-testid="watch-more-button"
        onClick={onMore}
        aria-label="更多"
        aria-expanded={moreOpen ? true : false}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-card cursor-pointer"
      >
        <MoreHorizontal size={20} />
      </button>
    </header>
  );
}

/** 顶栏高度（px）—— `h-11`。贴顶常驻的钉住位置与 e2e 的读数都按这个值核（别再写魔法数字 44）。 */
export const WATCH_TOP_BAR_HEIGHT = 44;
