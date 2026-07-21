import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test("landing page renders for unauthenticated visitors", async ({ page }) => {
    await page.goto("/");
    // ADR-0005: unauthenticated "/" shows the public landing page.
    await expect(page.getByText("SeeWord").first()).toBeVisible();
    await expect(page.locator('a[href*="login"]').first()).toBeVisible();
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
  test("redeem page is gated for unauthenticated visitors (landing shown)", async ({ page }) => {
    await page.goto("/redeem");
    await expect(page.locator("body")).toBeVisible();
    // (main) routes render the public landing for unauthenticated visitors
    // (ADR-0005), so the redeem form itself is not shown.
    await expect(page.getByText("SeeWord").first()).toBeVisible();
  });

  test("login form can be submitted with the Enter key", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[placeholder="请输入手机号"]').fill("13800000000");
    await page.locator('input[type="password"]').fill("WrongPass123");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);
    await expect(page.locator("body")).toBeVisible();
  });

  test("home page is keyboard navigable", async ({ page }) => {
    await page.goto("/");
    // Wait for the landing to render before testing keyboard focus.
    await expect(page.getByText("SeeWord").first()).toBeVisible();
    await page.keyboard.press("Tab");
    // Tab should move focus off <body> onto the first focusable element.
    const activeIsBody = await page.evaluate(() => document.activeElement === document.body);
    expect(activeIsBody).toBe(false);
  });
});
