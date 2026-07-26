"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface AdminBreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function AdminBreadcrumb({ items, className }: AdminBreadcrumbProps) {
  return (
    <nav className={cn("flex items-center gap-1.5 text-sm", className)} aria-label="Breadcrumb">
      <Link href="/admin" className="text-muted hover:text-ink transition-colors" title="管理后台">
        <Home size={14} />
      </Link>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            <ChevronRight size={14} className="text-muted-soft" />
            {isLast || !item.href ? (
              <span className={cn(isLast ? "font-medium text-ink" : "text-muted")}>
                {item.label}
              </span>
            ) : (
              <Link href={item.href} className="text-muted hover:text-ink transition-colors">
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
