"use client";

import type { ReactNode } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { cn } from "@/lib/utils";

/**
 * 单选筛选 chip 行（Base UI Toggle Group 的薄封装）。
 *
 * 与 `ui/Tabs` 的分工：这里表达「筛同一份内容的一个维度」——切换的是过滤条件，
 * 内容仍在同一处；分栏切换（每栏是不同视图/面板）用 `ui/Tabs`。
 *
 * 方向键 / Home / End 在组内移动并激活、`aria-pressed`、外点行为由原语负责。
 * 视觉沿用了原 `TabPills variant="chips"` 的 chip 外观（移动端 44px 触控基线，
 * 桌面 32px）。
 *
 * 单选语义的细节：Base UI 的 `multiple={false}` 允许「再点一次已选项→全部取消」，
 * 而筛选 chip 必须始终有一个生效值。所以这里忽略空数组的变化，保持当前值。
 */

export interface ToggleGroupProps<K extends string> {
  /** 当前选中的值。 */
  value: K;
  /** 选中项变化时调用；点已选中的项不会回调。 */
  onValueChange: (value: K) => void;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

export function ToggleGroup<K extends string>({
  value,
  onValueChange,
  children,
  className,
  "aria-label": ariaLabel,
}: ToggleGroupProps<K>) {
  return (
    <ToggleGroupPrimitive
      value={[value]}
      onValueChange={(next) => {
        const pressed = next[0];
        if (pressed !== undefined && pressed !== value) onValueChange(pressed as K);
      }}
      multiple={false}
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center gap-2 bg-transparent p-0", className)}
    >
      {children}
    </ToggleGroupPrimitive>
  );
}

export function ToggleGroupItem<K extends string>({
  value,
  children,
  className,
}: {
  value: K;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Toggle
      value={value}
      className={cn(
        "inline-flex h-11 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-pill border border-hairline-strong bg-canvas px-3 text-meta font-medium text-body transition-colors hover:border-muted-soft hover:text-ink min-[1025px]:h-8",
        "data-pressed:border-ink data-pressed:bg-ink data-pressed:text-canvas data-pressed:hover:text-canvas",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus-ring",
        className
      )}
    >
      {children}
    </Toggle>
  );
}
