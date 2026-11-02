"use client";

import type { ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

/**
 * Base UI 对话框原语。焦点陷阱、滚动锁、背景 aria-hidden、Escape、嵌套对话框
 * 都由 Base UI 负责；这里只投影视觉：语义 token + 三档圆角。
 *
 * 两个实测过的坑：
 * 1. `<Dialog.Portal>` 是必需的。漏掉它，预渲染会直接抛
 *    「Dialog.Portal is missing」（生产构建里显示为 error #26）。
 * 2. **不要用 `transition`（transition-property）做进出场。** Base UI 要等到动画
 *    结束才卸载，而本机（ego-browser）的动画时间线不推进，过渡会停在 `currentTime: 0`，
 *    弹层关闭后仍可见约 2.5 秒。Phase 2 的进场用 keyframes（`.overlay-pop` /
 *    `.overlay-fade`），退场保持瞬时（`[data-ending-style]` 下 `display: none` +
 *    `animation: none`），让 `getAnimations()` 当帧为空、原语立即卸载。
 *    新增弹层请沿用这组类，不要退回 `transition`。
 *
 * 挂载位置由调用方决定，见 `Modal` 里关于 `.user-ui` 的说明。
 */

export function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

export function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

export function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

export function DialogBackdrop({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-backdrop"
      className={cn("overlay-fade fixed inset-0 z-50 bg-black/40", className)}
      {...props}
    />
  );
}

export function DialogPopup({ className, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Popup
      data-slot="dialog-popup"
      // 这里只给「在视口里、在最上层、不画焦点框」这三件不变的事；
      // 居中（Modal）还是贴某条边（WordCardSheet）由调用方的 className 决定。
      // 进出场由调用方挂 `.overlay-pop` / `.overlay-sheet`，两类弹层动效不同。
      className={cn("fixed z-50 outline-none", className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-copy font-bold text-ink", className)}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-meta text-muted", className)}
      {...props}
    />
  );
}

export type DialogPopupProps = ComponentProps<typeof DialogPopup>;
