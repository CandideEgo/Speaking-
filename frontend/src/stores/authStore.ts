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

import { create } from 'zustand';
import { decodeJwt, isTokenExpired } from '@/lib/jwt';

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
  /** Raw JWT token string */
  token: string | null;
  /** Decoded JWT payload (null if no valid token) */
  user: AuthUser | null;
  /** Convenience flag — true when token exists and is not expired */
  isAuthenticated: boolean;
  /** True while initialize() is running on app load */
  isLoading: boolean;
}

interface AuthActions {
  /**
   * Store a new token, decode it, and update auth state.
   * Call this after successful login/register.
   */
  login: (token: string) => void;

  /**
   * Clear all auth state, remove token from localStorage,
   * and redirect to /login.
   */
  logout: () => void;

  /**
   * Check localStorage for an existing token on app load.
   * Validates expiry — if expired, clears state and redirects.
   * Call once at app startup (e.g. in a client layout component).
   */
  initialize: () => void;
}

const TOKEN_KEY = 'speaking_token';

type AuthStore = AuthState & AuthActions;

/**
 * Derive isAuthenticated from token + user state.
 * A token is only "authenticated" if it exists AND is not expired.
 */
function deriveAuthenticated(token: string | null, user: AuthUser | null): boolean {
  if (!token || !user) return false;
  // If we have a decoded user with exp, double-check it's still valid
  if (typeof user.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    return user.exp >= now;
  }
  // No exp claim — treat as valid (some tokens may not have exp)
  return true;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: true, // starts true until initialize() runs

  login(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, token);
    }
    const user = decodeJwt(token) as AuthUser | null;
    set({
      token,
      user,
      isAuthenticated: deriveAuthenticated(token, user),
    });
  },

  logout() {
    // Fire-and-forget server-side token blacklist request.
    // We capture the token *before* clearing state so the header is valid.
    // If it fails, the token still expires naturally — no need to await or block.
    const currentToken = get().token;
    if (currentToken && typeof window !== 'undefined') {
      fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}` },
      }).catch(() => { /* ignore — token will expire naturally */ });
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
    }
    set({
      token: null,
      user: null,
      isAuthenticated: false,
    });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },

  initialize() {
    if (typeof window === 'undefined') {
      set({ isLoading: false });
      return;
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      set({ token: null, user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    // Check expiry
    if (isTokenExpired(token)) {
      // Token expired — clear and redirect
      localStorage.removeItem(TOKEN_KEY);
      set({ token: null, user: null, isAuthenticated: false, isLoading: false });
      window.location.href = '/login';
      return;
    }

    const user = decodeJwt(token) as AuthUser | null;
    if (!user) {
      // Token structurally invalid — clear and redirect
      localStorage.removeItem(TOKEN_KEY);
      set({ token: null, user: null, isAuthenticated: false, isLoading: false });
      window.location.href = '/login';
      return;
    }

    set({
      token,
      user,
      isAuthenticated: deriveAuthenticated(token, user),
      isLoading: false,
    });
  },
}));
