import { test, expect } from "@playwright/test";

/**
 * 登录墙死循环回归（用户报告：登录页白屏，只剩一个永不结束的"假"加载动画）。
 *
 * 触发链：localStorage 里有未过期 token（isAuthenticated=true），但 middleware
 * 依赖的镜像 cookie 缺失（浏览器拦截 cookie 写入 / cookie 被单独清除）→
 * 登录页 isAuthenticated 分支只渲染 FullPageSpinner，同时 useRedirectIfAuthenticated
 * 反复 router.replace(next) → middleware 查无 cookie → 302 弹回 /login?next=%2F
 * → 无限循环，URL 钉死在 /login?next=%2F，spinner 永不消失。
 *
 * 做法：addInitScript 把 document.cookie 写入变为 no-op，seed 一个语法合法、
 * 未过期的伪造 JWT，断言看门狗（~3s）触发后渲染恢复 UI，且导航循环停止。
 * 不依赖真实账号 / WS_TEST_PHONE，CI 可跑。
 */

/** Build a non-cryptographic three-part JWT string with the given payload. */
function makeToken(payload: Record<string, unknown>): string {
  const enc = (o: Record<string, unknown>) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc(payload)}.fakesig`;
}

test.describe("login redirect loop (stuck spinner regression)", () => {
  test("shows recovery UI instead of spinning forever when the cookie mirror is missing", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // Simulate a browser/privacy mode that refuses cookie writes, so
      // syncAuthCookie no-ops and the middleware never sees the mirror.
      Object.defineProperty(document, "cookie", {
        set() {},
        get() {
          return "";
        },
        configurable: true,
      });
    });
    const token = makeToken({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 });

    await page.goto("/login");
    await page.evaluate((t) => localStorage.setItem("seeword_token", t), token);

    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });

    await page.goto("/login?next=%2F");

    // Watchdog (~3s) must flip the page from the eternal spinner to recovery UI.
    await expect(page.getByRole("heading", { name: "无法进入应用" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "重新登录" })).toBeVisible();
    await expect(page.getByRole("button", { name: "重试进入" })).toBeVisible();

    // Once stuck, the hook must stop re-issuing the redirect — the bounce
    // loop dies down instead of churning forever.
    await page.waitForTimeout(3000);
    expect(navigations.length).toBeLessThan(25);

    // 重新登录 clears the stale local token and lands back on the login form.
    await page.getByRole("button", { name: "重新登录" }).click();
    await expect(page.locator('input[placeholder="请输入手机号"]')).toBeVisible({
      timeout: 15_000,
    });
  });
});
