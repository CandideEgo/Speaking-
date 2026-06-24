const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// ApiError — structured error for API responses
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  /** HTTP status code (0 for network errors) */
  readonly status: number;
  /** Machine-readable error code from the server, if any */
  readonly code: string | null;
  /** Original Response object (null for network errors) */
  readonly response: Response | null;

  constructor(
    message: string,
    status: number = 0,
    code: string | null = null,
    response: Response | null = null
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.response = response;
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
// Retry helpers
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1000, 2000]; // 1s, then 2s

function isRetryableStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (signal.aborted) {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Core API client
// ---------------------------------------------------------------------------

export interface ApiOptions extends Omit<RequestInit, "signal"> {
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { signal, ...restOptions } = options;
  const token = getToken();
  const headers: Record<string, string> = {
    ...(restOptions.headers as Record<string, string>),
  };

  if (!(restOptions.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    // Validate token expiry before making the request
    const { isTokenExpired } = await import("./jwt");
    if (isTokenExpired(token)) {
      // Try refreshing the token before giving up
      const { useAuthStore } = require("@/stores/authStore");
      const refreshed = await useAuthStore.getState().refreshAccessToken();
      if (refreshed) {
        // Update the Authorization header with the new token
        const newToken = useAuthStore.getState().token;
        if (newToken) {
          headers["Authorization"] = `Bearer ${newToken}`;
        }
      } else {
        // Refresh failed — logout already called inside refreshAccessToken
        throw new ApiError("登录已过期，请重新登录", 401);
      }
    } else {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  let lastError: ApiError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Check if already aborted before attempting
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, {
        ...restOptions,
        headers,
        signal,
      });
    } catch (err) {
      // Network error (DNS, connection refused, etc.) — retryable
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err; // Don't retry aborts
      }

      lastError = new ApiError("网络连接失败，请检查网络或稍后重试", 0, null, null);

      // Retry for network errors (unless it's the last attempt)
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[attempt], signal);
        continue;
      }
      throw lastError;
    }

    // Handle 401 Unauthorized — try refreshing the token before logging out
    if (res.status === 401) {
      const { useAuthStore } = require("@/stores/authStore");
      const refreshed = await useAuthStore.getState().refreshAccessToken();
      if (refreshed) {
        // Retry the original request with the new token
        const newToken = useAuthStore.getState().token;
        if (newToken) {
          headers["Authorization"] = `Bearer ${newToken}`;
        }
        try {
          const retryRes = await fetch(`${API_URL}${path}`, {
            ...restOptions,
            headers,
            signal,
          });
          if (retryRes.ok) {
            return retryRes.json();
          }
          if (retryRes.status === 401) {
            // Refresh succeeded but server still rejects — truly unauthorized
            useAuthStore.getState().logout();
            throw new ApiError("登录已过期，请重新登录", 401, null, retryRes);
          }
          // Handle other errors from the retry
          let detail = "请求失败";
          let code: string | null = null;
          try {
            const err = await retryRes.json();
            detail = err.detail || detail;
            code = err.code ?? null;
          } catch {}
          throw new ApiError(detail, retryRes.status, code, retryRes);
        } catch (err) {
          if (err instanceof ApiError) throw err;
          // Network error on retry
          throw new ApiError("网络连接失败，请检查网络或稍后重试", 0);
        }
      }
      // Refresh failed — logout already called inside refreshAccessToken
      throw new ApiError("登录已过期，请重新登录", 401, null, res);
    }

    // Non-ok response
    if (!res.ok) {
      let detail = "请求失败";
      let code: string | null = null;
      try {
        const err = await res.json();
        detail = err.detail || detail;
        code = err.code ?? null;
      } catch {}

      lastError = new ApiError(detail, res.status, code, res);

      // Only retry on 5xx (server errors), not 4xx (client errors)
      if (isRetryableStatus(res.status) && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[attempt], signal);
        continue;
      }

      throw lastError;
    }

    return res.json();
  }

  // Should not reach here, but just in case
  throw lastError ?? new ApiError("请求失败", 0);
}
