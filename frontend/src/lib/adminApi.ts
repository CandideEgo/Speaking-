/**
 * Admin API client — like `lib/api.ts` but reads the admin token from
 * `adminAuthStore` (separate session from the user app).
 *
 * Module pages consume real data via `lib/adminData.ts`; only the
 * login flow and the role check hit the backend directly through this client.
 */

import { useAdminAuthStore } from "@/stores/adminAuthStore";
import { isTokenExpired } from "@/lib/jwt";

// ---------------------------------------------------------------------------
// Retry helpers (mirrors lib/api.ts)
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

export function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

export class AdminApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getToken(): string | null {
  return useAdminAuthStore.getState().token;
}

export async function adminApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const apiUrl = getApiUrl();
  const url = path.startsWith("http") ? path : `${apiUrl}${path}`;
  const signal = options.signal as AbortSignal | undefined;

  const headers = new Headers(options.headers || {});
  let token = getToken();
  if (token && isTokenExpired(token)) {
    await useAdminAuthStore.getState().refreshAccessToken();
    token = getToken();
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...options, headers, signal });
    } catch (err) {
      // Network error (DNS, connection refused, etc.) — retryable
      if (attempt < MAX_RETRIES && err instanceof TypeError) {
        await sleep(RETRY_DELAYS_MS[attempt], signal);
        continue;
      }
      throw err;
    }

    // 401 → refresh token once, then retry
    if (res.status === 401 && attempt === 0) {
      const ok = await useAdminAuthStore.getState().refreshAccessToken();
      if (ok) {
        const retryToken = getToken();
        if (retryToken) headers.set("Authorization", `Bearer ${retryToken}`);
        continue;
      }
    }

    // 5xx → retry with backoff
    if (isRetryableStatus(res.status) && attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAYS_MS[attempt], signal);
      continue;
    }

    if (!res.ok) {
      let code: string | undefined;
      let detail = res.statusText;
      try {
        const data = await res.json();
        detail = data.detail || detail;
        code = data.code;
      } catch {
        /* non-JSON error */
      }
      throw new AdminApiError(detail, res.status, code);
    }

    if (res.status === 204) return undefined as T;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json"))
      return (await res.json()) as T;
    return (await res.text()) as unknown as T;
  }

  // Unreachable, but TypeScript needs it
  throw new AdminApiError("Max retries exceeded", 503);
}
