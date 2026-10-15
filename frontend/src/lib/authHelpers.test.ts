import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_SESSION_KEYS,
  AUTH_COOKIE_NAME,
  USER_SESSION_KEYS,
  clearSession,
  hasAuthCookieMirror,
  postAuthRedirect,
  remirrorSessionCookie,
  setSession,
} from "@/lib/authHelpers";

/** 把 document.cookie 的读取值钉死为给定字符串（node 环境下没有 document）。 */
function stubCookie(raw: string): void {
  vi.stubGlobal("document", {
    get cookie() {
      return raw;
    },
  });
}

/** 内存版 localStorage（node 环境下没有它）。 */
class FakeStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  has(k: string): boolean {
    return this.map.has(k);
  }
}

/** 装一套浏览器环境，返回内存 localStorage 与「写过的 cookie 串」数组。 */
function stubBrowser(): { store: FakeStorage; cookieWrites: string[] } {
  const store = new FakeStorage();
  const cookieWrites: string[] = [];
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", store);
  vi.stubGlobal("document", {
    get cookie() {
      return "";
    },
    set cookie(v: string) {
      cookieWrites.push(v);
    },
  });
  return { store, cookieWrites };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hasAuthCookieMirror", () => {
  it("没有 document（SSR / node）时判为缺失", () => {
    expect(typeof document).toBe("undefined");
    expect(hasAuthCookieMirror(AUTH_COOKIE_NAME)).toBe(false);
  });

  it("cookie 为空串时判为缺失", () => {
    stubCookie("");
    expect(hasAuthCookieMirror(AUTH_COOKIE_NAME)).toBe(false);
  });

  it("镜像存在且非空时命中", () => {
    stubCookie("seeword_token=abc.def.ghi");
    expect(hasAuthCookieMirror(AUTH_COOKIE_NAME)).toBe(true);
  });

  it("镜像值为空时判为缺失", () => {
    // 回归钉子：proxy.ts 的 `if (!token)` 把 "" 判为假并 307 弹回，所以这里
    // 也必须判缺失。若返回 true，hook 就会「不置卡 + 照常跳转」→ 被弹回 →
    // spinner 钉死 —— 恰好复现本函数要修的那个 bug。
    stubCookie("seeword_token=");
    expect(hasAuthCookieMirror(AUTH_COOKIE_NAME)).toBe(false);
  });

  it("管理端同名后缀 cookie 不误命中", () => {
    stubCookie("seeword_admin_token=abc");
    expect(hasAuthCookieMirror(AUTH_COOKIE_NAME)).toBe(false);
  });

  it("名字出现在分段中间不算命中", () => {
    stubCookie("xseeword_token=abc");
    expect(hasAuthCookieMirror(AUTH_COOKIE_NAME)).toBe(false);
  });

  it("多个 cookie 中命中其中一个", () => {
    stubCookie("theme=dark; seeword_token=abc; other=1");
    expect(hasAuthCookieMirror(AUTH_COOKIE_NAME)).toBe(true);
  });

  it("分号后无空格的紧凑写法也能命中", () => {
    stubCookie("theme=dark;seeword_token=abc");
    expect(hasAuthCookieMirror(AUTH_COOKIE_NAME)).toBe(true);
  });

  it("没有等号的裸名字判为缺失", () => {
    stubCookie("seeword_token");
    expect(hasAuthCookieMirror(AUTH_COOKIE_NAME)).toBe(false);
  });

  it("值里含等号（base64 padding 等）仍算命中", () => {
    stubCookie("seeword_token=abc=def");
    expect(hasAuthCookieMirror(AUTH_COOKIE_NAME)).toBe(true);
  });
});

describe("postAuthRedirect", () => {
  it("新号先去设置密码，再进引导（忽略 next）", () => {
    // 回归钉子：注册页曾经把 `is_new_user` 与 `!onboarding_completed` 用 `||` 混在
    // 一起，导致两类账号都进 /set-password；新号必须忽略 next 走引导。
    expect(
      postAuthRedirect(
        { is_new_user: true, user: { onboarding_completed: false } },
        "/watch/9",
        "register"
      )
    ).toBe("/set-password?from=register&next=%2Fonboarding");
  });

  it("新号的来源入口写进 from（登录页验证码模式建号 → from=login）", () => {
    expect(
      postAuthRedirect({ is_new_user: true, user: { onboarding_completed: false } }, "/", "login")
    ).toBe("/set-password?from=login&next=%2Fonboarding");
  });

  it("老号未完成引导 → 直接进引导，不进设置密码页", () => {
    // 老号可能已有密码，而 /set-password 只发 new_password，后端会 400
    // （Current password is incorrect）。它只该走引导。
    expect(
      postAuthRedirect(
        { is_new_user: false, user: { onboarding_completed: false } },
        "/watch/9",
        "register"
      )
    ).toBe("/onboarding");
  });

  it("老号已完成引导 → 回 next", () => {
    expect(
      postAuthRedirect(
        { is_new_user: false, user: { onboarding_completed: true } },
        "/watch/9",
        "login"
      )
    ).toBe("/watch/9");
  });

  it("新号的 next 参数被整体编码（不能把裸斜杠带进查询串）", () => {
    const url = postAuthRedirect(
      { is_new_user: true, user: { onboarding_completed: false } },
      "/",
      "register"
    );
    expect(url).toContain("next=%2Fonboarding");
    expect(url).not.toContain("next=/onboarding");
  });
});

