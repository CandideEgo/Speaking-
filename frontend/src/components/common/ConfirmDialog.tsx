"use client";

import { type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "@/components/ui/Button";

/**
 * Controlled confirmation dialog built on `Modal`. Replaces native
 * `window.confirm` with a styled, on-brand dialog. `tone="danger"` is for
 * destructive actions (delete / ban / revoke); the confirm button turns red
 * and a warning icon prefixes the title.
 *
 * The dialog closes immediately on confirm and runs `onConfirm` fire-and-
 * forget (mirrors the old `window.confirm` → async-action flow; the action
 * surfaces success/failure via toast).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  tone = "default",
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title?: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!busy}
      title={
        tone === "danger" ? (
          <>
            <AlertTriangle size={15} className="text-red-500" />
            {title ?? "确认操作"}
          </>
        ) : (
          title
        )
      }
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "destructive" : "primary"}
            size="sm"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-xs text-muted-foreground">{message}</p>
    </Modal>
  );
}
