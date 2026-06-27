"use client";

import { cn } from "@/lib/utils";

export interface FilterOption {
  key: string;
  label: string;
}

export function FilterPills({
  options,
  value,
  onChange,
  className,
}: {
  options: FilterOption[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {options.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={cn(
            "inline-flex items-center rounded-sm px-3 py-1.5 text-xs font-medium transition-colors border",
            value === f.key
              ? "bg-coral text-white border-coral"
              : "bg-canvas text-muted-foreground border-hairline hover:text-ink",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
