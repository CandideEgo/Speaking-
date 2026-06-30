"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIZE, VARIANT, type ButtonSize, type ButtonVariant } from "./Button";

/**
 * LinkButton — same visual API as `<Button>` but renders as a Next.js `<Link>`.
 * Use for navigation actions; use `<Button>` for form/onClick actions.
 */
export function LinkButton({
  variant = "primary",
  size = "md",
  fullWidth = false,
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
  /** Leading icon (or trailing if `iconRight`). */
  icon?: LucideIcon;
  iconRight?: boolean;
  className?: string;
  children?: ReactNode;
  href: string;
} & Omit<React.ComponentProps<typeof Link>, "className" | "children">) {
  const iconSize =
    size === "xs"
      ? 10
      : size === "sm" || size === "compact"
        ? 12
        : size === "lg" || size === "icon"
          ? 16
          : 14;
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-sm font-semibold transition-all duration-150",
        variant === "ghost" || variant === "ghostDark" || variant === "text"
          ? "font-medium"
          : "font-semibold",
        VARIANT[variant],
        SIZE[size],
        fullWidth && "w-full justify-center",
        className,
      )}
      {...props}
    >
      {Icon && !iconRight && <Icon size={iconSize} />}
      {children}
      {Icon && iconRight && <Icon size={iconSize} />}
    </Link>
  );
}
