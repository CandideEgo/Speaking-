import {
  createApiClient,
  ApiClientError,
  type AuthAdapter,
} from "@/lib/createApiClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

export function mediaUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
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
