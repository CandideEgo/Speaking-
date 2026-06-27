/**
 * Admin API client — like `lib/api.ts` but reads the admin token from
 * `adminAuthStore` (separate session from the user app).
 *
 * Module pages consume real data via `lib/adminData.ts`; only the
 * login flow and the role check hit the backend directly through this client.
 */

import { useAdminAuthStore } from "@/stores/adminAuthStore";
import { isTokenExpired } from "@/lib/jwt";

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

  let res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    const ok = await useAdminAuthStore.getState().refreshAccessToken();
    if (ok) {
      const retryToken = getToken();
      if (retryToken) headers.set("Authorization", `Bearer ${retryToken}`);
      res = await fetch(url, { ...options, headers });
    }
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
  if (contentType.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}
