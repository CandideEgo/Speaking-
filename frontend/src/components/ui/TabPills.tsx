"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A single tab item passed to `<TabPills>`. */
export interface TabItem<K extends string = string> {
  /** Unique key for React list rendering. */
  key: K;
  /** Display label. */
  label: ReactNode;
}

/** Active-state visual style for the selected tab. */
export type ActiveStyle = "default" | "dark" | "brand";

/** Size preset controlling padding. */
export type TabSize = "md" | "sm";

/** Visual variants: segmented tabs / bare ghost tabs / design `.chip` filter chips. */
export type TabVariant = "default" | "ghost" | "chips";

export interface TabPillsProps<K extends string = string> {
  /** List of tabs to render. */
  tabs: TabItem<K>[];
  /** The key of the currently active tab. */
  activeKey: K;
  /** Called when a tab is clicked. */
  onChange: (key: K) => void;
  /** Additional className for the outer container. */
  className?: string;
  /**
   * Visual variant. Default "default" = segmented pill control (设计 `.tabs`);
   * "ghost" = no background, tighter; "chips" = 设计 `.chip` 行（32px 高、
   * 描边、激活为墨色底），用于难度/分类这类筛选行。
   */
  variant?: TabVariant;
  /** Tab shape override. Default "pill"; "rect" = sharper corners. */
  shape?: "pill" | "rect";
  /** Active-state style. "default" = canvas bg + shadow; "dark" = ink bg; "brand" = brand bg. */
  activeStyle?: ActiveStyle;
  /** Size preset. "md" = larger pill (tab-pill); "sm" = compact chip (fchip). */
  size?: TabSize;
}

const ACTIVE_CLASSES: Record<ActiveStyle, string> = {
  default: "bg-canvas text-ink shadow-soft",
  dark: "bg-ink text-canvas",
  brand: "bg-brand-500 text-on-primary",
};

const SIZE_CLASSES: Record<TabSize, string> = {
  md: "h-8 px-3.5",
  sm: "h-8 px-3",
};

export function TabPills<K extends string = string>({
  tabs,
  activeKey,
  onChange,
  className,
  variant = "default",
  shape = "pill",
  activeStyle = "default",
  size = "md",
}: TabPillsProps<K>) {
  const isChips = variant === "chips";
  return (
    <div
      className={cn(
        "inline-flex gap-1",
        variant === "default" &&
          "flex-wrap items-center rounded-pill border border-hairline bg-surface-soft p-1",
        variant === "ghost" && "flex-nowrap bg-transparent p-0",
        isChips && "flex-wrap items-center gap-2 bg-transparent p-0",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              // shrink-0 + nowrap：放进 overflow-x-auto 的筛选行时不被压缩成多行/竖排。
              "inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap transition-colors duration-150",
              !isChips && "rounded-pill text-meta font-medium text-muted",
              !isChips && !isActive && "hover:text-ink",
              !isChips && SIZE_CLASSES[size],
              !isChips && shape === "rect" && "rounded-sm",
              isChips &&
                "h-8 rounded-pill border border-hairline-strong bg-canvas px-3 text-meta font-medium text-body hover:border-muted-soft hover:text-ink",
              isActive &&
                (isChips
                  ? "border-ink bg-ink text-canvas hover:text-canvas"
                  : ACTIVE_CLASSES[activeStyle])
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
