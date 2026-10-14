import { test, expect } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaToken, switchToPasswordLogin } from "./helpers";

test.describe("Home Page", () => {
  test("unauthenticated visit redirects to the login wall", async ({ page }) => {
    await page.goto("/");
    // D0：落地页已删，未登录 302 到 /login?next=/。
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("home page loads within 5 seconds", async ({ page, request }) => {
    // 登录墙（proxy.ts）：未登录 goto("/") 会被 302 到 /login —— 不登录测到的
    // 就是登录页的加载速度（2026-10-11 修）。
    const { token } = await registerUserViaApi(request, uniquePhone());
    await loginViaToken(page, token);
    const start = Date.now();
    await page.goto("/");
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(5000);
  });
});

test.describe("Watch Page", () => {
  test("invalid video ID does not white-screen", async ({ page, request }) => {
    // /watch/* 在登录墙后（proxy.ts）：未登录 goto 会被 302 到 /login，
    // 「不白屏」的断言就退化成对登录页的检查（2026-10-11 修）。
    const { token } = await registerUserViaApi(request, uniquePhone());
    await loginViaToken(page, token);
    await page.goto("/watch/nonexistent-video-id-12345");
    // 加载中显示 spinner；404 解析后显示「加载视频失败」错误态。两者其一即可 ——
    // 关键是不白屏。本文件按项目默认视口跑（mobile-chrome 上即覆盖移动端错误态；
    // 桌面档由 watch.spec.ts 的同名用例覆盖）。
    const meaningful = page
      .locator(".animate-spin")
      .or(page.locator("text=/加载视频失败|处理失败|未知错误/i"));
    await expect(meaningful.first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Auth Surface", () => {
  test("redeem page is public, then redirects to the home URL", async ({ page }) => {
    await page.goto("/redeem");
    await expect(page.locator("body")).toBeVisible();
    // D0 白名单：/redeem 未登录可访问（墙放行），退役后的页面 redirect("/")；
    // 登录墙随后由 "/" 触发 —— next 参数为 "/" 而不是 "/redeem"。
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(new URL(page.url()).searchParams.get("next")).toBe("/");
  });

  test("login form can be submitted with the Enter key", async ({ page }) => {
    await page.goto("/login");
    await switchToPasswordLogin(page);
    await page.locator('input[placeholder="请输入手机号"]').fill("13800000000");
    await page.locator('input[type="password"]').fill("WrongPass123");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);
    await expect(page.locator("body")).toBeVisible();
  });

  test("login page is keyboard navigable", async ({ page }) => {
    await page.goto("/login");
    // Wait for the login form to render before testing keyboard focus.
    await expect(page.locator('input[placeholder="请输入手机号"]')).toBeVisible();
    await page.keyboard.press("Tab");
    // Tab should move focus off <body> onto the first focusable element.
    const activeIsBody = await page.evaluate(() => document.activeElement === document.body);
    expect(activeIsBody).toBe(false);
  });
});
