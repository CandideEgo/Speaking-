/**
 * Admin auth store - separate from the user-side `authStore`.
 *
 * The admin console is an independent surface with its own login page and its
 * own session: tokens live under dedicated localStorage keys
 * (`seeword_admin_token`), so logging out of the user app does not log out
 * the admin (and vice versa). The backend still uses a single JWT/role system
 * - admin is simply a user with `role === "admin"`.
 *
 * 共享工具（migrateTokenKeys/deriveAuthenticated/BaseAuthUser）见 @/lib/authHelpers。
 */

import { create } from "zustand";
import { decodeJwt, isTokenExpired } from "@/lib/jwt";
import {
  ADMIN_SESSION_KEYS,
  migrateTokenKeys,
  deriveAuthenticated,
  setSession,
  clearSession,
  remirrorSessionCookie,
  type BaseAuthUser,
} from "@/lib/authHelpers";

/** JWT payload（role 不在 JWT 里，admin role 经 /users/me DB 查询 + get_admin_user 叠加）。 */
export type AdminAuthUser = BaseAuthUser;

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

/** One-time migration: move admin tokens from old "speaking_*" keys to new "seeword_*" keys. */
const MIGRATION_MAPPINGS: [string, string][] = [
  ["speaking_admin_token", ADMIN_SESSION_KEYS.token],
  ["speaking_admin_refresh_token", ADMIN_SESSION_KEYS.refreshToken],
];

let refreshPromise: Promise<boolean> | null = null;
/** Bumped by logout() so a refresh that lands later cannot resurrect the session. */
let sessionEpoch = 0;

export const useAdminAuthStore = create<AdminAuthState & AdminAuthActions>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login(token: string, refreshToken?: string | null) {
    // localStorage + 镜像 cookie 一起写（唯一入口，见 lib/authHelpers.setSession）。
    setSession(ADMIN_SESSION_KEYS, token, refreshToken);
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
    sessionEpoch += 1;
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
        /* ignore - token will expire naturally */
      });
    }
    if (typeof window !== "undefined") {
      // 两个存放位置一起清（唯一入口，见 lib/authHelpers.clearSession）。
      clearSession(ADMIN_SESSION_KEYS);
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

  async bootstrap() {
    migrateTokenKeys(MIGRATION_MAPPINGS);

    if (typeof window === "undefined") {
      set({ isLoading: false });
      return;
    }
    const token = localStorage.getItem(ADMIN_SESSION_KEYS.token);
    const refreshToken = localStorage.getItem(ADMIN_SESSION_KEYS.refreshToken);
    if (!token) {
      // 镜像 cookie 可能是上一轮留下的，清掉避免 middleware 误放行 /admin。
      clearSession(ADMIN_SESSION_KEYS);
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
    // 回访管理员的镜像 cookie 可能已丢失 — 用有效 token 重新镜像。只补 cookie。
    remirrorSessionCookie(ADMIN_SESSION_KEYS, token);
    // If expired, refresh BEFORE clearing the loading state: the shell guard
    // redirects to /admin/login as soon as isLoading=false && !isAuthenticated,
    // so clearing isLoading synchronously would bounce an expired-but-
    // refreshable session to the login form before the refresh resolves
    // (mirrors the user-side authStore.initialize() pattern).
    if (isTokenExpired(token)) {
      if (refreshToken) {
        set({ isLoading: true, isAuthenticated: false });
        await get().refreshAccessToken();
        set({ isLoading: false });
      } else {
        // No refresh token available - clear stale state so the shell guard
        // redirects to /admin/login instead of showing a blank/loading page.
        get().logout();
      }
    }
  },

  async refreshAccessToken(): Promise<boolean> {
    if (refreshPromise) return refreshPromise;
    const epoch = sessionEpoch;
    refreshPromise = (async () => {
      const { refreshToken } = get();
      if (!refreshToken) {
        if (epoch === sessionEpoch) get().logout();
        return false;
      }
      try {
        const res = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (epoch !== sessionEpoch) return false;
        if (!res.ok) {
          get().logout();
          return false;
        }
        const data = await res.json();
        if (epoch !== sessionEpoch) return false;
        if (typeof data?.token !== "string" || !data.token) {
          get().logout();
          return false;
        }
        get().login(data.token, typeof data.refresh_token === "string" ? data.refresh_token : null);
        return true;
      } catch {
        if (epoch === sessionEpoch) get().logout();
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  },
}));
