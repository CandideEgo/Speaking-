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
  /** Center-align all content. Default false (left-aligned). */
  centered?: boolean;
  /** Additional className for the outer wrapper. */
  className?: string;
}

export function PageHeader({
  crumb,
  title,
  description,
  centered = false,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("pt-2 pb-5", centered && "text-center", className)}>
      {crumb && (
        <div className="text-meta font-semibold text-muted uppercase tracking-caption-wide mb-2.5">
          {crumb}
        </div>
      )}
      <h1 className="text-display-sm sm:text-display font-extrabold tracking-display-lg">
        {title}
      </h1>
      {description && <p className="text-copy text-muted mt-2 max-w-measure">{description}</p>}
    </div>
  );
}
