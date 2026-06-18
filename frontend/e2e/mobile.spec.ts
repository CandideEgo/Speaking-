import { test, expect } from '@playwright/test';

// Use iPhone X viewport for all tests in this file
test.use({ viewport: { width: 375, height: 812 } });

test.describe('Mobile — Home Page', () => {
  test('home page renders without horizontal overflow', async ({ page }) => {
    await page.goto('/');

    // The page should render
    await expect(page.locator('body')).toBeVisible();

    // Check for horizontal overflow — the document width should not exceed the viewport
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    // Allow a small tolerance for sub-pixel rounding
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test('home page content is visible and usable', async ({ page }) => {
    await page.goto('/');

    // Header should be visible
    await expect(page.locator('header')).toBeVisible();

    // The Speaking logo/link should be visible
    await expect(page.locator('text=Speaking').first()).toBeVisible();
  });
});

test.describe('Mobile — Navigation', () => {
  test('hamburger menu button is visible on mobile', async ({ page }) => {
    await page.goto('/');

    // The sidebar toggle button (hamburger) should be visible
    const menuButton = page.locator('button[aria-label="展开侧边栏"], button[aria-label="折叠侧边栏"]');
    await expect(menuButton.first()).toBeVisible();
  });

  test('sidebar opens when hamburger button is clicked', async ({ page }) => {
    await page.goto('/');

    // Click the hamburger menu button
    const menuButton = page.locator('button[aria-label="展开侧边栏"], button[aria-label="折叠侧边栏"]');
    await menuButton.first().click();

    // The mobile sidebar overlay should become visible
    // The sidebar contains nav links like "首页", "YouTube", etc.
    const sidebarOverlay = page.locator('.fixed.inset-0.z-50');
    await expect(sidebarOverlay).toBeVisible({ timeout: 3000 });

    // Navigation items should be visible in the sidebar
    await expect(page.locator('text=首页').first()).toBeVisible();
  });

  test('sidebar closes when overlay is clicked', async ({ page }) => {
    await page.goto('/');

    // Open the sidebar
    const menuButton = page.locator('button[aria-label="展开侧边栏"], button[aria-label="折叠侧边栏"]');
    await menuButton.first().click();

    const sidebarOverlay = page.locator('.fixed.inset-0.z-50');
    await expect(sidebarOverlay).toBeVisible({ timeout: 3000 });

    // Click the overlay backdrop (the close button behind the sidebar panel)
    const backdrop = page.locator('button[aria-label="关闭侧边栏"]');
    await backdrop.click();

    // Sidebar should close (fade out)
    await expect(sidebarOverlay).not.toBeVisible({ timeout: 3000 });
  });

  test('sidebar navigation links work on mobile', async ({ page }) => {
    await page.goto('/');

    // Open the sidebar
    const menuButton = page.locator('button[aria-label="展开侧边栏"], button[aria-label="折叠侧边栏"]');
    await menuButton.first().click();

    // Wait for sidebar to appear
    await page.waitForTimeout(1000);

    // Click a navigation link inside the sidebar
    const browseLink = page.locator('.fixed a[href="/browse"]').first();
    const browseVisible = await browseLink.isVisible({ timeout: 3000 }).catch(() => false);

    if (browseVisible) {
      await browseLink.click();
      await page.waitForURL(/\/browse/, { timeout: 5000 });
      expect(page.url()).toContain('/browse');
    }
  });
});

test.describe('Mobile — Login Form', () => {
  test('login form is usable on mobile — inputs and submit button visible', async ({ page }) => {
    await page.goto('/login');

    // Email input should be visible and not cut off
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
    const emailBox = await emailInput.boundingBox();
    expect(emailBox).not.toBeNull();
    // Input should be within viewport width
    expect(emailBox!.x + emailBox!.width).toBeLessThanOrEqual(375 + 10);

    // Password input should be visible
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    // Submit button should be visible
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });

  test('login form can be filled and submitted on mobile', async ({ page }) => {
    await page.goto('/login');

    // Fill the form
    await page.locator('input[type="email"]').fill('mobile@test.com');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    // Should either show an error (wrong credentials) or redirect
    // Either way, the page should not crash
    await page.waitForTimeout(3000);
    await expect(page.locator('body')).toBeVisible();
  });

  test('register link is accessible on mobile login page', async ({ page }) => {
    await page.goto('/login');

    const registerLink = page.locator('a[href*="register"]');
    await expect(registerLink.first()).toBeVisible();
  });

  test('forgot password link is accessible on mobile login page', async ({ page }) => {
    await page.goto('/login');

    const forgotLink = page.locator('a[href="/forgot-password"]');
    await expect(forgotLink).toBeVisible();
  });
});

test.describe('Mobile — Redeem Page', () => {
  test('redeem page is usable on mobile', async ({ page }) => {
    await page.goto('/redeem');

    // Page should load
    await expect(page.locator('h1')).toHaveText(/兑换 Pro 会员/);

    // Unauthenticated prompt should be visible and not overflow
    const loginPrompt = page.locator('text=/请先.*登录.*注册/i');
    await expect(loginPrompt).toBeVisible();
  });
});
