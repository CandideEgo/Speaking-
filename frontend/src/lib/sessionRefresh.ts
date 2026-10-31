/**
 * 刷新 access token —— 把「会话确定失效」与「服务端暂时不可用」分开（A03 / FE-07）。
 *
 * 旧实现把两者混成「刷新失败 → logout()」：access token 刚过期时短暂断网、或
 * 后端 5xx 一次，用户就被清掉会话踢回登录页，而他的 refresh token 其实完全有效。
 *
 * 三种结果的含义是固定的，调用方必须分别处理：
 * - ``refreshed``   拿到新的一对 token。
 * - ``expired``     服务端明确拒绝（401/403）。只有这里才应该清会话。
 * - ``unavailable`` 网络错误、超时、5xx/429、响应体读不出来。**不得登出**，
 *                   保留 refresh token，等下一次请求再试。
 */

export type RefreshOutcome = "refreshed" | "expired" | "unavailable";

export interface TokenPair {
  token: string;
  refreshToken: string | null;
}

export type RefreshResult =
  { outcome: "refreshed"; pair: TokenPair } | { outcome: "expired" } | { outcome: "unavailable" };

/**
 * 刷新请求自身的期限。没有它会挂死：请求停在半开连接上时，页面壳会一直等
 * ``/users/me``，用户看到的是永远不结束的骨架屏。
 */
export const REFRESH_TIMEOUT_MS = 10_000;

export async function requestTokenRefresh(
  refreshToken: string,
  timeoutMs: number = REFRESH_TIMEOUT_MS
): Promise<RefreshResult> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer =
    controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res: Response;
  try {
    res = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller?.signal,
    });
  } catch {
    // 断网、超时、被中止 —— 都不能说明凭据失效。
    return { outcome: "unavailable" };
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!res.ok) {
    // 401/403 是「这个 refresh 确定无效」；其余（5xx、429、网关错误）是临时故障。
    const definitive = res.status === 401 || res.status === 403;
    return definitive ? { outcome: "expired" } : { outcome: "unavailable" };
  }

  const data = await res.json().catch(() => null);
  if (!data) {
    // 状态 200 但响应体读不出来 —— 传输层问题，不是凭据问题。
    return { outcome: "unavailable" };
  }
  if (typeof data.token !== "string" || !data.token) {
    return { outcome: "expired" };
  }
  return {
    outcome: "refreshed",
    pair: {
      token: data.token,
      refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    },
  };
}
