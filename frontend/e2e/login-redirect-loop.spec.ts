import { test, expect } from "@playwright/test";

/**
 * 登录墙 cookie 镜像回归（用户报告：登录页白屏，只剩一个永不结束的"假"加载动画）。
 *
 * 触发链：localStorage 里有未过期 token（isAuthenticated=true），但 middleware
 * 依赖的镜像 cookie 缺失（浏览器拦截了 cookie 写入）→ `proxy.ts` 的门控谓词
 * 「cookie 存在且非空」不成立 → 任何跳转都被 307 弹回 /login，spinner 永不消失。
 *
 * 判定口径是**同步读 document.cookie**（与 middleware 同谓词），不是计时 ——
 * 计时会把「弱网下的慢导航」误判为滞留，见本文件第二个用例。
 *
 * 两个用例都不依赖真实账号 / WS_TEST_PHONE，CI 可跑。
 */

/** Build a non-cryptographic three-part JWT string with the given payload. */
function makeToken(payload: Record<string, unknown>): string {
  const enc = (o: Record<string, unknown>) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc(payload)}.fakesig`;
}

/** RSC 软导航到 `/` 的请求（Next 的导航请求带 `RSC: 1` 头）。 */
function isRscNavToHome(req: { url(): string; headers(): Record<string, string> }): boolean {
  return new URL(req.url()).pathname === "/" && req.headers()["rsc"] === "1";
}

test.describe("login wall cookie mirror (stuck spinner regression)", () => {
  test("镜像缺失 → 渲染恢复卡，且不再发出注定被弹回的跳转", async ({ page }) => {
    await page.addInitScript(() => {
      // 模拟「浏览器/隐私模式拒绝 cookie 写入」：syncAuthCookie 变成空操作，
      // middleware 永远看不到镜像。
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

    const doomedNavs: string[] = [];
    page.on("request", (req) => {
      if (isRscNavToHome(req)) doomedNavs.push(req.url());
    });

    await page.goto("/login?next=%2F");

    // 同步判定 → 恢复卡立即出现，无需等任何计时器。
    await expect(page.getByRole("heading", { name: "无法进入应用" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "重试进入" })).toBeVisible();
    await expect(page.getByRole("button", { name: "重新登录" })).toBeVisible();

    // 非空洞前提：登录墙当下确实会拦下没有 cookie 的请求。缺了这条，
    // middleware 坏掉 / `/` 变成公开路径时本用例会假通过。
    // maxRedirects: 0 —— 否则 Playwright 会跟到 /login，看不到 307 本身。
    const probe = await page.context().request.get("/", { maxRedirects: 0 });
    expect(probe.status()).toBe(307);
    expect(probe.headers()["location"]).toContain("/login");

    // 区分力所在：既然同步已知必被弹回，就不该再发跳转。旧实现至少发 1 次，
    // 新实现发 0 次 —— 两侧结果不同才叫回归测试。
    await page.waitForTimeout(1000);
    expect(doomedNavs).toEqual([]);
    expect(new URL(page.url()).pathname).toBe("/login");

    // 重新登录清掉本地 token，落回可用的登录表单。
    await page.getByRole("button", { name: "重新登录" }).click();
    await expect(page.locator('input[placeholder="请输入手机号"]')).toBeVisible({
      timeout: 15_000,
    });
  });

  test("镜像存在 + 导航慢 → spinner 持续，不出恢复卡", async ({ page }) => {
    test.setTimeout(120_000);

    // 挂起发往 `/` 的 RSC 导航，确定性复现「导航长时间不落地」窗口。
    let releaseNav = () => {};
    const navGate = new Promise<void>((resolve) => (releaseNav = resolve));
    await page.route("**/*", async (route) => {
      try {
        if (isRscNavToHome(route.request())) await navGate;
        await route.continue();
      } catch {
        // route aborted by context close — fine
      }
    });

    const rscToHome: string[] = [];
    page.on("request", (req) => {
      if (isRscNavToHome(req)) rscToHome.push(req.url());
    });

    try {
      const token = makeToken({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 });
      await page.goto("/login");
      await page.evaluate((t) => localStorage.setItem("seeword_token", t), token);
      await page.goto("/login?next=%2F");

      // 本用例不屏蔽 cookie 写入 → initialize() 会把镜像补上
      // （stores/authStore.ts:266），所以 hook 判定「不滞留」并照常发起跳转，
      // 只是这次跳转被 navGate 挂住。
      const spinner = page.locator("[class*='animate-spin']").first();
      await expect(spinner).toBeAttached({ timeout: 20_000 });

      // 尺寸 class 丢失时元素塌缩成 ~4×4 的边框残点，toBeVisible 仍算"可见"，
      // 所以必须断言有效尺寸（md 应为 32×32）。
      const box = await spinner.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);

      // 证明 hook 确实走到了「镜像存在 → 发起跳转」这一支，而不是还没跑。
      expect(rscToHome.length).toBeGreaterThanOrEqual(1);

      // 慢 ≠ 滞留：恢复卡在导航落地前都不得出现。
      //
      // 等待时长必须**超过任何「按时间判定」的实现可能用的阈值**（被替换掉的
      // 看门狗是 3s），否则本用例对回归没有区分力 —— 旧实现在此窗口内同样不
      // 会出卡，测试会假通过。
      const card = page.getByRole("heading", { name: "无法进入应用" });
      await expect(card).toHaveCount(0);
      await page.waitForTimeout(4500);
      await expect(card).toHaveCount(0);
    } finally {
      releaseNav();
    }
  });
});
