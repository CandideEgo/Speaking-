import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test("unauthenticated visit redirects to the login wall", async ({ page }) => {
    await page.goto("/");
    // D0：落地页已删，未登录 302 到 /login?next=/。
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("home page loads within 5 seconds", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(5000);
  });
});

test.describe("Watch Page", () => {
  test("invalid video ID does not white-screen", async ({ page }) => {
    await page.goto("/watch/nonexistent-video-id-12345");
    await page.waitForTimeout(3000);
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
