import { test, expect, type Page } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaUi } from "./helpers";

/**
 * Playwright Screenshot Matrix.
 *
 * Captures full-page screenshots for the core routes × light/dark ×
 * desktop/mobile. Screenshots are saved to test-results/screenshots/ for
 * manual review.
 *
 * Usage:
 *   npx playwright test e2e/screenshot-matrix.spec.ts --project=chromium
 *   npx playwright test e2e/screenshot-matrix.spec.ts --project=mobile-chrome
 */

// Shared authenticated user for protected routes.
let DYNAMIC_PHONE: string;
let DYNAMIC_PASSWORD: string;

test.beforeAll(async ({ request }) => {
  // Create a unique user for screenshot tests (avoids hardcoded credentials)
  const phone = uniquePhone();
  const password = "TestPass123";
  await registerUserViaApi(request, phone, password);
  DYNAMIC_PHONE = phone;
  DYNAMIC_PASSWORD = password;
});

// ── Theme helpers ──────────────────────────────────────────────────────────

async function setLightMode(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: "light" });
  // Force the app's theme by removing .dark and setting light.
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
    localStorage.setItem("theme", "light");
  });
}

async function setDarkMode(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.classList.remove("light");
    localStorage.setItem("theme", "dark");
  });
}

async function captureScreenshot(page: Page, name: string): Promise<void> {
  // Wait for fonts + layout to settle.
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `test-results/screenshots/${name}.png`,
    fullPage: true,
  });
}

// ── Route definitions ─────────────────────────────────────────────────────

interface RouteDef {
  name: string;
  path: string;
  auth?: boolean; // requires login
  skipIfNoVideo?: boolean; // skip if no video in DB
}

const ROUTES: RouteDef[] = [
  { name: "home", path: "/" },
  { name: "login", path: "/login" },
  { name: "register", path: "/register" },
  { name: "redeem", path: "/redeem", auth: true },
  { name: "browse", path: "/browse" },
  { name: "vocabulary", path: "/vocabulary", auth: true },
  { name: "vocabulary-drill", path: "/vocabulary/drill", auth: true },
  { name: "practice", path: "/practice", auth: true },
  { name: "practice-exam", path: "/practice/exam?level=cet4", auth: true },
  { name: "history", path: "/history", auth: true },
  { name: "admin", path: "/admin", auth: true },
  { name: "forgot-password", path: "/forgot-password" },
  { name: "onboarding", path: "/onboarding", auth: true },
  { name: "profile", path: "/profile", auth: true },
];

// ── Screenshot matrix tests ────────────────────────────────────────────────

for (const route of ROUTES) {
  test.describe(`Screenshot: ${route.name}`, () => {
    test("light mode desktop", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      if (route.auth) {
        await loginViaUi(page, DYNAMIC_PHONE, DYNAMIC_PASSWORD);
      }
      await page.goto(route.path);
      await setLightMode(page);
      // Wait for the page to be visually stable.
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
      await captureScreenshot(page, `${route.name}-light-desktop`);
    });

    test("dark mode desktop", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      if (route.auth) {
        await loginViaUi(page, DYNAMIC_PHONE, DYNAMIC_PASSWORD);
      }
      await page.goto(route.path);
      await setDarkMode(page);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
      await captureScreenshot(page, `${route.name}-dark-desktop`);
    });

    test("light mode mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      if (route.auth) {
        await loginViaUi(page, DYNAMIC_PHONE, DYNAMIC_PASSWORD);
      }
      await page.goto(route.path);
      await setLightMode(page);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
      await captureScreenshot(page, `${route.name}-light-mobile`);
    });

    test("dark mode mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      if (route.auth) {
        await loginViaUi(page, DYNAMIC_PHONE, DYNAMIC_PASSWORD);
      }
      await page.goto(route.path);
      await setDarkMode(page);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
      await captureScreenshot(page, `${route.name}-dark-mobile`);
    });
  });
}
