import { test, expect } from '@playwright/test';

test.describe('Redeem Page — Load and Layout', () => {
  test('redeem page loads with form visible when authenticated', async ({ page }) => {
    // Register a test user to get an authenticated session
    const testEmail = `redeem-${Date.now()}@test.com`;
    await page.goto('/register');
    await page.locator('input[type="text"]').fill('Redeem Test User');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').fill('testpass123');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    // Now navigate to the redeem page
    await page.goto('/redeem');

    // Page heading should be visible
    await expect(page.locator('h1')).toHaveText(/兑换 Pro 会员/);

    // The form should be visible (since we are authenticated)
    await expect(page.locator('input[type="text"][placeholder*="XXXX"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('redeem page shows login prompt when unauthenticated', async ({ page }) => {
    await page.goto('/redeem');

    // Unauthenticated users should see a message prompting them to log in
    const loginPrompt = page.locator('text=/请先.*登录.*注册/i');
    await expect(loginPrompt).toBeVisible();

    // Should have links to login and register
    await expect(page.locator('a[href="/login"]')).toBeVisible();
    await expect(page.locator('a[href="/register"]')).toBeVisible();
  });
});

test.describe('Redeem Page — Form Validation', () => {
  test.beforeEach(async ({ page }) => {
    // Log in before each test
    const testEmail = `redeem-val-${Date.now()}@test.com`;
    await page.goto('/register');
    await page.locator('input[type="text"]').fill('Redeem Val User');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').fill('testpass123');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  });

  test('empty code submission shows validation error or button is disabled', async ({ page }) => {
    await page.goto('/redeem');

    // The submit button should be disabled when the code field is empty
    // (the component disables when !code.trim())
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeDisabled();
  });

  test('invalid code shows error message after API call', async ({ page }) => {
    await page.goto('/redeem');

    // Fill with a clearly invalid code
    const codeInput = page.locator('input[type="text"]');
    await codeInput.fill('INVALID-CODE-1');

    // Submit button should now be enabled
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeEnabled();

    // Submit the invalid code
    await submitButton.click();

    // Should display an error message from the API
    // The error appears in a div with text-red-600 styling
    const errorMessage = page.locator('.text-red-600, .text-red-800, [class*="bg-red-50"]');
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
  });

  test('code input transforms to uppercase', async ({ page }) => {
    await page.goto('/redeem');

    const codeInput = page.locator('input[type="text"]');
    await codeInput.fill('abc123');

    // The input should auto-transform to uppercase (onChange does .toUpperCase())
    const value = await codeInput.inputValue();
    expect(value).toBe('ABC123');
  });
});
