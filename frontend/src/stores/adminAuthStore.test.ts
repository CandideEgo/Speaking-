import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAdminAuthStore } from "@/stores/adminAuthStore";

/** Build a non-cryptographic three-part JWT string with the given payload. */
function makeToken(payload: Record<string, unknown>): string {
  const enc = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc(payload)}.sig`;
}

const nowSec = () => Math.floor(Date.now() / 1000);

describe("useAdminAuthStore.bootstrap", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
      clear: () => storage.clear(),
      key: () => null,
      get length() {
        return storage.size;
      },
    });
    vi.stubGlobal("window", { location: { href: "" } });

    useAdminAuthStore.setState({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps isLoading true while an expired token refreshes (no premature login bounce)", async () => {
    const expired = makeToken({ sub: "admin-1", exp: nowSec() - 60 });
    storage.set("seeword_admin_token", expired);
    storage.set("seeword_admin_refresh_token", makeToken({ sub: "admin-1", exp: nowSec() + 3600 }));

    let resolveRefresh!: (value: Response) => void;
    const pendingRefresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pendingRefresh)
    );

    const boot = useAdminAuthStore.getState().bootstrap();

    // The fix under test: while the refresh is in flight the store must stay
    // "loading" (not isAuthenticated=false), so the shell guard does not
    // bounce an expired-but-refreshable session to /admin/login.
    expect(useAdminAuthStore.getState().isLoading).toBe(true);
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(false);

    const fresh = makeToken({ sub: "admin-1", exp: nowSec() + 3600 });
    resolveRefresh(
      new Response(JSON.stringify({ token: fresh, refresh_token: "fresh-refresh" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await boot;
    expect(useAdminAuthStore.getState().isLoading).toBe(false);
    expect(useAdminAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAdminAuthStore.getState().token).toBe(fresh);
  });
});
