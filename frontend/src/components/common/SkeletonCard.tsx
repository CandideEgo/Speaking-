"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  className?: string;
  variant?: "default" | "douyin";
}

/**
 * 通用骨架块：一个会 shimmer 的占位盒。尺寸/圆角由调用点的 className 决定
 * （例：`<Skeleton className="h-8 w-48" />`）。骨架屏统一走 `.skeleton-shimmer`
 * 与语义底色，页面不再各自手写 `animate-pulse bg-surface-soft`。
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("skeleton-shimmer rounded-sm bg-surface-soft", className)} />
  );
}

/** 多行文字骨架：末行短一截，读起来像段落而不是色块。 */
export function SkeletonText({
  lines = 3,
  className,
  lineClassName,
}: {
  lines?: number;
  className?: string;
  lineClassName?: string;
}) {
  return (
    <div aria-hidden className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-[70%]" : "w-full", lineClassName)}
        />
      ))}
    </div>
  );
}

export const SkeletonCard = memo(function SkeletonCard({
  className,
  variant = "default",
}: SkeletonCardProps) {
  const isDouyin = variant === "douyin";

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden",
        isDouyin ? "border-hairline bg-canvas" : "border-hairline bg-surface-soft",
        className
      )}
    >
      <div className={cn("relative", isDouyin ? "aspect-[9/16]" : "aspect-video")}>
        <div
          className={cn(
            "absolute inset-0 skeleton-shimmer",
            isDouyin ? "bg-surface-card" : "bg-surface-soft"
          )}
        />
      </div>
      <div className={cn("space-y-2.5", isDouyin ? "p-3" : "p-3.5")}>
        <div
          className={cn(
            "h-4 skeleton-shimmer rounded-sm w-[92%]",
            isDouyin ? "bg-surface-card" : "bg-surface-soft"
          )}
        />
        <div
          className={cn(
            "h-4 skeleton-shimmer rounded-sm w-[70%]",
            isDouyin ? "bg-surface-card" : "bg-surface-soft"
          )}
        />
        <div className="flex items-center gap-2 pt-1">
          <div
            className={cn(
              "h-5 skeleton-shimmer rounded-sm w-16",
              isDouyin ? "bg-surface-card" : "bg-surface-soft"
            )}
          />
          <div
            className={cn(
              "h-5 skeleton-shimmer rounded-sm w-12",
              isDouyin ? "bg-surface-card" : "bg-surface-soft"
            )}
          />
        </div>
      </div>
    </div>
  );
});

interface SkeletonCardGridProps {
  count?: number;
  className?: string;
  variant?: "default" | "douyin";
  columns?: string;
}

export function SkeletonCardGrid({
  count = 8,
  className,
  variant = "default",
  columns,
}: SkeletonCardGridProps) {
  const isDouyin = variant === "douyin";
  const gridCols =
    columns ||
    (isDouyin
      ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      : "grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))]");

  return (
    <div className={cn("grid gap-6", gridCols, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} variant={variant} />
      ))}
    </div>
  );
}
