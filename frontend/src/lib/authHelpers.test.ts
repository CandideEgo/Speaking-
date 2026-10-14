import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTH_COOKIE_NAME, hasAuthCookieMirror, postAuthRedirect } from "@/lib/authHelpers";

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
