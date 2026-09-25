import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTH_COOKIE_NAME, hasAuthCookieMirror } from "@/lib/authHelpers";

/** 把 document.cookie 的读取值钉死为给定字符串（node 环境下没有 document）。 */
function stubCookie(raw: string): void {
  vi.stubGlobal("document", {
    get cookie() {
      return raw;
    },
  });
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
