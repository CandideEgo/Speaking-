/**
 * Zustand auth store — single source of truth for authentication state.
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

/** JWT payload shape we care about */
export interface AuthUser {
  sub?: string;
  role?: string;
  email?: string;
  name?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

interface AuthState {
  /** Raw JWT access token string */
  token: string | null;
  /** Refresh token for obtaining new access tokens */
  refreshToken: string | null;
  /** Decoded JWT payload (null if no valid token) */
  user: AuthUser | null;
  /** Convenience flag — true when token exists and is not expired */
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
   * Validates expiry — if expired, clears state and redirects.
   * Call once at app startup (e.g. in AuthInitializer component).
   */
  initialize: () => void;

  /**
   * Attempt to refresh the access token using the stored refresh token.
   * Uses a mutex to prevent concurrent refresh calls — if a refresh is
   * already in progress, returns the same promise.
   * Returns true on success, false on failure (logout is called).
   */
  refreshAccessToken: () => Promise<boolean>;

  /**
   * Mark onboarding as completed (stored in localStorage).
   */
  setOnboardingCompleted: () => void;
}

const TOKEN_KEY = "speaking_token";
const REFRESH_TOKEN_KEY = "speaking_refresh_token";

type AuthStore = AuthState & AuthActions;

/**
 * Derive isAuthenticated from token + user state.
 * A token is only "authenticated" if it exists AND is not expired.
 */
function deriveAuthenticated(token: string | null, user: AuthUser | null): boolean {
  if (!token || !user) return false;
  // If we have a decoded user with exp, double-check it's still valid
  if (typeof user.exp === "number") {
    const now = Math.floor(Date.now() / 1000);
    return user.exp >= now;
  }
  // No exp claim — treat as valid (some tokens may not have exp)
  return true;
}

/** Module-level mutex for preventing concurrent refresh calls */
let refreshPromise: Promise<boolean> | null = null;

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true, // starts true until initialize() runs

  login(token: string, refreshToken?: string | null) {
    if (typeof window !== "undefined") {
      localStorage.setItem(TOKEN_KEY, token);
      if (refreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      } else {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    }
    const user = decodeJwt(token) as AuthUser | null;
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
    // If it fails, the token still expires naturally — no need to await or block.
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
      window.location.href = "/login";
    }
  },

  initialize() {
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

    // Check expiry
    if (isTokenExpired(token)) {
      // Access token expired — try refreshing before giving up
      if (refreshToken) {
        // Store the refresh token temporarily so refreshAccessToken can use it
        set({ refreshToken });
        get()
          .refreshAccessToken()
          .then((success) => {
            if (!success) {
              // Refresh failed — clear everything (logout already called)
            }
            // On success, login() already updated the state
            set({ isLoading: false });
          });
        return;
      }
      // No refresh token — clear and redirect
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      set({
        token: null,
        refreshToken: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
      window.location.href = "/login";
      return;
    }

    const user = decodeJwt(token) as AuthUser | null;
    if (!user) {
      // Token structurally invalid — clear and redirect
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      set({
        token: null,
        refreshToken: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
      window.location.href = "/login";
      return;
    }

    set({
      token,
      refreshToken,
      user,
      isAuthenticated: deriveAuthenticated(token, user),
      isLoading: false,
    });
  },

  async refreshAccessToken(): Promise<boolean> {
    // If already refreshing, return the existing promise
    if (refreshPromise) return refreshPromise;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    refreshPromise = (async () => {
      const { refreshToken } = get();
      if (!refreshToken) {
        get().logout();
        return false;
      }
      try {
        const res = await fetch(`${apiUrl}/api/v1/auth/refresh`, {
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

  setOnboardingCompleted() {
    if (typeof window !== "undefined") {
      localStorage.setItem("onboarding_completed", "true");
    }
  },
}));
