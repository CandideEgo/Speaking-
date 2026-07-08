/**
 * Admin auth store — separate from the user-side `authStore`.
 *
 * The admin console is an independent surface with its own login page and its
 * own session: tokens live under dedicated localStorage keys
 * (`speaking_admin_token`), so logging out of the user app does not log out
 * the admin (and vice versa). The backend still uses a single JWT/role system
 * — admin is simply a user with `role === "admin"`.
 */

import { create } from "zustand";
import { decodeJwt, isTokenExpired } from "@/lib/jwt";

export interface AdminAuthUser {
  sub?: string;
  role?: string;
  email?: string;
  name?: string;
  exp?: number;
  [key: string]: unknown;
}

interface AdminAuthState {
  token: string | null;
  refreshToken: string | null;
  user: AdminAuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AdminAuthActions {
  login: (token: string, refreshToken?: string | null) => void;
  logout: () => void;
  /** Read tokens from localStorage into state (no network, no redirect). */
  bootstrap: () => void;
  refreshAccessToken: () => Promise<boolean>;
}

const TOKEN_KEY = "speaking_admin_token";
const REFRESH_TOKEN_KEY = "speaking_admin_refresh_token";

let refreshPromise: Promise<boolean> | null = null;

function deriveAuthenticated(
  token: string | null,
  user: AdminAuthUser | null,
): boolean {
  if (!token || !user) return false;
  if (typeof user.exp === "number") {
    return user.exp >= Math.floor(Date.now() / 1000);
  }
  return true;
}

export const useAdminAuthStore = create<AdminAuthState & AdminAuthActions>(
  (set, get) => ({
    token: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
    isLoading: true,

    login(token: string, refreshToken?: string | null) {
      if (typeof window !== "undefined") {
        localStorage.setItem(TOKEN_KEY, token);
        if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        else localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
      const user = decodeJwt(token) as AdminAuthUser | null;
      set({
        token,
        refreshToken: refreshToken ?? null,
        user,
        isAuthenticated: deriveAuthenticated(token, user),
        isLoading: false,
      });
    },

    logout() {
      const currentToken = get().token;
      const currentRefreshToken = get().refreshToken;
      if (currentToken && typeof window !== "undefined") {
        const body = currentRefreshToken
          ? JSON.stringify({ refresh_token: currentRefreshToken })
          : "{}";
        fetch("/api/v1/auth/logout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${currentToken}`,
            "Content-Type": "application/json",
          },
          body,
        }).catch(() => {
          /* ignore — token will expire naturally */
        });
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
      set({
        token: null,
        refreshToken: null,
        user: null,
        isAuthenticated: false,
      });
      if (typeof window !== "undefined") {
        window.location.href = "/admin/login";
      }
    },

    bootstrap() {
      if (typeof window === "undefined") {
        set({ isLoading: false });
        return;
      }
      const token = localStorage.getItem(TOKEN_KEY);
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!token) {
        set({
          token: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return;
      }
      const user = decodeJwt(token) as AdminAuthUser | null;
      set({
        token,
        refreshToken,
        user,
        isAuthenticated: deriveAuthenticated(token, user),
        isLoading: false,
      });
      // If expired, attempt a background refresh; the shell guard will redirect
      // to /admin/login if the refresh also fails.
      if (isTokenExpired(token)) {
        if (refreshToken) {
          get().refreshAccessToken();
        } else {
          // No refresh token available — clear stale state so the shell guard
          // redirects to /admin/login instead of showing a blank/loading page.
          get().logout();
        }
      }
    },

    async refreshAccessToken(): Promise<boolean> {
      if (refreshPromise) return refreshPromise;
      refreshPromise = (async () => {
        const { refreshToken } = get();
        if (!refreshToken) {
          get().logout();
          return false;
        }
        try {
          const res = await fetch("/api/v1/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (!res.ok) {
            get().logout();
            return false;
          }
          const data = await res.json();
          get().login(data.token, data.refresh_token);
          return true;
        } catch {
          get().logout();
          return false;
        } finally {
          refreshPromise = null;
        }
      })();
      return refreshPromise;
    },
  }),
);
