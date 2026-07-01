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

import { useEffect } from "react";
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

export function useRequireAuth(
  options: UseRequireAuthOptions = {},
): UseRequireAuthReturn {
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
 * useRedirectIfAuthenticated — reverse guard for login/register pages.
 *
 * Redirects authenticated users away (e.g. to dashboard).
 */
export function useRedirectIfAuthenticated(
  redirectTo = "/dashboard",
): UseRequireAuthReturn {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, isLoading, redirectTo, router]);

  return { isAuthenticated, isLoading };
}
