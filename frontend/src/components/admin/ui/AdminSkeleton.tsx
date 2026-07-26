"use client";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Base Skeleton
// ---------------------------------------------------------------------------

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn("animate-pulse rounded-md bg-surface-soft", className)} style={style} />
  );
}

// ---------------------------------------------------------------------------
// Composite Skeletons
// ---------------------------------------------------------------------------

function TableRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton className={cn("h-4", c === 0 ? "w-32" : "w-full max-w-24")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Cards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-hairline bg-canvas p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

function Chart({ height = 240 }: { height?: number }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-5">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-4 w-full" style={{ height }} />
    </div>
  );
}

function Page() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <Cards />
      <div className="rounded-lg border border-hairline bg-canvas p-5">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export with compound pattern
// ---------------------------------------------------------------------------

export const AdminSkeleton = {
  Base: Skeleton,
  TableRows,
  Cards,
  Chart,
  Page,
};
