import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  clearApiCache,
  createApiClient,
  type AuthAdapter,
} from "@/lib/createApiClient";

/** Build a non-cryptographic three-part JWT string with the given payload. */
function makeToken(payload: Record<string, unknown>): string {
  const enc = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc(payload)}.sig`;
}

const liveToken = () => makeToken({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 });
const expiredToken = () => makeToken({ sub: "u1", exp: Math.floor(Date.now() / 1000) - 60 });

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const WRONG_PASSWORD = {
  code: "HTTP_401",
  message: "手机号或密码错误",
  detail: "手机号或密码错误",
};

interface AdapterSpy {
  adapter: AuthAdapter;
  refreshCalls: number;
  sessionExpiredCalls: number;
}

/** Auth adapter whose refresh outcome is scripted, recording every call. */
function makeAdapter(opts: {
  token: string | null;
  refreshSucceeds?: boolean;
  /** 模拟断网 / 5xx：adapter 回 "unavailable"，客户端不得清会话。 */
  refreshUnavailable?: boolean;
  refreshedToken?: string;
}): AdapterSpy {
  let token = opts.token;
  const spy: AdapterSpy = {
    refreshCalls: 0,
    sessionExpiredCalls: 0,
    adapter: {
      getToken: () => token,
      refreshToken: async () => {
        spy.refreshCalls += 1;
        if (opts.refreshUnavailable) return "unavailable";
        if (!opts.refreshSucceeds) return "expired";
        token = opts.refreshedToken ?? token;
        return "refreshed";
      },
      onSessionExpired: () => {
        spy.sessionExpiredCalls += 1;
      },
    },
  };
  return spy;
}

const clientWith = (auth: AuthAdapter) =>
  createApiClient({ baseUrl: "", auth, ErrorClass: ApiClientError });

/** A client with an explicit cache scope — the user/admin split, named. */
const scopedClientWith = (auth: AuthAdapter, cacheScope: string) =>
  createApiClient({ baseUrl: "", auth, ErrorClass: ApiClientError, cacheScope });

const loginRequest = (auth: AuthAdapter) =>
  clientWith(auth).request("/api/v1/auth/phone-login", { method: "POST", body: "{}" });

describe("createApiClient 401 handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A failed login is an unauthenticated 401: the server rejected the credentials
  // in the body. Treating it as an expired session used to log out + hard-redirect,
  // which wiped the server's message before the login form could render it.
  it("unauthenticated 401 surfaces the server message and leaves the session alone", async () => {
    const spy = makeAdapter({ token: null });
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(401, WRONG_PASSWORD)
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loginRequest(spy.adapter)).rejects.toMatchObject({
      message: "手机号或密码错误",
      status: 401,
      code: "HTTP_401",
    });

    expect(spy.refreshCalls).toBe(0);
    expect(spy.sessionExpiredCalls).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sentHeaders = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(sentHeaders.has("Authorization")).toBe(false);
  });

  it("authenticated 401 still refreshes, then expires the session when refresh fails", async () => {
    const spy = makeAdapter({ token: liveToken(), refreshSucceeds: false });
    const fetchMock = vi.fn(async () =>
      jsonResponse(401, { code: "HTTP_401", message: "令牌无效" })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loginRequest(spy.adapter)).rejects.toMatchObject({
      message: "登录已过期，请重新登录",
      status: 401,
    });

    expect(spy.refreshCalls).toBe(1);
    expect(spy.sessionExpiredCalls).toBe(1);
  });

  it("refresh 暂时不可用时不清会话（A03/FE-07）", async () => {
    // 断网 / 超时 / 5xx 都不是「凭据失效」。旧实现在这里直接 onSessionExpired()，
    // 用户只是网络抖一下就被踢回登录页。
    const spy = makeAdapter({ token: liveToken(), refreshUnavailable: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(401, { code: "HTTP_401", message: "令牌过期" }))
    );

    await expect(loginRequest(spy.adapter)).rejects.toMatchObject({ status: 0 });
    expect(spy.sessionExpiredCalls).toBe(0);
  });

  it("authenticated 401 retries with the refreshed token and returns the body", async () => {
    const rotated = makeToken({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 7200 });
    const spy = makeAdapter({ token: liveToken(), refreshSucceeds: true, refreshedToken: rotated });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: "HTTP_401", message: "令牌过期" }))
      .mockResolvedValueOnce(jsonResponse(200, { token: "new", refresh_token: "new-r" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loginRequest(spy.adapter)).resolves.toEqual({
      token: "new",
      refresh_token: "new-r",
    });

    expect(spy.refreshCalls).toBe(1);
    expect(spy.sessionExpiredCalls).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryHeaders = fetchMock.mock.calls[1][1]?.headers as Headers;
    expect(retryHeaders.get("Authorization")).toBe(`Bearer ${rotated}`);
  });

  it("expired token that cannot be refreshed fails before sending the request", async () => {
    const spy = makeAdapter({ token: expiredToken(), refreshSucceeds: false });
    const fetchMock = vi.fn(async () => jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loginRequest(spy.adapter)).rejects.toMatchObject({
      message: "登录已过期，请重新登录",
      status: 401,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * The GET cache and the in-flight dedupe live at module level, but the user
 * client (`lib/api.ts`) and the admin client (`lib/adminApi.ts`) are two
 * sessions with two different tokens. Before the cache key carried an
 * identity, the admin shell's `/api/v1/users/me` could hit the *user* session's
 * cached payload (never checking the admin token) and bounce a real admin out
 * of `/admin`; and two clients hitting the same URL concurrently shared one
 * in-flight promise, sending only the first caller's Authorization header.
 */
describe("createApiClient GET cache isolation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearApiCache();
  });

  it("两个 client 不共用同一份 TTL 缓存", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { who: "user" }))
      .mockResolvedValueOnce(jsonResponse(200, { who: "admin" }));
    vi.stubGlobal("fetch", fetchMock);

    const user = scopedClientWith(makeAdapter({ token: liveToken() }).adapter, "user");
    const admin = scopedClientWith(makeAdapter({ token: liveToken() }).adapter, "admin");

    expect(await user.request("/api/v1/users/me", { cacheTtlMs: 30_000 })).toEqual({ who: "user" });
    expect(await admin.request("/api/v1/users/me", { cacheTtlMs: 30_000 })).toEqual({
      who: "admin",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("同一个 client 内仍然命中缓存（既有行为不被破坏）", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = scopedClientWith(makeAdapter({ token: liveToken() }).adapter, "user");
    await client.request("/api/v1/users/me", { cacheTtlMs: 30_000 });
    await client.request("/api/v1/users/me", { cacheTtlMs: 30_000 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("同一个 client 换人登录后不会读到上一个人的缓存", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { who: "u1" }))
      .mockResolvedValueOnce(jsonResponse(200, { who: "u2" }));
    vi.stubGlobal("fetch", fetchMock);

    let token = liveToken();
    const client = createApiClient({
      baseUrl: "",
      auth: {
        getToken: () => token,
        refreshToken: async () => "expired",
        onSessionExpired: () => {},
      },
      ErrorClass: ApiClientError,
    });

    expect(await client.request("/api/v1/users/me", { cacheTtlMs: 30_000 })).toEqual({ who: "u1" });
    token = makeToken({ sub: "u2", exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(await client.request("/api/v1/users/me", { cacheTtlMs: 30_000 })).toEqual({ who: "u2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("两个 client 的并发 GET 不共用 in-flight promise（各带各的 token）", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { ok: true })
    );
    vi.stubGlobal("fetch", fetchMock);

    const userToken = liveToken();
    const adminToken = makeToken({ sub: "admin", exp: Math.floor(Date.now() / 1000) + 3600 });
    const user = scopedClientWith(makeAdapter({ token: userToken }).adapter, "user");
    const admin = scopedClientWith(makeAdapter({ token: adminToken }).adapter, "admin");

    await Promise.all([user.request("/api/v1/users/me"), admin.request("/api/v1/users/me")]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sent = fetchMock.mock.calls.map((call) =>
      (call[1]?.headers as Headers).get("Authorization")
    );
    expect(sent.sort()).toEqual([`Bearer ${adminToken}`, `Bearer ${userToken}`].sort());
  });

  it("clearApiCache(prefix) 仍按 URL 匹配", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = scopedClientWith(makeAdapter({ token: liveToken() }).adapter, "user");
    await client.request("/api/v1/users/me", { cacheTtlMs: 30_000 });
    clearApiCache("/api/v1/users/me");
    await client.request("/api/v1/users/me", { cacheTtlMs: 30_000 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
