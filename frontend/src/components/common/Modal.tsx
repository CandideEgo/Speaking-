"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared modal/dialog shell. Renders a centered overlay with backdrop + a
 * bordered card container. Used by both admin (e.g. video reject dialog) and
 * user-side (e.g. ShareToCommunityDialog) — extracted from the byte-identical
 * chrome that was duplicated across those components.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  closeOnBackdrop = true,
  maxWidth = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Dismiss when clicking the backdrop (disable while a request is busy). */
  closeOnBackdrop?: boolean;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (closeOnBackdrop) onClose();
      }}
    >
      <div
        className={cn(
          "w-full rounded-lg bg-canvas border border-hairline p-5 space-y-3",
          maxWidth,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-ink"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {children}
        {footer && <div className="flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
