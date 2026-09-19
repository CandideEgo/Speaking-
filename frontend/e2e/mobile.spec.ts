import { test, expect } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaUi } from "./helpers";

// Mobile viewport for the whole file.
test.use({ viewport: { width: 375, height: 812 } });

// A shared, onboarding-completed user for the authenticated navigation tests.
const MOBILE_PHONE = uniquePhone();

test.beforeAll(async ({ request }) => {
  await registerUserViaApi(request, MOBILE_PHONE);
});

test.describe("Mobile - Login Wall", () => {
  test("login page renders without horizontal overflow", async ({ page }) => {
    // D0 登录墙：未登录 / 302 到 /login。
    await page.goto("/");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await expect(page.locator("body")).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    // Allow a small tolerance for sub-pixel rounding.
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test("login form inputs are visible on mobile", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await expect(page.locator('input[placeholder="请输入手机号"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});

test.describe("Mobile - Login Form", () => {
  test("phone + password inputs and submit are visible and within viewport", async ({ page }) => {
    await page.goto("/login");
    const phone = page.locator('input[placeholder="请输入手机号"]');
    await expect(phone).toBeVisible();
    const box = await phone.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 10);
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("login form can be filled and submitted (no crash)", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[placeholder="请输入手机号"]').fill("13800000000");
    await page.locator('input[type="password"]').fill("WrongPass123");
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    await expect(page.locator("body")).toBeVisible();
  });

  test("register and forgot-password links are accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('a[href*="register"]').first()).toBeVisible();
    await expect(page.locator('a[href="/forgot-password"]')).toBeVisible();
  });
});

test.describe("Mobile - Redeem Page", () => {
  test("redeem page is public, then redirects to the home URL", async ({ page }) => {
    await page.goto("/redeem");
    // D0 白名单：/redeem 对未登录开放（墙放行），退役后的页面 redirect("/")；
    // 随后的登录墙是 "/" 触发的 —— next 参数为 "/" 而不是 "/redeem"。
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(new URL(page.url()).searchParams.get("next")).toBe("/");
  });
});

test.describe("Mobile - Navigation (authenticated)", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page, MOBILE_PHONE);
  });

  test("mobile tab bar navigates to browse", async ({ page }) => {
    // The bottom MobileTabBar is always visible on mobile (no GSAP drawer),
    // so it is the reliable mobile navigation surface.
    const browseTab = page.getByRole("link", { name: "浏览", exact: true });
    await expect(browseTab).toBeVisible({ timeout: 5000 });
    await browseTab.click();
    await page.waitForURL(/\/browse/, { timeout: 10000 });
    expect(page.url()).toContain("/browse");
  });
});
