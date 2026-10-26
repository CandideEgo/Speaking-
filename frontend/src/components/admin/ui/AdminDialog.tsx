"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModalFocus } from "@/hooks/useModalFocus";
import { Button } from "@/components/ui/Button";

export interface AdminDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  /**
   * 无可见标题时的可访问名（例如 AdminConfirmDialog 把标题渲染在内容区）。
   * 有 `title` 时忽略，改用 aria-labelledby 指向可见标题。
   */
  ariaLabel?: string;
  /**
   * 调用方自己渲染标题时的 `aria-labelledby` 目标 id（优先级高于 ariaLabel，
   * 让可访问名始终指向可见文本）。
   */
  labelledBy?: string;
}

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

/**
 * Admin dialog shell.
 *
 * A11y（A-11）：渲染为 `role="dialog" aria-modal="true"`，标题经
 * `aria-labelledby` 关联；焦点/语义交给用户端同款 `useModalFocus` —— 打开时
 * 聚焦首个可聚焦元素、Tab 在弹层内循环、Esc 关闭、关闭后把焦点归还给打开前
 * 的元素。背景滚动锁仍在这里做（hook 只管焦点）。
 *
 * 不用 `<dialog>` 原生元素：本仓既有弹层都是 div + portal 风格，原生 dialog
 * 的 top-layer/close 事件与现有调用方（受控 open + onClose）需要额外适配。
 */
export function AdminDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  ariaLabel,
  labelledBy,
}: AdminDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalFocus(dialogRef, open, onClose);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : labelledBy}
        aria-label={title || labelledBy ? undefined : (ariaLabel ?? "对话框")}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "relative w-full mx-4 rounded-lg border border-hairline bg-canvas shadow-xl",
          SIZES[size],
          className
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between px-6 pt-6 pb-4">
            <div>
              {title && (
                <h2 id={titleId} className="text-copy-lg font-semibold text-ink">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descriptionId} className="mt-1 text-copy text-muted">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="关闭对话框"
              onClick={onClose}
              className="ml-4 rounded-lg p-1.5 text-muted hover:bg-surface-soft hover:text-ink transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        {children && <div className="px-6 py-4">{children}</div>}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-4">{footer}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm Dialog
// ---------------------------------------------------------------------------

export interface AdminConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export function AdminConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  loading = false,
}: AdminConfirmDialogProps) {
  const titleId = useId();
  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      size="sm"
      ariaLabel={title}
      labelledBy={titleId}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "destructive" : "primary"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "处理中..." : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        {danger && (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-error/10">
            <AlertTriangle size={20} className="text-error" />
          </div>
        )}
        <div>
          <h3 id={titleId} className="text-copy-lg font-semibold text-ink">
            {title}
          </h3>
          {description && <p className="mt-1.5 text-copy text-muted">{description}</p>}
        </div>
      </div>
    </AdminDialog>
  );
}
