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
    response: Response | null = null
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
  /**
   * GET-only: serve this request from a local TTL cache (milliseconds).
   * Responses are cloned on read/write so callers can't poison the cache.
   * Leave unset for requests that must always be fresh.
   */
  cacheTtlMs?: number;
}

// ---------------------------------------------------------------------------
// GET cache + in-flight dedupe
// ---------------------------------------------------------------------------
//
// - Dedupe: concurrent identical GETs (e.g. two components mounting at once)
//   share one network request. Always on, zero staleness risk.
// - TTL cache: opt-in via `cacheTtlMs`; useful for near-static payloads.
// Any non-GET request invalidates the whole TTL cache (crude but safe —
// mutations are rare relative to reads).

const _getCache = new Map<string, { value: unknown; expiresAt: number }>();
const _inflightGets = new Map<string, Promise<unknown>>();
const _GET_CACHE_MAX = 200;

/** Drop cached GET responses (all of them, or those whose URL starts with `prefix`). */
export function clearApiCache(prefix?: string) {
  if (!prefix) {
    _getCache.clear();
    return;
  }
  for (const key of _getCache.keys()) {
    if (key.startsWith(prefix)) _getCache.delete(key);
  }
}

function _clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : value;
}

async function _dedupedGet<T>(key: string, fn: () => Promise<T>): Promise<T> {
  let pending = _inflightGets.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = fn().finally(() => _inflightGets.delete(key));
    _inflightGets.set(key, pending);
  }
  // Clone so each consumer gets its own copy (protects cache + other callers).
  return _clone(await pending);
}

export function createApiClient(options: CreateApiClientOptions) {
  const { baseUrl, auth, ErrorClass = ApiClientError, handleNonJsonResponses = false } = options;

  async function request<T = unknown>(
    path: string,
    reqOptions: ApiClientRequestOptions = {}
  ): Promise<T> {
    const { cacheTtlMs, ...rest } = reqOptions;
    const method = (rest.method ?? "GET").toUpperCase();
    const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

    if (method === "GET" && !rest.body && !rest.signal) {
      const fetchFn = () => performRequest<T>(url, rest);
      if (cacheTtlMs && cacheTtlMs > 0) {
        const hit = _getCache.get(url);
        if (hit && hit.expiresAt > Date.now()) {
          return _clone(hit.value) as T;
        }
        const value = await _dedupedGet(url, fetchFn);
        if (_getCache.size >= _GET_CACHE_MAX) _getCache.clear();
        _getCache.set(url, { value, expiresAt: Date.now() + cacheTtlMs });
        return _clone(value) as T;
      }
      return _dedupedGet(url, fetchFn);
    }

    // Mutations invalidate cached GET payloads.
    if (_getCache.size > 0) _getCache.clear();
    return performRequest<T>(url, rest);
  }

  async function performRequest<T = unknown>(
    url: string,
    reqOptions: Omit<ApiClientRequestOptions, "cacheTtlMs">
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
          null
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
        throw new ErrorClass("登录已过期，请重新登录", 401, null, res) as InstanceType<
          typeof ErrorClass
        >;
      }

      // Non-ok response
      if (!res.ok) {
        let detail = "请求失败";
        let code: string | null = null;
        try {
          const data = await res.json();
          code = data.code ?? null;
          // 统一 envelope: {code, message, detail?}。优先 message（后端全局
          // handler 已格式化），回退 detail（向后兼容 / 422 数组）。
          if (typeof data.message === "string" && data.message) {
            detail = data.message;
          } else {
            const d = data.detail;
            if (Array.isArray(d)) {
              // FastAPI/Pydantic 422 validation error: [{loc, msg, type}, ...].
              // Strip Pydantic's "Value error, " prefix.
              detail = d
                .map((e: { loc?: unknown[]; msg?: unknown }) => {
                  const rawMsg = typeof e.msg === "string" ? e.msg : JSON.stringify(e.msg);
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
          }
        } catch {
          /* non-JSON error body */
        }

        lastError = new ErrorClass(detail, res.status, code, res) as InstanceType<
          typeof ErrorClass
        >;

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
        if (contentType.includes("application/json")) return (await res.json()) as T;
        return (await res.text()) as unknown as T;
      }

      return res.json();
    }

    throw lastError ?? new ErrorClass("请求失败", 0);
  }

  return { request };
}
