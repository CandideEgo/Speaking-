"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

/**
 * Base UI Popover 的薄封装。外部点击、Escape、焦点返回、视口内碰撞翻转
 * 都由原语负责；这里只投影视觉与站点 token。
 *
 * 非模态（默认 `modal={false}`）：不锁滚动、不拦背景交互——适合通知面板、
 * 词卡这类「看一眼就走」的浮层。需要锁背景时再显式传 `modal`。
 *
 * Portal 的挂在 `PopoverPortal` 的 `container` 上，调用方用
 * `useOverlayContainer()` 拿到 `.user-ui` 作用域内的容器。
 */

export function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverPortal(props: PopoverPrimitive.Portal.Props) {
  return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />;
}

export function PopoverPositioner({ className, ...props }: PopoverPrimitive.Positioner.Props) {
  return (
    <PopoverPrimitive.Positioner
      data-slot="popover-positioner"
      className={cn("z-50", className)}
      {...props}
    />
  );
}

export function PopoverPopup({ className, ...props }: PopoverPrimitive.Popup.Props) {
  return (
    <PopoverPrimitive.Popup
      data-slot="popover-popup"
      className={cn(
        "overlay-pop origin-[var(--transform-origin)] rounded-lg border border-hairline bg-canvas text-ink shadow-card outline-none",
        className
      )}
      {...props}
    />
  );
}

export function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("text-copy font-semibold text-ink", className)}
      {...props}
    />
  );
}

export function PopoverClose(props: PopoverPrimitive.Close.Props) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />;
}
