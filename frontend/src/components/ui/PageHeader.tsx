"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** Small uppercase breadcrumb label above the title. */
  crumb?: ReactNode;
  /** Main page title (h1). */
  title: ReactNode;
  /** Factual data attached to this page, such as a video title or channel stats. */
  meta?: ReactNode;
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
 * Shared user page heading with one semantic title and optional factual metadata.
 * Typography and spacing are defined in `user-ui.css`.
 */
export function PageHeader({
  crumb,
  title,
  meta,
  variant = "display",
  centered = false,
  className,
  actions,
}: PageHeaderProps) {
  return (
    <header className={cn("user-page-header", centered && "text-center", className)}>
      <div className="min-w-0">
        {crumb && !(typeof crumb === "string" && crumb === title) && (
          <div className="user-page-crumb">{crumb}</div>
        )}
        <h1 className={cn("user-page-title", variant === "eyebrow" && "is-eyebrow")}>{title}</h1>
        {meta && <div className="user-page-meta mt-2 text-meta text-body">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
