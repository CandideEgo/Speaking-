"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "dark"
  | "outline"
  | "ghost"
  | "ghostDark"
  | "text"
  | "destructive"
  | "secondary"
  | "secondaryDark";

export type ButtonSize = "xs" | "sm" | "compact" | "md" | "nav" | "lg" | "icon";

export const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-500 text-on-primary shadow-brand hover:bg-brand-600 hover:-translate-y-0.5 disabled:bg-surface-card disabled:text-muted-foreground",
  dark: "bg-ink text-on-dark hover:bg-black hover:-translate-y-0.5 disabled:opacity-50",
  outline:
    "bg-canvas text-ink border border-hairline hover:border-ink hover:bg-surface-soft disabled:opacity-50",
  ghost: "text-body hover:bg-surface-card",
  ghostDark:
    "text-on-dark border border-[#2c2c2c] hover:border-[#4a4a4a] hover:bg-surface-dark-soft",
  text: "text-body hover:text-ink",
  destructive:
    "bg-canvas text-red-600 border border-red-300 hover:border-red-500 hover:bg-red-50 disabled:opacity-50",
  secondary:
    "bg-canvas text-ink border border-hairline hover:border-ink hover:bg-surface-soft disabled:opacity-50",
  secondaryDark:
    "bg-surface-dark-elevated text-on-dark hover:bg-surface-dark-soft disabled:opacity-50",
};

export const SIZE: Record<ButtonSize, string> = {
  // Base layout shared by all variants; size only swaps padding + text.
  xs: "gap-1 px-1.5 py-0.5 text-[10px]",
  sm: "gap-1.5 px-3 py-1.5 text-xs",
  compact: "gap-1 px-2 py-1 text-[11px]",
  md: "gap-2 px-4 py-2.5 text-sm",
  nav: "gap-2 px-4 py-2 text-[13px]",
  lg: "gap-2 px-6 py-3 text-sm",
  icon: "w-10 h-10",
};

/**
 * Button primitive — replaces the `.btn-*` CSS `@apply` classes plus the
 * `!py-*`/`!px-*`/`!text-*` overrides that fought them. Variants mirror the
 * original classes (primary/dark/outline/ghost/text/destructive/secondary/
 * secondaryDark); sizes absorb the in-the-wild override combos (xs/sm/compact/
 * md/nav/lg — `compact` covers the common `!py-1 !px-2 text-[11px]` admin-row
 * pattern). `fullWidth` and a normalized disabled cursor round it out.
 */
export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  icon: Icon,
  iconRight = false,
  className,
  children,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Leading icon (or trailing if `iconRight`). */
  icon?: LucideIcon;
  iconRight?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  const iconSize =
    size === "xs"
      ? 10
      : size === "sm" || size === "compact"
        ? 12
        : size === "lg" || size === "icon"
          ? 16
          : 14;
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-sm font-semibold transition-all duration-150",
        variant === "ghost" || variant === "ghostDark" || variant === "text"
          ? "font-medium"
          : "font-semibold",
        VARIANT[variant],
        SIZE[size],
        fullWidth && "w-full justify-center",
        "disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    >
      {Icon && !iconRight && <Icon size={iconSize} />}
      {children}
      {Icon && iconRight && <Icon size={iconSize} />}
    </button>
  );
}
