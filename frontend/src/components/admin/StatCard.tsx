"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  label,
  value,
  delta,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  delta?: string;
  tone?: "default" | "coral" | "green" | "amber";
}) {
  const toneClass = {
    default: "bg-surface-soft text-muted-foreground",
    coral: "bg-brand-50 text-brand-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
  }[tone];

  return (
    <div className="card-outline">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 font-display text-3xl font-normal text-ink">
            {value}
          </p>
          {delta && <p className="mt-1 text-xs text-green-600">{delta}</p>}
        </div>
        <span
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-sm",
            toneClass,
          )}
        >
          <Icon size={18} />
        </span>
      </div>
    </div>
  );
}