describe("会话写入的三个入口（批 7 的原子对）", () => {
  // 「已登录」有两个家：localStorage（真身）与镜像 cookie（登录墙只查它的存在性）。
  // 分开写就会造出「看着已登录、每个请求 401」的错位状态——这些用例钉住的是
  // 「两个家要么一起动，要么都不动」。

  it("setSession 同时写两个家", () => {
    const { store, cookieWrites } = stubBrowser();

    setSession(USER_SESSION_KEYS, "tok", "refresh");

    expect(store.getItem(USER_SESSION_KEYS.token)).toBe("tok");
    expect(store.getItem(USER_SESSION_KEYS.refreshToken)).toBe("refresh");
    expect(cookieWrites).toHaveLength(1);
    expect(cookieWrites[0]).toContain(`${AUTH_COOKIE_NAME}=tok`);
  });

  it("setSession 不带 refresh token 时清掉旧的 refresh 键，cookie 仍然写", () => {
    const { store, cookieWrites } = stubBrowser();
    store.setItem(USER_SESSION_KEYS.refreshToken, "stale");

    setSession(USER_SESSION_KEYS, "tok", null);

    expect(store.has(USER_SESSION_KEYS.refreshToken)).toBe(false);
    expect(store.getItem(USER_SESSION_KEYS.token)).toBe("tok");
    expect(cookieWrites[0]).toContain(`${AUTH_COOKIE_NAME}=tok`);
  });

  it("clearSession 两个家一起清", () => {
    const { store, cookieWrites } = stubBrowser();
    setSession(USER_SESSION_KEYS, "tok", "refresh");
    cookieWrites.length = 0;

    clearSession(USER_SESSION_KEYS);

    expect(store.has(USER_SESSION_KEYS.token)).toBe(false);
    expect(store.has(USER_SESSION_KEYS.refreshToken)).toBe(false);
    // 删 cookie 的写法是 max-age=0（不是写空值后再靠浏览器）。
    expect(cookieWrites).toEqual([`${AUTH_COOKIE_NAME}=; path=/; max-age=0`]);
  });

  it("clearSession 顺带扫掉没有 access token 的孤儿 refresh token", () => {
    const { store } = stubBrowser();
    store.setItem(USER_SESSION_KEYS.refreshToken, "orphan");

    clearSession(USER_SESSION_KEYS);

    expect(store.has(USER_SESSION_KEYS.refreshToken)).toBe(false);
  });

  it("remirrorSessionCookie 只补 cookie，不碰 localStorage", () => {
    // 这就是它单独存在（而不是复用 setSession）的理由：调用方手上只有 access
    // token，走 setSession 会因为 refreshToken=undefined 顺手删掉真的 refresh token。
    const { store, cookieWrites } = stubBrowser();
    store.setItem(USER_SESSION_KEYS.refreshToken, "keep-me");

    remirrorSessionCookie(USER_SESSION_KEYS, "tok");

    expect(store.getItem(USER_SESSION_KEYS.refreshToken)).toBe("keep-me");
    expect(cookieWrites[0]).toContain(`${AUTH_COOKIE_NAME}=tok`);
  });

  it("管理端写自己那套 key，不与用户端串台", () => {
    const { store, cookieWrites } = stubBrowser();

    setSession(ADMIN_SESSION_KEYS, "admin-tok", null);

    expect(store.getItem(ADMIN_SESSION_KEYS.token)).toBe("admin-tok");
    expect(store.has(USER_SESSION_KEYS.token)).toBe(false);
    expect(cookieWrites[0]).toContain("seeword_admin_token=admin-tok");
  });

  it("SSR（没有 window）时是空操作且不抛错", () => {
    expect(() => setSession(USER_SESSION_KEYS, "tok", "refresh")).not.toThrow();
    expect(() => clearSession(USER_SESSION_KEYS)).not.toThrow();
    expect(() => remirrorSessionCookie(USER_SESSION_KEYS, "tok")).not.toThrow();
  });
});
