import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError, createApiClient, type AuthAdapter } from "@/lib/createApiClient";

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
  refreshThrows?: boolean;
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
        if (opts.refreshThrows) throw new Error("refresh blew up");
        if (!opts.refreshSucceeds) return false;
        token = opts.refreshedToken ?? token;
        return true;
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
