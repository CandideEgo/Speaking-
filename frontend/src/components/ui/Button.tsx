"use client";

import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "tonal"
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
    "bg-action-primary text-on-primary shadow-brand hover:bg-action-primary-hover hover:-translate-y-0.5 disabled:bg-surface-card disabled:text-muted",
  // 品牌色「浅底」按钮：看得见是按钮，但不和页面里唯一的实心主操作抢注意力
  //（首页 hero 的「从这一段开始」用它，实心橙只留给真正的主操作）。
  tonal:
    "bg-brand-500/10 text-brand-700 hover:bg-brand-500/20 disabled:bg-surface-card disabled:text-muted",
  dark: "bg-ink text-canvas hover:bg-ink/90 hover:-translate-y-0.5 disabled:opacity-50",
  outline:
    "bg-canvas text-ink border border-hairline hover:border-ink hover:bg-surface-soft disabled:opacity-50",
  ghost: "text-body hover:bg-surface-card",
  ghostDark:
    "text-on-dark border border-surface-dark-soft hover:border-on-dark/25 hover:bg-surface-dark-soft",
  text: "text-body hover:text-ink",
  destructive:
    "bg-canvas text-error border border-error/40 hover:border-error hover:bg-red-soft disabled:opacity-50",
  secondary:
    "bg-canvas text-ink border border-hairline hover:border-ink hover:bg-surface-soft disabled:opacity-50",
  secondaryDark:
    "bg-surface-dark-elevated text-on-dark hover:bg-surface-dark-soft disabled:opacity-50",
};

export const SIZE: Record<ButtonSize, string> = {
  // Base layout shared by all variants; size only swaps padding + text.
  xs: "gap-1 px-1.5 py-0.5 text-caption",
  sm: "gap-1.5 px-3 py-1.5 text-meta",
  compact: "gap-1 px-2 py-1 text-caption",
  md: "gap-2 px-4 py-2.5 text-copy",
  nav: "gap-2 px-4 py-2 text-copy",
  lg: "gap-2 px-6 py-3 text-copy",
  icon: "w-10 h-10",
};

/** 图标尺寸与按钮尺寸的对应表；Button 与 LinkButton 共用，避免各写一份。 */
export const ICON_SIZE: Record<ButtonSize, number> = {
  xs: 10,
  sm: 12,
  compact: 12,
  md: 14,
  nav: 14,
  lg: 16,
  icon: 16,
};

/**
 * Button primitive — replaces the `.btn-*` CSS `@apply` classes plus the
 * `!py-*`/`!px-*`/`!text-*` overrides that fought them. Variants mirror the
 * original classes (primary/tonal/dark/outline/ghost/text/destructive/secondary/
 * secondaryDark); sizes absorb the in-the-wild override combos (xs/sm/compact/
 * md/nav/lg — `compact` covers the common `!py-1 !px-2 text-caption` admin-row
 * pattern). `fullWidth` and a normalized disabled cursor round it out.
 *
 * `loading` 统一了异步按钮的写法：自动禁用 + `aria-busy` + 前置 spinner，
 * 页面不再自己拼 `{saving ? <Loader2/> : null}` 与各自的禁用文案。
 */
export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  icon: Icon,
  iconRight = false,
  className,
  children,
  disabled,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** 异步进行中：自动禁用、标记 aria-busy、用 spinner 取代前置图标。 */
  loading?: boolean;
  /** Leading icon (or trailing if `iconRight`). */
  icon?: LucideIcon;
  iconRight?: boolean;
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  const iconSize = ICON_SIZE[size];
  return (
    <button
      data-variant={variant}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-sm font-semibold transition-all duration-150 active:scale-[0.98]",
        variant === "ghost" || variant === "ghostDark" || variant === "text"
          ? "font-medium"
          : "font-semibold",
        VARIANT[variant],
        SIZE[size],
        fullWidth && "w-full justify-center",
        "disabled:cursor-not-allowed",
        className
      )}
      type="button"
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin" aria-hidden />
      ) : (
        Icon && !iconRight && <Icon size={iconSize} />
      )}
      {children}
      {!loading && Icon && iconRight && <Icon size={iconSize} />}
    </button>
  );
}
