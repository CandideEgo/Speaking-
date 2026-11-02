"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";

/**
 * Base UI Menu 的薄封装（APG menu 语义）。
 *
 * 与 `Popover` 的分工：Popover 装任意内容（通知面板），Menu 装一组「点一下
 * 就执行」的条目——`role="menu"` / `role="menuitem"`、方向键 / Home / End /
 * typeahead / Escape 逐层关闭 / 关闭后焦点归还触发器，都由原语负责。
 *
 * 两个与 `Dialog` 同源的坑（详见 `ui/Dialog.tsx` 与方案文档 §11）：
 *
 * 1. `Portal` + `Positioner` 是必需的。缺了弹层不渲染；静态预渲染时只抛
 *    生产错误码，看不出原因。
 * 2. 进出场用 **keyframes 动画**（`.overlay-pop`，见 `globals.css`），不要用
 *    `transition`：原语会等动画结束才卸载，而本仓的 reduced-motion 覆盖会让
 *    transition 等不到 `transitionend`，菜单会卡在屏上（方案文档 §14 的实测）。
 *
 * 定位同样交给原语：贴边时自动翻转 / 位移，`--available-height` 给超高菜单
 * 封顶并内部滚动，因此 `overflow-hidden` 的表格容器裁不到它。
 *
 * 挂在 `useOverlayContainer()` 的容器上，管理端回落到 `body`。
 */

export function DropdownMenu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

export function DropdownMenuTrigger({ className, ...props }: MenuPrimitive.Trigger.Props) {
  return (
    <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" className={className} {...props} />
  );
}

export function DropdownMenuPortal(props: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

export function DropdownMenuPositioner({ className, ...props }: MenuPrimitive.Positioner.Props) {
  return (
    <MenuPrimitive.Positioner
      data-slot="dropdown-menu-positioner"
      className={cn("z-50", className)}
      {...props}
    />
  );
}

export function DropdownMenuPopup({ className, ...props }: MenuPrimitive.Popup.Props) {
  return (
    <MenuPrimitive.Popup
      data-slot="dropdown-menu-popup"
      className={cn(
        "overlay-pop max-h-[var(--available-height)] min-w-40 origin-[var(--transform-origin)] overflow-y-auto rounded-lg border border-hairline bg-canvas py-1 text-copy text-ink shadow-card outline-none",
        className
      )}
      {...props}
    />
  );
}

export function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 select-none outline-none data-highlighted:bg-surface-soft",
        className
      )}
      {...props}
    />
  );
}
