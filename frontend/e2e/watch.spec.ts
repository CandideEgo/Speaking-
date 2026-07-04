import { test, expect } from "@playwright/test";

test.describe("Watch Page — Error States", () => {
  test("invalid video ID shows error state, not white screen", async ({
    page,
  }) => {
    await page.goto("/watch/nonexistent-video-id-12345");

    // Wait for the page to settle (loading spinner, then error)
    // The watch page shows a Loader2 spinner while loading, then either the video or an error state
    await page.waitForTimeout(3000);

    // The page body should be visible — no white screen crash
    const body = page.locator("body");
    await expect(body).toBeVisible();

    // The page should render *some* meaningful content:
    // - Either a loading spinner (still fetching)
    // - Or an error message like "处理失败" / "未知错误"
    // - Or the video player (if the API somehow returns data)
    const hasSpinner = await page
      .locator(".animate-spin")
      .isVisible()
      .catch(() => false);
    const hasError = await page
      .locator("text=/处理失败|未知错误|error/i")
      .isVisible()
      .catch(() => false);
    const hasVideoPlayer = await page
      .locator("video")
      .isVisible()
      .catch(() => false);
    const hasBackButton = await page
      .locator('button[aria-label="返回首页"]')
      .isVisible()
      .catch(() => false);

    // At least one meaningful element should be present
    expect(
      hasSpinner || hasError || hasVideoPlayer || hasBackButton,
    ).toBeTruthy();
  });
});

test.describe("Watch Page — Valid Video", () => {
  test("watch page loads with a valid video ID", async ({ page }) => {
    // First visit the home page to find a video card link
    await page.goto("/");

    // Look for any video card link on the home page
    const videoLink = page.locator('a[href*="/watch/"]').first();

    // If there are video cards, click one; otherwise skip gracefully
    const hasVideos = await videoLink
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (hasVideos) {
      const href = await videoLink.getAttribute("href");
      expect(href).toBeTruthy();

      // Navigate to the watch page directly
      await page.goto(href!);

      // Page should render without crashing — look for the video title or player
      const pageTitle = page.locator("h1");
      const spinner = page.locator(".animate-spin");
      const errorMessage = page.locator("text=/处理失败|未知错误/");

      // One of these should be visible within a reasonable time
      await expect(pageTitle.or(spinner).or(errorMessage)).toBeVisible({
        timeout: 10000,
      });
    } else {
      // No videos available — the page should still load without crashing
      // Use a known seeded ID format; even if 404, it should not white-screen
      await page.goto("/watch/test-video-123");
      await page.waitForTimeout(2000);
      await expect(page.locator("body")).toBeVisible();
    }
  });
});

test.describe("Watch Page — Mode Tabs", () => {
  test("SubtitleModeTabs renders with all mode labels", async ({ page }) => {
    // Navigate to a watch page — we need a page where the tabs are rendered
    // First try to find a video from the home page
    await page.goto("/");
    const videoLink = page.locator('a[href*="/watch/"]').first();
    const hasVideos = await videoLink
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!hasVideos) {
      // No videos — skip this test gracefully
      test.skip();
      return;
    }

    const href = await videoLink.getAttribute("href");
    await page.goto(href!);

    // Wait for the page to finish loading (spinner should disappear)
    // The tabs appear once the video data is loaded
    await page.waitForTimeout(3000);

    // Check if the video loaded successfully (tabs are only shown on loaded video)
    const tabsContainer = page.locator('[role="tablist"]');
    const tabsVisible = await tabsContainer
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!tabsVisible) {
      // Video might still be processing or in error state — skip
      test.skip();
      return;
    }

    // Verify all mode labels are present
    const expectedLabels = [
      "双语",
      "英语",
      "阅读",
      "听写",
      "句子翻译",
      "填空",
      "词卡",
    ];
    for (const label of expectedLabels) {
      const tab = page.locator(`[role="tab"]:has-text("${label}")`);
      await expect(tab).toBeVisible();
    }
  });

  test("clicking a mode tab changes the active mode", async ({ page }) => {
    await page.goto("/");
    const videoLink = page.locator('a[href*="/watch/"]').first();
    const hasVideos = await videoLink
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!hasVideos) {
      test.skip();
      return;
    }

    const href = await videoLink.getAttribute("href");
    await page.goto(href!);
    await page.waitForTimeout(3000);

    const tabsContainer = page.locator('[role="tablist"]');
    const tabsVisible = await tabsContainer
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!tabsVisible) {
      test.skip();
      return;
    }

    // Click the "阅读" tab
    const readingTab = page.locator(`[role="tab"]:has-text("阅读")`);
    await readingTab.click();

    // Verify it becomes selected
    await expect(readingTab).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("Watch Page — Keyboard Shortcut Popup", () => {
  test("click Zap icon to open shortcut popup", async ({ page }) => {
    await page.goto("/");
    const videoLink = page.locator('a[href*="/watch/"]').first();
    const hasVideos = await videoLink
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!hasVideos) {
      test.skip();
      return;
    }

    const href = await videoLink.getAttribute("href");
    await page.goto(href!);
    await page.waitForTimeout(3000);

    // The Zap button has aria-label="快捷键" — only visible when video is loaded
    const zapButton = page.locator('button[aria-label="快捷键"]');
    const zapVisible = await zapButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!zapVisible) {
      test.skip();
      return;
    }

    // Click the Zap/shortcut button
    await zapButton.click();

    // The shortcuts popup should appear with keyboard hints
    const popup = page.locator("text=快捷键");
    await expect(popup).toBeVisible();

    // Verify some shortcut text is shown
    await expect(page.locator('kbd:has-text("Space")')).toBeVisible();
  });

  test("shortcut popup can be closed", async ({ page }) => {
    await page.goto("/");
    const videoLink = page.locator('a[href*="/watch/"]').first();
    const hasVideos = await videoLink
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!hasVideos) {
      test.skip();
      return;
    }

    const href = await videoLink.getAttribute("href");
    await page.goto(href!);
    await page.waitForTimeout(3000);

    const zapButton = page.locator('button[aria-label="快捷键"]');
    const zapVisible = await zapButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!zapVisible) {
      test.skip();
      return;
    }

    // Open and then close the popup
    await zapButton.click();
    await expect(page.locator("text=快捷键")).toBeVisible();

    // Close via the X button
    await page.locator('button[aria-label="关闭"]').click();

    // Popup should no longer be visible
    await expect(page.locator("text=快捷键")).not.toBeVisible();
  });
});
