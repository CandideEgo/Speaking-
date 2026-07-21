import { test, expect } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaUi } from "./helpers";

// A shared, onboarding-completed user for the authenticated redeem tests.
const REDEEM_PHONE = uniquePhone();

test.beforeAll(async ({ request }) => {
  await registerUserViaApi(request, REDEEM_PHONE);
});

test.describe("Redeem - Unauthenticated", () => {
  test("shows the public landing page (redeem form is gated)", async ({ page }) => {
    await page.goto("/redeem");
    // (main) routes render the public landing for unauthenticated visitors
    // (ADR-0005), so the redeem form is not shown.
    await expect(page.getByText("SeeWord").first()).toBeVisible();
    await expect(page.locator('a[href*="login"]').first()).toBeVisible();
    await expect(page.locator('input[placeholder="XXXX-XXXX-XX"]')).toHaveCount(0);
  });
});

test.describe("Redeem - Authenticated", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page, REDEEM_PHONE);
  });

  test("form is visible when authenticated", async ({ page }) => {
    await page.goto("/redeem");
    await expect(page.locator("h1")).toHaveText(/兑换 Pro 会员/);
    await expect(page.locator('input[placeholder="XXXX-XXXX-XX"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("submit button is disabled until a code is entered", async ({ page }) => {
    await page.goto("/redeem");
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
  });

  test("invalid code shows an error message", async ({ page }) => {
    await page.goto("/redeem");
    await page.locator('input[placeholder="XXXX-XXXX-XX"]').fill("INVALID-1");
    await page.locator('button[type="submit"]').click();
    // Error renders in a red-tinted box (bg-red-soft / text-error).
    await expect(page.locator("[class*='bg-red-soft']")).toBeVisible({
      timeout: 10000,
    });
  });

  test("code input uppercases on input", async ({ page }) => {
    await page.goto("/redeem");
    const input = page.locator('input[placeholder="XXXX-XXXX-XX"]');
    await input.fill("abc123");
    await expect(input).toHaveValue("ABC123");
  });
});
