const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function getApiUrl() {
  return API_URL;
}

export function mediaUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}

let authToken: string | null = null;

export function setToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem("speaking_token", token);
  } else {
    localStorage.removeItem("speaking_token");
  }
}

export function getToken(): string | null {
  if (authToken) return authToken;
  if (typeof window !== "undefined") {
    authToken = localStorage.getItem("speaking_token");
  }
  return authToken;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error("网络连接失败，请检查网络或稍后重试");
  }

  if (!res.ok) {
    let detail = "请求失败";
    try {
      const err = await res.json();
      detail = err.detail || detail;
    } catch {}
    throw new Error(detail);
  }

  return res.json();
}
