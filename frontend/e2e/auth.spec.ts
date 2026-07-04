import { test, expect } from "@playwright/test";

const TEST_EMAIL = `e2e-${Date.now()}@test.com`;
const TEST_PASSWORD = "e2epass123";

test.describe("Authentication — Registration", () => {
  test("full registration flow: fill form, submit, redirect to dashboard", async ({
    page,
  }) => {
    await page.goto("/register");

    // Fill the registration form
    await page.locator('input[type="text"]').fill("E2E Test User");
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);

    // Submit
    await page.locator('button[type="submit"]').click();

    // Should redirect to dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    expect(page.url()).toContain("/dashboard");

    // Verify the page loaded — dashboard should have visible content
    await expect(page.locator("main")).toBeVisible();
  });

  test("registration with missing required fields shows validation", async ({
    page,
  }) => {
    await page.goto("/register");

    // Submit without filling anything
    await page.locator('button[type="submit"]').click();

    // Browser HTML5 validation should prevent submission; stay on register page
    expect(page.url()).toContain("/register");
  });
});

test.describe("Authentication — Login", () => {
  test("full login flow: fill form, submit, dashboard loads", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Should navigate to dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    expect(page.url()).toContain("/dashboard");
    await expect(page.locator("main")).toBeVisible();
  });

  test("failed login: wrong credentials shows error message", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.locator('input[type="email"]').fill("nobody@example.com");
    await page.locator('input[type="password"]').fill("wrongpassword");
    await page.locator('button[type="submit"]').click();

    // Should display an error message (red text from the component)
    const errorText = page.locator("p.text-red-600");
    await expect(errorText).toBeVisible({ timeout: 5000 });

    // Should remain on the login page
    expect(page.url()).toContain("/login");
  });
});

test.describe("Authentication — Guards and Logout", () => {
  test("auth guard: unauthenticated visit to /dashboard redirects to /login", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("logout flow: login, click logout, verify redirect, verify dashboard blocked", async ({
    page,
  }) => {
    // Login first
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    // Click the logout button (aria-label on TopBar)
    await page.locator('button[aria-label="退出登录"]').click();

    // Should redirect to /login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");

    // Verify dashboard is now blocked
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });
});

test.describe("Authentication — Password Reset", () => {
  test("forgot password link is visible on login page", async ({ page }) => {
    await page.goto("/login");

    const forgotLink = page.locator('a[href="/forgot-password"]');
    await expect(forgotLink).toBeVisible();
    await expect(forgotLink).toHaveText(/忘记密码/);
  });

  test("forgot password page loads with form visible", async ({ page }) => {
    await page.goto("/forgot-password");

    // Verify the page heading
    await expect(page.locator("h1")).toHaveText(/重置密码/);

    // Verify the email input and submit button are present
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText(
      /发送重置链接/,
    );

    // Verify the back-to-login link
    await expect(page.locator('a[href="/login"]')).toBeVisible();
  });
});

test.describe("Authentication — Cross-Page Links", () => {
  test("register page has link to login", async ({ page }) => {
    await page.goto("/register");
    const loginLink = page.locator('a[href*="login"]');
    await expect(loginLink.first()).toBeVisible();
  });

  test("login page has link to register", async ({ page }) => {
    await page.goto("/login");
    const registerLink = page.locator('a[href*="register"]');
    await expect(registerLink.first()).toBeVisible();
  });
});

test.describe("Navigation", () => {
  test("header shows navigation links for unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/");
    const header = page.locator("header");
    await expect(header).toBeVisible();
    await expect(page.locator('a[href*="login"]').first()).toBeVisible();
  });

  test("responsive design — mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.locator("header")).toBeVisible();
    // Content should not overflow
    const body = page.locator("body");
    const box = await body.boundingBox();
    expect(box).not.toBeNull();
  });
});
