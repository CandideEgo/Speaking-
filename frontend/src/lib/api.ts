import {
  createApiClient,
  ApiClientError,
  type AuthAdapter,
} from "@/lib/createApiClient";

// Empty string = relative paths (e.g. "/api/v1/..."). In production, nginx
// proxies /api/ and /media/ to the backend. In development, next.config.js
// rewrites handle the proxying. No build-time API URL configuration needed.
const API_URL = "";

// ---------------------------------------------------------------------------
// ApiError — structured error for API responses (backward-compatible)
// ---------------------------------------------------------------------------

export class ApiError extends ApiClientError {
  constructor(
    message: string,
    status: number = 0,
    code: string | null = null,
    response: Response | null = null,
  ) {
    super(message, status, code, response);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

export function getApiUrl() {
  return API_URL;
}

// Hostname suffixes whose thumbnail URLs we route through the backend image
// proxy to bypass CDN hotlink protection (Referer) and mixed-content (http://
// thumbnails on an https site). Keep in sync with the backend allowlist in
// backend/app/api/v1/media.py (proxy_image).
const PROXY_HOST_SUFFIXES = [
  "ytimg.com",
  "hdslb.com",
  "biliimg.com",
  "douyinpic.com",
  "douyincdn.com",
  "douyinstatic.com",
  "aliyuncs.com",
];

function shouldProxyHost(host: string): boolean {
  const h = host.toLowerCase();
  return PROXY_HOST_SUFFIXES.some((s) => h === s || h.endsWith("." + s));
}

export function mediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) {
    // Route known thumbnail CDN hosts through the backend proxy to dodge
    // hotlink protection and http/https mixed-content issues.
    // NOTE: the media router is mounted at /media (no /api/v1 prefix — see
    // backend/app/main.py: app.include_router(media.router)), so the proxy
    // lives at /media/proxy, NOT /api/v1/media/proxy.
    try {
      const host = new URL(path).hostname;
      if (shouldProxyHost(host)) {
        return `${API_URL}/media/proxy?url=${encodeURIComponent(path)}`;
      }
    } catch {
      // Malformed URL — fall through and return as-is.
    }
    // Best-effort: upgrade plain http to https to avoid mixed-content blocks.
    return path.replace(/^http:\/\//, "https://");
  }
  return `${API_URL}${path}`;
}

/**
 * Check whether a user has an active Pro subscription.
 *
 * The backend sets ``plan = "pro"`` on upgrade but does NOT reset it on
 * expiry — instead ``plan_expires_at`` is checked.  A naive
 * ``user.plan === "pro"`` would show Pro UI to expired users who then
 * get 403 from the API.  This helper mirrors the backend's
 * ``/payments/status`` logic: plan must be "pro" **and** the expiry
 * must be in the future.
 */
export function isProUser(
  user: { plan: string; plan_expires_at: string | null } | null | undefined,
): boolean {
  if (!user || user.plan !== "pro") return false;
  if (!user.plan_expires_at) return false;
  return new Date(user.plan_expires_at) > new Date();
}

/**
 * Get the current auth token from the Zustand auth store.
 *
 * This is the single source of truth — no direct localStorage access.
 * The auth store handles localStorage sync internally.
 */
export function getToken(): string | null {
  // Lazy import to avoid circular dependency at module load time
  // (authStore imports from jwt.ts, which is fine, but api.ts is imported
  // widely and we don't want to force authStore to load before it's needed)
  const { useAuthStore } = require("@/stores/authStore");
  return useAuthStore.getState().token;
}

// ---------------------------------------------------------------------------
// Auth adapter for the user auth store
// ---------------------------------------------------------------------------

const userAuthAdapter: AuthAdapter = {
  getToken,
  async refreshToken() {
    const { useAuthStore } = require("@/stores/authStore");
    return useAuthStore.getState().refreshAccessToken();
  },
  onSessionExpired() {
    const { useAuthStore } = require("@/stores/authStore");
    useAuthStore.getState().logout();
  },
};

// ---------------------------------------------------------------------------
// Core API client (delegates to createApiClient)
// ---------------------------------------------------------------------------

const client = createApiClient({
  baseUrl: API_URL,
  auth: userAuthAdapter,
  ErrorClass: ApiError,
});

export interface ApiOptions extends Omit<RequestInit, "signal"> {
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  return client.request<T>(path, options);
}
