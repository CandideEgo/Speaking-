/**
 * Zustand auth store - single source of truth for authentication state.
 *
 * Replaces scattered localStorage.getItem('token') / getToken() / manual JWT
 * decode patterns across the frontend. All auth state flows through here.
 *
 * Usage:
 *   import { useAuthStore } from '@/stores/authStore';
 *   const { token, user, isAuthenticated, login, logout } = useAuthStore();
 *   // Or outside React:
 *   useAuthStore.getState().token
 */

import { create } from "zustand";
import { decodeJwt, isTokenExpired } from "@/lib/jwt";
import {
  USER_SESSION_KEYS,
  migrateTokenKeys,
  deriveAuthenticated,
  setSession,
  clearSession,
  remirrorSessionCookie,
  type BaseAuthUser,
} from "@/lib/authHelpers";
import { useProfileStore } from "@/stores/profileStore";

/** JWT payload shape we care about (role 不在 JWT 里，见 authHelpers.BaseAuthUser) */
export type AuthUser = BaseAuthUser;

interface AuthState {
  /** Raw JWT access token string */
  token: string | null;
  /** Refresh token for obtaining new access tokens */
  refreshToken: string | null;
  /** Decoded JWT payload (null if no valid token) */
  user: AuthUser | null;
  /** Convenience flag - true when token exists and is not expired */
  isAuthenticated: boolean;
  /** True while initialize() is running on app load */
  isLoading: boolean;
}

interface AuthActions {
  /**
   * Store a new token (and optional refresh token), decode it, and update auth state.
   * Call this after successful login/register or token refresh.
   */
  login: (token: string, refreshToken?: string | null) => void;

  /**
   * Clear all auth state, remove tokens from localStorage,
   * and redirect to /login.
   */
  logout: () => void;

  /**
   * Check localStorage for existing tokens on app load.
   * Validates expiry - if expired, clears state and redirects.
   * Call once at app startup (e.g. in AuthInitializer component).
   */
  initialize: () => void;

  /**
   * Attempt to refresh the access token using the stored refresh token.
   * Uses a mutex to prevent concurrent refresh calls - if a refresh is
   * already in progress, returns the same promise.
   * Returns true on success, false on failure (logout is called).
   */
  refreshAccessToken: () => Promise<boolean>;
}

/** One-time migration: move tokens from old "speaking_*" keys to new "seeword_*" keys. */
const MIGRATION_MAPPINGS: [string, string][] = [
  ["speaking_token", USER_SESSION_KEYS.token],
  ["speaking_refresh_token", USER_SESSION_KEYS.refreshToken],
];

type AuthStore = AuthState & AuthActions;

