"use client";
import { useEffect, type RefObject } from "react";

export function useModalFocus(
  dialogRef: RefObject<HTMLDivElement | null>,
  open: boolean,
  onClose: () => void,
  closeOnBackdrop = true,
  returnFocusRef?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const returnTarget = returnFocusRef?.current ?? previousFocus;
    const dialog = dialogRef.current;
    const stopBackgroundFocus = (event: FocusEvent) => {
      if (dialog && !dialog.contains(event.target as Node)) dialog.focus({ preventScroll: true });
    };
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
        ) ?? []
      ).filter((element) => element.getClientRects().length > 0);
    (focusable()[0] ?? dialog)?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    document.addEventListener("focusin", stopBackgroundFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      document.removeEventListener("focusin", stopBackgroundFocus);
      returnTarget?.focus({ preventScroll: true });
    };
  }, [open, dialogRef, returnFocusRef]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnBackdrop) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, closeOnBackdrop]);
}
