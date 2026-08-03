"use client";

import { useRedirectIfAuthenticated } from "@/hooks/useRequireAuth";

/**
 * Non-blocking auth redirect for public pages.
 *
 * Renders nothing. If the visitor is already logged in, redirects them to
 * the app home once auth state finishes initializing. Crucially it does NOT
 * gate sibling content — the page renders immediately for everyone (fast
 * first paint + SEO), and authenticated users are bounced a moment later.
 */
export function AuthedRedirectGate({ redirectTo = "/" }: { redirectTo?: string }) {
  useRedirectIfAuthenticated(redirectTo);
  return null;
}
