"use client";

import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CardVariant = "outline" | "soft" | "dark";
export type CardPadding = 3 | 4 | 5 | 6;

const VARIANT: Record<CardVariant, string> = {
  outline:
    "bg-canvas border border-hairline hover:shadow-lift hover:border-transparent hover:-translate-y-0.5",
  soft: "bg-surface-soft border border-hairline",
  dark: "bg-surface-dark text-on-dark",
};

const PADDING: Record<CardPadding, string> = {
  3: "p-3",
  4: "p-4",
  5: "p-5",
  6: "p-6",
};

/**
 * Card primitive — replaces the `.card-outline`/`.card-soft`/`.card-dark` CSS
 * `@apply` classes plus the `!p-*` padding overrides that fought them. The
 * `padding` prop (default 6) absorbs the p-3/p-4/p-5/p-6 overrides seen across
 * dashboard widgets and editors. Polymorphic via `as` for semantic tags
 * (section/article/div/form).
 */
export function Card({
  variant = "outline",
  padding = 6,
  as: Tag = "div",
  className,
  children,
  ...props
}: {
  variant?: CardVariant;
  padding?: CardPadding;
  as?: ElementType;
  className?: string;
  children: ReactNode;
} & Omit<
  React.ComponentPropsWithoutRef<ElementType>,
  "className" | "children"
>) {
  return (
    <Tag
      className={cn(
        "rounded-lg transition-all duration-150",
        VARIANT[variant],
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
