"use client";

import { useId, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOverlayContainer } from "@/hooks/useOverlayContainer";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/Dialog";

/**
 * 共享弹窗外壳。对外 API 与旧实现一致，内部换成 Base UI Dialog：
 * 焦点陷阱、滚动锁、背景 inert、嵌套对话框由原语负责，行为不再靠 useModalFocus 手写。
 *
 * 视觉沿用旧值（rounded-lg / p-5 / max-w-md / bg-black/40 遮罩）。进出场过渡
 * 现在没有：带 `data-ending-style:` 过渡时原语等不到 transitionend，弹层会
 * 在关闭后多留约 2.5 秒（见 ui/Dialog.tsx 注释），动效留到 Phase 2 再做。
 *
 * 挂载点是 `.user-ui` 壳层而不是 document.body：用户端把品牌变量收在
 * `.user-ui` 作用域里（蓝），管理端才是橙；portal 到 body 会让弹层里的
 * `bg-action-primary` 按钮从蓝变橙。管理端没有 `.user-ui`，回落到 body。
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  closeOnBackdrop = true,
  maxWidth = "max-w-md",
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Dismiss on backdrop click or Escape (disable while a request is busy). */
  closeOnBackdrop?: boolean;
  maxWidth?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const container = useOverlayContainer();

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (next) return;
        // 与旧实现对齐：closeOnBackdrop=false 时，遮罩点击与 Escape 都不关闭，
        // 但内容里的关闭按钮与显式 onClose 仍然有效。
        if (!closeOnBackdrop && details.reason === "escape-key") return;
        onClose();
      }}
      disablePointerDismissal={!closeOnBackdrop}
    >
      <DialogPortal container={container}>
        <DialogBackdrop />
        <DialogPopup
          className={cn("space-y-3 p-5", maxWidth)}
          finalFocus={returnFocusRef ?? true}
          aria-labelledby={title ? titleId : undefined}
          aria-label={title ? undefined : "对话框"}
        >
          {title && (
            <div className="flex items-center justify-between">
              <DialogTitle id={titleId} className="flex items-center gap-1.5">
                {title}
              </DialogTitle>
              <DialogClose className="text-muted hover:text-ink" aria-label="关闭">
                <X size={16} />
              </DialogClose>
            </div>
          )}
          {children}
          {footer && <div className="flex justify-end gap-2">{footer}</div>}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