/** Module-level mutex for preventing concurrent refresh calls */
let refreshPromise: Promise<boolean> | null = null;

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true, // starts true until initialize() runs

  login(token: string, refreshToken?: string | null) {
    // localStorage + 镜像 cookie 一起写（唯一入口，见 lib/authHelpers.setSession）。
    setSession(USER_SESSION_KEYS, token, refreshToken);
    const user = decodeJwt(token) as AuthUser | null;
    // A different subject is a different user: drop the cached profile so the next reader
    // fetches theirs rather than showing the previous one's face. `login()` is also the
    // token-refresh path, where the subject is unchanged and the cache must survive.
    // Imported statically, unlike the resets in logout(): this one has to land before the
    // re-render that triggers the next fetch.
    if (user?.sub !== get().user?.sub) {
      useProfileStore.getState().reset();
    }
    set({
      token,
      refreshToken: refreshToken ?? null,
      user,
      isAuthenticated: deriveAuthenticated(token, user),
    });
  },

  logout() {
    // Fire-and-forget server-side token blacklist request.
    // We capture the token *before* clearing state so the header is valid.
    // We await the fetch so the request completes before the hard redirect
    // (window.location.href aborts all in-flight JS).
    const currentToken = get().token;
    const currentRefreshToken = get().refreshToken;
    const blacklistPromise =
      currentToken && typeof window !== "undefined"
        ? (async () => {
            const body = currentRefreshToken
              ? JSON.stringify({ refresh_token: currentRefreshToken })
              : "{}";
            try {
              await fetch("/api/v1/auth/logout", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${currentToken}`,
                  "Content-Type": "application/json",
                },
                body,
              });
            } catch {
              /* ignore - token will expire naturally */
            }
          })()
        : Promise.resolve();

    if (typeof window !== "undefined") {
      // 两个存放位置一起清（唯一入口，见 lib/authHelpers.clearSession）。
      clearSession(USER_SESSION_KEYS);
    }
    set({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
    });
    // Reset sibling stores to avoid stale user data after logout.
    // Dynamic imports prevent circular dependency issues.
    const resetPromise = Promise.all([
      import("@/stores/watchStore").then((m) => m.useWatchStore.getState().reset()),
      import("@/stores/vocabularyStore").then((m) => m.useVocabularyStore.getState().reset()),
      import("@/stores/planStore").then((m) => m.usePlanStore.getState().reset()),
      import("@/stores/profileStore").then((m) => m.useProfileStore.getState().reset()),
    ]);

    // Wait for blacklist + store resets, then navigate.
    // Using window.location is correct here because the Zustand store
    // operates outside the React component tree where useRouter is unavailable.
    Promise.all([blacklistPromise, resetPromise]).then(() => {
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    });
  },

  initialize() {
    migrateTokenKeys(MIGRATION_MAPPINGS);

    if (typeof window === "undefined") {
      set({ isLoading: false });
      return;
    }

    const token = localStorage.getItem(USER_SESSION_KEYS.token);
    const refreshToken = localStorage.getItem(USER_SESSION_KEYS.refreshToken);
    if (!token) {
      // 镜像 cookie 可能是上一轮留下的，清掉避免 middleware 误放行；顺带把
      // 「有 refresh token 没有 access token」的孤儿也扫掉。
      clearSession(USER_SESSION_KEYS);
      set({
        token: null,
        refreshToken: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
      return;
    }

    // Check expiry
    if (isTokenExpired(token)) {
      // Access token expired - try refreshing before giving up
      if (refreshToken) {
        // Store the refresh token temporarily so refreshAccessToken can use it
        set({ refreshToken });
        get()
          .refreshAccessToken()
          .then((success) => {
            if (!success) {
              // Refresh failed - clear everything (logout already called)
            }
            // On success, login() already updated the state
            set({ isLoading: false });
          });
        return;
      }
      // No refresh token - clear and redirect (unless on the independent admin
      // console, which manages its own auth via a separate token store).
      clearSession(USER_SESSION_KEYS);
      set({
        token: null,
        refreshToken: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
      if (!window.location.pathname.startsWith("/admin")) {
        window.location.href = "/login";
      }
      return;
    }

    const user = decodeJwt(token) as AuthUser | null;
    if (!user) {
      // Token structurally invalid - clear and redirect
      clearSession(USER_SESSION_KEYS);
      set({
        token: null,
        refreshToken: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
      if (!window.location.pathname.startsWith("/admin")) {
        window.location.href = "/login";
      }
      return;
    }

    set({
      token,
      refreshToken,
      user,
      isAuthenticated: deriveAuthenticated(token, user),
      isLoading: false,
    });
    // 回访用户 cookie 可能已丢失/过期 — 用有效 token 重新镜像，
    // 否则 middleware 会把已登录用户拦到 /login。只补 cookie，不动 localStorage。
    remirrorSessionCookie(USER_SESSION_KEYS, token);
  },

  async refreshAccessToken(): Promise<boolean> {
    // If already refreshing, return the existing promise
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
        if (typeof data?.token !== "string" || !data.token) {
          get().logout();
          return false;
        }
        get().login(data.token, typeof data.refresh_token === "string" ? data.refresh_token : null);
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
}));
