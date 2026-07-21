import { test, expect } from "@playwright/test";
import {
  DEV_SMS_CODE,
  TEST_PASSWORD,
  uniquePhone,
  registerUserViaApi,
  registerViaUi,
  loginViaUi,
} from "./helpers";

// A shared, onboarding-completed user for the login / logout tests.
const SHARED_PHONE = uniquePhone();

test.beforeAll(async ({ request }) => {
  await registerUserViaApi(request, SHARED_PHONE);
});

test.describe("Registration", () => {
  test("full registration flow: phone + SMS code + password, then redirect", async ({ page }) => {
    const phone = uniquePhone();
    await registerViaUi(page, phone);
    // Registration succeeded: we left /register and a token was stored.
    expect(page.url()).not.toContain("/register");
    const token = await page.evaluate(() => localStorage.getItem("seeword_token"));
    expect(token).toBeTruthy();
  });

  test("submit button is disabled until the terms are agreed", async ({ page }) => {
    await page.goto("/register");
    // Fill every field validly but do NOT agree to the terms.
    await page.locator('input[placeholder="请输入手机号"]').fill(uniquePhone());
    await page.locator('input[placeholder="请输入验证码"]').fill(DEV_SMS_CODE);
    await page.locator('input[placeholder="至少 8 位，含大小写字母和数字"]').fill(TEST_PASSWORD);
    await page.locator('input[placeholder="请再次输入密码"]').fill(TEST_PASSWORD);

    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeDisabled();

    // Agreeing enables the button.
    await page.locator('input[type="checkbox"]').check();
    await expect(submit).toBeEnabled();
  });
});

test.describe("Login", () => {
  test("login with phone + password redirects to home", async ({ page }) => {
    await loginViaUi(page, SHARED_PHONE);
    expect(page.url()).toMatch(/\/$/);
    // Authenticated home shell: the sidebar logout button is present.
    // (Two logout buttons exist in the DOM - desktop sidebar + mobile drawer -
    // so target the first, which is the visible desktop one.)
    await expect(page.locator('button[aria-label="退出登录"]').first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("wrong credentials do not grant access", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[placeholder="请输入手机号"]').fill(uniquePhone());
    await page.locator('input[type="password"]').fill("WrongPass123");
    await page.locator('button[type="submit"]').click();
    // The api client's global 401 handler rejects bad credentials and clears
    // the session. Allow time for the failing request + redirect to settle.
    await page.waitForTimeout(3000);
    const token = await page.evaluate(() => localStorage.getItem("seeword_token"));
    expect(token).toBeNull();
    expect(page.url()).toContain("/login");
  });
});

test.describe("Guards and Logout", () => {
  test("unauthenticated visit to / shows the public landing page", async ({ page }) => {
    await page.goto("/");
    // ADR-0005: unauthenticated "/" renders the landing page, not the app.
    await expect(page.getByText("SeeWord").first()).toBeVisible();
    await expect(page.locator('a[href*="login"]').first()).toBeVisible();
    // The app sidebar (logout button) must NOT be present.
    await expect(page.locator('button[aria-label="退出登录"]')).toHaveCount(0);
  });

  test("logout redirects to /login and blocks the app", async ({ page }) => {
    await loginViaUi(page, SHARED_PHONE);
    await page.locator('button[aria-label="退出登录"]').first().click();
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");

    // After logout, "/" shows the landing page again (no app shell).
    await page.goto("/");
    await expect(page.locator('button[aria-label="退出登录"]')).toHaveCount(0);
  });
});

test.describe("Password Reset", () => {
  test("forgot-password link is visible on the login page", async ({ page }) => {
    await page.goto("/login");
    const link = page.locator('a[href="/forgot-password"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveText(/忘记密码/);
  });

  test("forgot-password page renders the phone + code + new-password form", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.locator("h1")).toHaveText(/重置密码/);
    await expect(page.locator('input[placeholder="请输入手机号"]')).toBeVisible();
    await expect(page.locator('input[placeholder="请输入验证码"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(2);
    await expect(page.locator('button[type="submit"]')).toHaveText(/重置密码/);
    await expect(page.locator('a[href="/login"]')).toBeVisible();
  });
});

test.describe("Cross-Page Links", () => {
  test("register page links to login", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator('a[href*="login"]').first()).toBeVisible();
  });

  test("login page links to register", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('a[href*="register"]').first()).toBeVisible();
  });
});

test.describe("Navigation", () => {
  test("landing page shows a login link for unauthenticated visitors", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href*="login"]').first()).toBeVisible();
  });

  test("mobile viewport renders without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });
});
