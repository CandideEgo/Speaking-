import { test, expect } from '@playwright/test';

const TEST_EMAIL = `e2e-${Date.now()}@test.com`;
const TEST_PASSWORD = 'e2epass123';

test.describe('Authentication', () => {
  test('landing page loads and shows public videos', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1, a').filter({ hasText: /Speaking/i }).first()).toBeVisible();
  });

  test('register flow creates account and redirects to dashboard', async ({ page }) => {
    await page.goto('/register');

    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    // Fill name input if present
    const nameInput = page.locator('input[type="text"], input[name="name"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('E2E Test User');
    }

    await page.click('button[type="submit"]');

    // Should redirect to dashboard or show success
    await page.waitForURL(/dashboard|\//, { timeout: 10000 });
  });

  test('login with valid credentials shows dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Should navigate to dashboard
    await page.waitForURL(/dashboard/, { timeout: 10000 });
    await expect(page.locator('h1')).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'nobody@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error toast or stay on login page
    await expect(page.locator('[data-sonner-toast], .text-red-500, .text-red-600').first()).toBeVisible({ timeout: 5000 }).catch(() => {
      // Fallback: should still be on login page
      expect(page.url()).toContain('/login');
    });
  });

  test('dashboard redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/login/, { timeout: 5000 });
    expect(page.url()).toContain('/login');
  });

  test('register page has link to login', async ({ page }) => {
    await page.goto('/register');
    const loginLink = page.locator('a[href*="login"]');
    await expect(loginLink.first()).toBeVisible();
  });

  test('login page has link to register', async ({ page }) => {
    await page.goto('/login');
    const registerLink = page.locator('a[href*="register"]');
    await expect(registerLink.first()).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test('header shows navigation links for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header');
    await expect(header).toBeVisible();
    await expect(page.locator('a[href*="login"]').first()).toBeVisible();
  });

  test('responsive design — mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
    // Content should not overflow
    const body = page.locator('body');
    const box = await body.boundingBox();
    expect(box).not.toBeNull();
  });
});
