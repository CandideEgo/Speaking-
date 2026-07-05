/**
 * createApiClient — factory for typed API clients with shared retry/auth logic.
 *
 * Extracts the duplicated infrastructure between lib/api.ts (user) and
 * lib/adminApi.ts (admin): retry with backoff, 401 refresh, error parsing.
 *
 * Each consumer provides its own "auth adapter" (getToken, refresh, logout)
 * so the core loop stays identical while auth specifics remain isolated.
 */

// ---------------------------------------------------------------------------
// Shared retry helpers
// ---------------------------------------------------------------------------

export const MAX_RETRIES = 2;
export const RETRY_DELAYS_MS = [1000, 2000]; // 1s, then 2s

export function isRetryableStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
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
// Auth adapter — pluggable token / refresh / logout
// ---------------------------------------------------------------------------

export interface AuthAdapter {
  /** Return the current access token (null if not logged in) */
  getToken(): string | null;
  /** Attempt to refresh the access token. Return true on success. */
  refreshToken(): Promise<boolean>;
  /** Called when the session is definitively invalid (e.g. refresh failed). */
  onSessionExpired(): void;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly response: Response | null;

  constructor(
    message: string,
    status: number = 0,
    code: string | null = null,
    response: Response | null = null,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.response = response;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateApiClientOptions {
  /** Base URL for API requests */
  baseUrl: string;
  /** Auth adapter for token management */
  auth: AuthAdapter;
  /** Custom error class (must accept the same constructor args as ApiClientError) */
  ErrorClass?: typeof ApiClientError;
  /** Whether to handle 204 No Content and non-JSON responses (admin client needs this) */
  handleNonJsonResponses?: boolean;
}

export interface ApiClientRequestOptions extends Omit<RequestInit, "signal"> {
  signal?: AbortSignal;
}

export function createApiClient(options: CreateApiClientOptions) {
  const {
    baseUrl,
    auth,
    ErrorClass = ApiClientError,
    handleNonJsonResponses = false,
  } = options;

  async function request<T = unknown>(
    path: string,
    reqOptions: ApiClientRequestOptions = {},
  ): Promise<T> {
    const { signal, ...restOptions } = reqOptions;
    const headers = new Headers(restOptions.headers as HeadersInit);

    // Content-Type
    if (
      restOptions.body &&
      !(restOptions.body instanceof FormData) &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json");
    }

    // Token + pre-request expiry check
    let token = auth.getToken();
    let alreadyRefreshed = false;
    if (token) {
      const { isTokenExpired } = await import("./jwt");
      if (isTokenExpired(token)) {
        const refreshed = await auth.refreshToken();
        if (refreshed) {
          token = auth.getToken();
          alreadyRefreshed = true;
        } else {
          throw new ErrorClass("登录已过期，请重新登录", 401);
        }
      }
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
    let lastError: InstanceType<typeof ErrorClass> | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      let res: Response;
      try {
        res = await fetch(url, { ...restOptions, headers, signal });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;

        lastError = new ErrorClass(
          "网络连接失败，请检查网络或稍后重试",
          0,
          null,
          null,
        ) as InstanceType<typeof ErrorClass>;

        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS_MS[attempt], signal);
          continue;
        }
        throw lastError;
      }

      // 401 → refresh token and retry (only once per request, and only if
      // we haven't already refreshed in the pre-request check — with rotating
      // refresh tokens, a second refresh would fail and cause unexpected logout)
      if (res.status === 401 && attempt === 0 && !alreadyRefreshed) {
        const refreshed = await auth.refreshToken();
        if (refreshed) {
          const newToken = auth.getToken();
          if (newToken) headers.set("Authorization", `Bearer ${newToken}`);
          // Continue the retry loop with the new token
          continue;
        }
        // Refresh failed — session is over
        auth.onSessionExpired();
        throw new ErrorClass(
          "登录已过期，请重新登录",
          401,
          null,
          res,
        ) as InstanceType<typeof ErrorClass>;
      }

      // Non-ok response
      if (!res.ok) {
        let detail = "请求失败";
        let code: string | null = null;
        try {
          const data = await res.json();
          code = data.code ?? null;
          const d = data.detail;
          if (Array.isArray(d)) {
            // FastAPI/Pydantic 422 validation error: [{loc, msg, type}, ...].
            // Surface each field's message instead of coercing the array to
            // "[object Object]". Strip Pydantic's "Value error, " prefix.
            detail = d
              .map((e: { loc?: unknown[]; msg?: unknown }) => {
                const rawMsg =
                  typeof e.msg === "string" ? e.msg : JSON.stringify(e.msg);
                const cleanMsg = rawMsg.replace(/^Value error,\s*/, "");
                const field =
                  Array.isArray(e.loc) && e.loc.length > 1
                    ? String(e.loc[e.loc.length - 1])
                    : null;
                return field ? `${field}: ${cleanMsg}` : cleanMsg;
              })
              .join("; ");
          } else if (typeof d === "string") {
            detail = d;
          } else if (d !== undefined && d !== null) {
            detail = JSON.stringify(d);
          }
        } catch {
          /* non-JSON error body */
        }

        lastError = new ErrorClass(
          detail,
          res.status,
          code,
          res,
        ) as InstanceType<typeof ErrorClass>;

        // Retry on 5xx (server errors), not 4xx (client errors)
        if (isRetryableStatus(res.status) && attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS_MS[attempt], signal);
          continue;
        }

        throw lastError;
      }

      // Success — parse response
      if (handleNonJsonResponses) {
        if (res.status === 204) return undefined as T;
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json"))
          return (await res.json()) as T;
        return (await res.text()) as unknown as T;
      }

      return res.json();
    }

    throw lastError ?? new ErrorClass("请求失败", 0);
  }

  return { request };
}
