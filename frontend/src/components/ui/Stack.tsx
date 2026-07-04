import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StackDirection = "row" | "col";
export type StackGap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8;
export type StackAlign = "start" | "center" | "end" | "stretch" | "baseline";
export type StackJustify =
  | "start"
  | "center"
  | "end"
  | "between"
  | "around"
  | "evenly";

// Static class maps so Tailwind's JIT can detect them (no `gap-${gap}`).
const GAP: Record<StackGap, string> = {
  0: "gap-0",
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  5: "gap-5",
  6: "gap-6",
  8: "gap-8",
};

const ALIGN: Record<StackAlign, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
};

const JUSTIFY: Record<StackJustify, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly",
};

/**
 * Stack — flexbox layout primitive. `direction` defaults to `col` (the common
 * vertical stack); pass `row` for horizontal. Mobile-first: callers add
 * responsive overrides via `className` (e.g. `flex-row lg:flex-col`), which
 * `twMerge` reconciles with the base. Use this instead of hand-rolled
 * `flex flex-col gap-3` repetition so spacing stays consistent.
 */
export function Stack({
  direction = "col",
  gap = 4,
  align,
  justify,
  as: Tag = "div",
  className,
  children,
  ...props
}: {
  direction?: StackDirection;
  gap?: StackGap;
  align?: StackAlign;
  justify?: StackJustify;
  as?: ElementType;
  className?: string;
  children?: ReactNode;
} & Omit<
  React.ComponentPropsWithoutRef<ElementType>,
  "className" | "children"
>) {
  return (
    <Tag
      className={cn(
        "flex",
        direction === "row" ? "flex-row" : "flex-col",
        GAP[gap],
        align && ALIGN[align],
        justify && JUSTIFY[justify],
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
