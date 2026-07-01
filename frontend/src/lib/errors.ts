/**
 * toastApiError — extract user-facing message from unknown error, show toast.
 *
 * Replaces the duplicated pattern:
 *   toast.error(err instanceof Error ? err.message : "操作失败");
 *
 * Usage:
 *   toastApiError(err);                          // fallback: "操作失败"
 *   toastApiError(err, "保存失败");               // custom fallback
 *   toastApiError(err, `${label}失败`);           // dynamic fallback
 *
 * Also useful for non-toast targets:
 *   setError(apiErrorMessage(err, "登录失败"));
 */

import { toast } from "sonner";

/**
 * Extract a human-readable message from an unknown error.
 * Returns err.message if err is an Error instance, otherwise the fallback.
 */
export function apiErrorMessage(err: unknown, fallback = "操作失败"): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Show an error toast with a message extracted from an unknown error.
 * Falls back to the given message if err is not an Error instance.
 */
export function toastApiError(err: unknown, fallback = "操作失败"): void {
  toast.error(apiErrorMessage(err, fallback));
}
