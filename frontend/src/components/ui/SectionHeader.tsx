"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SectionHeaderProps {
  /** Section title (rendered as h2). */
  title: ReactNode;
  /** Right-side action — typically a "see all" link or tab pills. */
  action?: ReactNode;
  /** Additional className for the outer wrapper. */
  className?: string;
}

export function SectionHeader({
  title,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between mt-10 mb-5", className)}>
      <h2 className="text-[26px] font-bold tracking-display-md">{title}</h2>
      {action}
    </div>
  );
}

/** Convenience: a "see all" link styled as sec-link. Use as `action` prop. */
export function SectionLink({
  children,
  className,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) {
  return (
    <a
      className={cn(
        "text-sm font-medium text-muted inline-flex items-center gap-1 hover:text-ink transition-colors duration-150 cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}
