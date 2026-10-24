"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** Small uppercase breadcrumb label above the title. */
  crumb?: ReactNode;
  /** Main page title (h1). */
  title: ReactNode;
  /** Subtitle / description below the title. */
  description?: ReactNode;
  /**
   * `eyebrow` is the design system's list-page kicker (small caps), while
   * `display` is the large detail-page title. Defaults to `display` so pages
   * that have not been migrated keep their previous hierarchy.
   */
  variant?: "eyebrow" | "display";
  /** Center-align all content. Default false (left-aligned). */
  centered?: boolean;
  /** Additional className for the outer wrapper. */
  className?: string;
  actions?: ReactNode;
}

/**
 * 用户端内容页的统一页头。
 *
 * 版式规则（下边线、间距、字号、crumb 前的小横线）全部在 `user-ui.css` 的
 * `.user-page-header/.user-page-crumb/.user-page-title/.user-page-desc`，
 * 与 stage-3 的 `shared/page.css` 一档对齐；页面只传内容，不再各自写
 * padding/字号。首页不使用页头（原型 `home.html` 没有标题区，直接进本周精听）。
 */
export function PageHeader({
  crumb,
  title,
  description,
  variant = "display",
  centered = false,
  className,
  actions,
}: PageHeaderProps) {
  return (
    <header className={cn("user-page-header", centered && "text-center", className)}>
      <div className="min-w-0">
        {crumb && <div className="user-page-crumb">{crumb}</div>}
        <h1 className={cn("user-page-title", variant === "eyebrow" && "is-eyebrow")}>{title}</h1>
        {description && <p className="user-page-desc">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
