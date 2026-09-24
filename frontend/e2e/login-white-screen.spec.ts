import { test, expect } from "@playwright/test";
import { TEST_PASSWORD } from "./helpers";

/**
 * 登录白屏回归（用户报告：登录后白屏，必须手动刷新）。
 *
 * 登录成功 → authStore.isAuthenticated 变 true → 登录页渲染 FullPageSpinner，
 * 同时 router.replace(next) 发起 RSC 软导航。在弱网 / 部署后旧 chunk 等场景下
 * 导航可能长时间不落地，这段窗口内用户唯一能看到的过渡反馈就是 FullPageSpinner。
 *
 * 回归点：Spinner.tsx 曾把尺寸写成裸数字（`8 8` 而非 `h-8 w-8`），转圈 0×0
 * 不可见，整屏只剩浅色 bg-canvas —— 看起来就是白屏。
 *
 * 做法：用路由拦截把登录后的 RSC 导航请求"挂起"，确定性复现"导航不落地"窗口，
 * 断言该窗口内 spinner 可见（非零尺寸）；随后放行导航，断言首页正常渲染。
 */
const PHONE = process.env.WS_TEST_PHONE ?? "";

test.describe("login transition (white screen regression)", () => {
  test.skip(!PHONE, "requires WS_TEST_PHONE env var");

  test("spinner stays visible while post-login navigation is in flight", async ({ page }) => {
    test.setTimeout(120_000);

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    // 挂起登录后的 RSC 文档请求（Next 导航请求带 RSC: 1 头），模拟导航长时间不落地。
    let releaseNav = () => {};
    const navGate = new Promise<void>((resolve) => (releaseNav = resolve));
    await page.route("**/*", async (route) => {
      try {
        const url = new URL(route.request().url());
        if (url.pathname === "/" && route.request().headers()["rsc"] === "1") {
          await navGate;
        }
        await route.continue();
      } catch {
        // route aborted by context close — fine
      }
    });

    try {
      await page.goto("/login");
      await page.locator('input[placeholder="请输入手机号"]').fill(PHONE);
      await page.locator('input[type="password"]').fill(TEST_PASSWORD);
      await page.locator('button[type="submit"]').click();

      // 登录成功 → 进入过渡态（FullPageSpinner）。挂起的导航未落地期间，
      // 屏幕上必须存在"用户可感知"的加载反馈，而不是一块空白画布。
      // 注意：尺寸 class 丢失时元素塌缩成 ~4×4 的边框残点，Playwright 的
      // toBeVisible 仍算"可见"——必须断言有效尺寸（md 应为 32×32）。
      const spinner = page.locator("[class*='animate-spin']").first();
      await expect(spinner).toBeAttached({ timeout: 20_000 });
      const box = await spinner.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);

      // 放行导航 → 首页正常落地（greeting 标题出现）。
      releaseNav();
      await expect(page.getByRole("heading", { name: /早上好|下午好|晚上好|夜深了/ })).toBeVisible({
        timeout: 90_000,
      });

      // 整个流程没有未捕获的客户端错误（chunk 失败 / 渲染抛错都会被记录）。
      expect(pageErrors).toEqual([]);
    } finally {
      releaseNav();
    }
  });
});
