"use client";

import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { LucideIcon } from "lucide-react";

interface ErrorStateProps {
  /** Error title — default "出错了" */
  title?: string;
  /** Error detail message */
  message?: string;
  /** Icon — default AlertCircle */
  icon?: LucideIcon;
  /** Retry callback. When provided, a "重试" button is shown. */
  onRetry?: () => void;
  /** Custom retry button label — default "重试" */
  retryLabel?: string;
  /** Custom action node (overrides onRetry button) */
  action?: React.ReactNode;
  /** Full-page mode: centers on min-h-dvh bg-canvas */
  fullPage?: boolean;
  /** Additional classes on the wrapper */
  className?: string;
}

/**
 * Error state display with optional retry action.
 * Use for inline errors (`fullPage={false}`) or full-page errors (`fullPage`).
 */
export function ErrorState({
  title = "出错了",
  message,
  icon: Icon = AlertCircle,
  onRetry,
  retryLabel = "重试",
  action,
  fullPage = false,
  className,
}: ErrorStateProps) {
  const content = (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        fullPage ? "" : "py-20",
        className
      )}
    >
      <span className="mb-4 inline-grid size-12 place-items-center rounded-full bg-red-soft text-error">
        <Icon size={24} />
      </span>
      <p className="text-copy font-semibold text-ink">{title}</p>
      {message && <p className="mt-1 max-w-[32rem] text-copy text-muted">{message}</p>}
      {action ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">{action}</div>
      ) : onRetry ? (
        <Button onClick={onRetry} className="mt-3">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );

  if (fullPage) {
    return <main className="flex min-h-dvh items-center justify-center bg-canvas">{content}</main>;
  }

  return content;
}
