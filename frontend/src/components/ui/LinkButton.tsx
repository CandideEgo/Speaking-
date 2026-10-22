"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ICON_SIZE, SIZE, VARIANT, type ButtonSize, type ButtonVariant } from "./Button";

/**
 * LinkButton — same visual API as `<Button>` but renders as a Next.js `<Link>`.
 * Use for navigation actions; use `<Button>` for form/onClick actions.
 *
 * `loading` 与 Button 同义：prefetch 尚未完成、点击前的过渡态都可复用它，
 * 渲染 spinner 并加 `aria-busy`（链接没有 disabled，用 `aria-disabled` 提示）。
 */
export function LinkButton({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  icon: Icon,
  iconRight = false,
  className,
  children,
  href,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** 过渡态：用 spinner 取代前置图标，并标记 aria-busy。 */
  loading?: boolean;
  /** Leading icon (or trailing if `iconRight`). */
  icon?: LucideIcon;
  iconRight?: boolean;
  className?: string;
  children?: ReactNode;
  href: string;
} & Omit<React.ComponentProps<typeof Link>, "className" | "children">) {
  const iconSize = ICON_SIZE[size];
  return (
    <Link
      href={href}
      data-variant={variant}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-sm font-semibold transition-all duration-150",
        variant === "ghost" || variant === "ghostDark" || variant === "text"
          ? "font-medium"
          : "font-semibold",
        VARIANT[variant],
        SIZE[size],
        fullWidth && "w-full justify-center",
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin" aria-hidden />
      ) : (
        Icon && !iconRight && <Icon size={iconSize} />
      )}
      {children}
      {!loading && Icon && iconRight && <Icon size={iconSize} />}
    </Link>
  );
}
