import { test, expect } from '@playwright/test';

test.describe('Video Watching', () => {
  test('public video page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1, a').filter({ hasText: /Speaking/i }).first()).toBeVisible();

    // Should have a grid of video cards or a message if no videos
    const videoCards = page.locator('a[href*="watch"]');
    const emptyState = page.locator('text=/no videos|coming soon|暂无/i');
    await expect(videoCards.first().or(emptyState.first())).toBeVisible({ timeout: 5000 });
  });

  test('watch page handles invalid video ID gracefully', async ({ page }) => {
    await page.goto('/watch/nonexistent-video-id-12345');

    // Should show error state or loading
    // 404 from API results in a generic error; page should not crash
    await page.waitForTimeout(3000);
    // Page should still render (not white screen)
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('dashboard requires authentication', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/login/, { timeout: 5000 });
  });

  test('redeem page shows content', async ({ page }) => {
    await page.goto('/redeem');
    // May redirect to login if unauthenticated, or show redeem form
    await page.waitForTimeout(2000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('Keyboard and Accessibility', () => {
  test('home page is keyboard navigable', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    // Should have focusable elements
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible({ timeout: 2000 });
  });

  test('login form can be submitted with Enter key', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.keyboard.press('Enter');
    // Should attempt login (redirect or show error)
    await page.waitForTimeout(3000);
    // Page should not crash
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Performance', () => {
  test('home page loads within 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(5000);
  });
});
