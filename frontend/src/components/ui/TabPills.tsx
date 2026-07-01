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

export interface TabPillsProps<K extends string = string> {
  /** List of tabs to render. */
  tabs: TabItem<K>[];
  /** The key of the currently active tab. */
  activeKey: K;
  /** Called when a tab is clicked. */
  onChange: (key: K) => void;
  /** Additional className for the outer container. */
  className?: string;
  /** Visual variant. Default "default" = pill bg; "ghost" = no background, tighter. */
  variant?: "default" | "ghost";
  /** Tab shape override. Default "pill"; "rect" = sharper corners. */
  shape?: "pill" | "rect";
  /** Active-state style. "default" = canvas bg + shadow; "dark" = ink bg; "brand" = brand bg. */
  activeStyle?: ActiveStyle;
  /** Size preset. "md" = larger pill (tab-pill); "sm" = compact chip (fchip). */
  size?: TabSize;
}

const ACTIVE_CLASSES: Record<ActiveStyle, string> = {
  default: "bg-canvas text-ink shadow-soft",
  dark: "bg-ink text-on-primary",
  brand: "bg-brand-500 text-on-primary",
};

const SIZE_CLASSES: Record<TabSize, string> = {
  md: "px-4 py-2",
  sm: "px-3.5 py-1.5",
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
  return (
    <div
      className={cn(
        "inline-flex gap-1 p-1",
        variant === "default" && "bg-surface-card rounded-pill",
        variant === "ghost" && "bg-transparent p-0",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              "inline-flex items-center rounded-pill text-[13px] font-semibold text-muted hover:text-ink transition-colors duration-150 cursor-pointer",
              SIZE_CLASSES[size],
              shape === "rect" && "rounded-sm",
              isActive && ACTIVE_CLASSES[activeStyle],
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
