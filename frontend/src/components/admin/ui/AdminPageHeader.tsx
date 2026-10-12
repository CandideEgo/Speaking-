"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AdminPageHeaderProps {
  /** 页面标题（h1）。允许 ReactNode：频道管理等页面在标题里带图标。 */
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function AdminPageHeader({ title, description, actions, className }: AdminPageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div>
        <h1 className="text-display-sm font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-copy text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
