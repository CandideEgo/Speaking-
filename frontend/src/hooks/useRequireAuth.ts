/**
 * useRequireAuth — guard hook for pages that require authentication.
 *
 * Centralizes the "redirect to login if unauthenticated" pattern duplicated
 * across 11+ page components. Returns { isAuthenticated, isLoading } so
 * pages can still gate data-loading on auth status.
 *
 * Usage (simple guard — just redirect + spinner):
 *   const { isAuthenticated, isLoading } = useRequireAuth();
 *   if (isLoading || !isAuthenticated) return <FullPageSpinner />;
 *
 * Usage (guard + data load on auth):
 *   const { isAuthenticated, isLoading } = useRequireAuth();
 *   useEffect(() => {
 *     if (isLoading || !isAuthenticated) return;
 *     loadData();
 *   }, [isAuthenticated, isLoading]);
 *
 * The hook fires the redirect as a side effect — no need for separate
 * useEffect in the page component just for the auth redirect.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

interface UseRequireAuthOptions {
  /** URL to redirect to when not authenticated. Default: "/login" */
  redirectTo?: string;
  /** Use router.replace instead of router.push. Default: false */
  replace?: boolean;
}

interface UseRequireAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
}

export function useRequireAuth(options: UseRequireAuthOptions = {}): UseRequireAuthReturn {
  const { redirectTo = "/login", replace = false } = options;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      if (replace) {
        router.replace(redirectTo);
      } else {
        router.push(redirectTo);
      }
    }
  }, [isAuthenticated, isLoading, redirectTo, replace, router]);

  return { isAuthenticated, isLoading };
}

/**
 * useRedirectIfAuthenticated — reverse guard for login/register/landing pages.
 *
 * Redirects authenticated users away to the app home. (Was /dashboard; the
 * dashboard is being removed per ADR-0003, so the app entry is now `/`.)
 *
 * Also exposes `redirectStuck`: true when the user is authenticated locally
 * but the soft redirect never lands (component still mounted after ~3s). That
 * happens when the middleware cookie mirror is missing — the browser blocked
 * the cookie write or the cookie was cleared while the localStorage token
 * survived — so the target route 302s straight back to /login and the page
 * would otherwise spin forever.
 */
export function useRedirectIfAuthenticated(
  redirectTo = "/"
): UseRequireAuthReturn & { redirectStuck: boolean } {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const router = useRouter();
  const [redirectStuck, setRedirectStuck] = useState(false);

  useEffect(() => {
    if (isLoading || redirectStuck) return;
    if (isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, isLoading, redirectTo, router, redirectStuck]);

  // Watchdog: if we're still here after the redirect should have landed, the
  // navigation is bouncing back. Flip redirectStuck so the page can offer
  // recovery actions instead of looping the spinner.
  useEffect(() => {
    if (!isAuthenticated || isLoading) {
      setRedirectStuck(false);
      return;
    }
    const timer = setTimeout(() => setRedirectStuck(true), 3000);
    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoading]);

  return { isAuthenticated, isLoading, redirectStuck };
}
