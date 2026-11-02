"use client";

import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "@/lib/utils";

/**
 * 底部抽屉原语（Base UI Drawer）。
 *
 * 焦点陷阱、滚动锁、背景 aria-hidden、Escape、外点关闭、整卡下拉关闭手势
 * 都由原语负责，调用方只写内容。视觉沿用站内浮层：贴视口底、顶部圆角 +
 * 细线 + `shadow-lift`，内容区自己滚动。
 *
 * 与 `ui/Dialog` 一样不开退场过渡：本仓 `prefers-reduced-motion` 会把过渡压到
 * 0.01ms，原语等不到 transitionend 才卸载（详见 `ui/Dialog.tsx`）。这里再用
 * `data-ending-style:hidden` 让关闭瞬间从画面与无障碍树里消失，进场同样没有
 * 动画，动效统一留到 Phase 2。
 *
 * 下拉期间原语只改 `--drawer-swipe-movement-y`，位移由弹层自己接进 transform，
 * 所以手指拖动时卡片跟着走、松手后由原语决定回弹还是关闭。
 */

export function Drawer(props: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

export function DrawerPortal(props: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

/**
 * 软键盘感知：抽屉里有输入框（例如观看页的笔记）时，聚焦后由原语把内容滚进
 * 可视区，并通过 `--drawer-keyboard-inset` 给出被键盘遮住的高度。
 */
export function DrawerVirtualKeyboardProvider(
  props: DrawerPrimitive.VirtualKeyboardProvider.Props
) {
  return <DrawerPrimitive.VirtualKeyboardProvider {...props} />;
}

export function DrawerBackdrop({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-backdrop"
      className={cn(
        "fixed inset-0 z-50 bg-black/45 transition-none",
        // 关闭瞬间消失，不等原语的退场检查。
        "data-ending-style:hidden",
        className
      )}
      {...props}
    />
  );
}

export function DrawerViewport({ className, ...props }: DrawerPrimitive.Viewport.Props) {
  return (
    <DrawerPrimitive.Viewport
      data-slot="drawer-viewport"
      // `touch-none` 让原语拿到完整的下拉手势；内容区由 DrawerContent 改回 `touch-auto`。
      className={cn("fixed inset-0 z-50 flex touch-none items-end justify-center", className)}
      {...props}
    />
  );
}

export function DrawerPopup({ className, ...props }: DrawerPrimitive.Popup.Props) {
  return (
    <DrawerPrimitive.Popup
      data-slot="drawer-popup"
      className={cn(
        "relative flex max-h-[80dvh] w-full touch-none flex-col overflow-hidden rounded-t-lg border-t border-hairline bg-canvas pb-4 text-ink shadow-lift outline-none",
        "[transform:translateY(var(--drawer-swipe-movement-y))]",
        "transition-none data-ending-style:hidden",
        className
      )}
      {...props}
    />
  );
}

export function DrawerContent({ className, ...props }: DrawerPrimitive.Content.Props) {
  return (
    <DrawerPrimitive.Content
      data-slot="drawer-content"
      className={cn("min-h-0 flex-1 touch-auto overflow-y-auto overscroll-contain", className)}
      {...props}
    />
  );
}

export function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-copy font-semibold text-ink", className)}
      {...props}
    />
  );
}

export function DrawerClose({ className, ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" className={className} {...props} />;
}
