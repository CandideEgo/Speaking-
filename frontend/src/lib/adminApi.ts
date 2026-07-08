/**
 * Admin API client — like `lib/api.ts` but reads the admin token from
 * `adminAuthStore` (separate session from the user app).
 *
 * Module pages consume real data via `lib/adminData.ts`; only the
 * login flow and the role check hit the backend directly through this client.
 */

import {
  createApiClient,
  ApiClientError,
  type AuthAdapter,
} from "@/lib/createApiClient";

// ---------------------------------------------------------------------------
// AdminApiError — backward-compatible error class
// ---------------------------------------------------------------------------

export class AdminApiError extends ApiClientError {
  constructor(message: string, status: number, code?: string) {
    super(message, status, code ?? null, null);
    this.name = "AdminApiError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getApiUrl(): string {
  // Empty string = relative paths. nginx proxies in production, next.config.js
  // rewrites in development. No build-time API URL configuration needed.
  return "";
}

// ---------------------------------------------------------------------------
// Auth adapter for the admin auth store
// ---------------------------------------------------------------------------

const adminAuthAdapter: AuthAdapter = {
  getToken() {
    // Lazy import to avoid circular dependency at module load time
    const { useAdminAuthStore } = require("@/stores/adminAuthStore");
    return useAdminAuthStore.getState().token;
  },
  async refreshToken() {
    const { useAdminAuthStore } = require("@/stores/adminAuthStore");
    return useAdminAuthStore.getState().refreshAccessToken();
  },
  onSessionExpired() {
    const { useAdminAuthStore } = require("@/stores/adminAuthStore");
    useAdminAuthStore.getState().logout();
  },
};

// ---------------------------------------------------------------------------
// Admin API client (delegates to createApiClient)
// ---------------------------------------------------------------------------

const client = createApiClient({
  baseUrl: getApiUrl(),
  auth: adminAuthAdapter,
  ErrorClass: AdminApiError,
  handleNonJsonResponses: true,
});

export async function adminApi<T>(
  path: string,
  options: Omit<RequestInit, "signal"> & { signal?: AbortSignal } = {},
): Promise<T> {
  return client.request<T>(path, options);
}
