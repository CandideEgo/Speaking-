"use client";

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminEmptyStateProps {
  text?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function AdminEmptyState({
  text = "暂无数据",
  description,
  icon,
  action,
  className,
}: AdminEmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-soft">
        {icon ?? <Inbox size={28} className="text-muted-soft" />}
      </div>
      <p className="mt-4 text-sm font-medium text-ink">{text}</p>
      {description && <p className="mt-1 text-xs text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
