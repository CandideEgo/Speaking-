"use client";

import { cn } from "@/lib/utils";

export interface AdminTab {
  key: string;
  label: string;
  count?: number;
}

export interface AdminTabsProps {
  tabs: AdminTab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function AdminTabs({ tabs, active, onChange, className }: AdminTabsProps) {
  return (
    <div className={cn("flex items-center gap-1 border-b border-hairline", className)}>
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              "relative px-4 py-2.5 text-sm font-medium transition-colors",
              "hover:text-ink",
              isActive ? "text-brand-600" : "text-muted"
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs",
                    isActive ? "bg-brand-100 text-brand-700" : "bg-surface-soft text-muted"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </span>
            {isActive && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-500 rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
