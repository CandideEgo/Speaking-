"use client";

import { useEffect, type ReactNode } from "react";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
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
}

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

export function AdminDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: AdminDialogProps) {
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative w-full mx-4 rounded-xl border border-hairline bg-canvas shadow-xl",
          SIZES[size],
          className
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between px-6 pt-6 pb-4">
            <div>
              {title && <h2 className="text-lg font-semibold text-ink">{title}</h2>}
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button
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
  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      size="sm"
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
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
    </AdminDialog>
  );
}
