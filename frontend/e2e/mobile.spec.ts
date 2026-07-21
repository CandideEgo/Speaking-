import { test, expect } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaUi } from "./helpers";

// Mobile viewport for the whole file.
test.use({ viewport: { width: 375, height: 812 } });

// A shared, onboarding-completed user for the authenticated sidebar tests.
const MOBILE_PHONE = uniquePhone();

test.beforeAll(async ({ request }) => {
  await registerUserViaApi(request, MOBILE_PHONE);
});

test.describe("Mobile - Landing Page", () => {
  test("renders without horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    // Allow a small tolerance for sub-pixel rounding.
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test("brand and mobile menu button are visible", async ({ page }) => {
    await page.goto("/");
    // On mobile the login CTA lives inside the hamburger menu, so the
    // hamburger trigger (not the desktop login link) is the visible affordance.
    await expect(page.getByText("SeeWord").first()).toBeVisible();
    await expect(page.locator('button[aria-label="菜单"]')).toBeVisible();
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
  test("redeem page is gated for unauthenticated visitors (landing shown)", async ({ page }) => {
    await page.goto("/redeem");
    // (main) routes render the public landing for unauthenticated visitors.
    await expect(page.getByText("SeeWord").first()).toBeVisible();
  });
});

test.describe("Mobile - Sidebar (authenticated)", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page, MOBILE_PHONE);
  });

  test("hamburger menu opens the sidebar drawer", async ({ page }) => {
    await page.locator('button[aria-label="打开菜单"]').first().click();
    // The drawer's close button only exists in the mobile overlay, so its
    // visibility confirms the drawer opened.
    const closeBtn = page.locator('button[aria-label="关闭侧边栏"]');
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    // A nav link is reachable inside the drawer (the last match - the desktop
    // sidebar's copy is display:none on mobile).
    await expect(page.locator('a[href="/browse"]').last()).toBeVisible({ timeout: 5000 });
  });

  test("sidebar closes via the backdrop close button", async ({ page }) => {
    await page.locator('button[aria-label="打开菜单"]').first().click();
    const closeBtn = page.locator('button[aria-label="关闭侧边栏"]');
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    await closeBtn.click();
    await expect(closeBtn).toBeHidden({ timeout: 5000 });
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
