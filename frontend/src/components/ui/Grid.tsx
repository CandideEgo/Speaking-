import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type GridCols = 1 | 2 | 3 | 4 | 5 | 6 | 12;
export type GridGap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8;

// Static class maps so Tailwind's JIT can detect them (no `grid-cols-${n}`).
const COLS: Record<GridCols, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  12: "grid-cols-12",
};

const GAP: Record<GridGap, string> = {
  0: "gap-0",
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  5: "gap-5",
  6: "gap-6",
  8: "gap-8",
};

/**
 * Grid — CSS grid layout primitive. `cols` sets the mobile base; callers add
 * responsive column counts via `className` (e.g. `md:grid-cols-3 lg:grid-cols-4`),
 * which `twMerge` reconciles with the base. Mobile-first: default `cols=1`
 * stacks on phones and the caller widens at breakpoints.
 */
export function Grid({
  cols = 1,
  gap = 4,
  as: Tag = "div",
  className,
  children,
  ...props
}: {
  cols?: GridCols;
  gap?: GridGap;
  as?: ElementType;
  className?: string;
  children?: ReactNode;
} & Omit<
  React.ComponentPropsWithoutRef<ElementType>,
  "className" | "children"
>) {
  return (
    <Tag className={cn("grid", COLS[cols], GAP[gap], className)} {...props}>
      {children}
    </Tag>
  );
}
