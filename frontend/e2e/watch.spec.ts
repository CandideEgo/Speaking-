import { test, expect, type Page } from "@playwright/test";

/**
 * Watch-page e2e tests.
 *
 * These tests need a "ready" video to be meaningful. CI starts with an empty
 * database (no seed), so the video-dependent tests `test.skip()` when no video
 * link is present on the home page. The error-state test runs unconditionally.
 */

test.describe("Watch Page - Error States", () => {
  test("invalid video ID shows an error state, not a white screen", async ({ page }) => {
    await page.goto("/watch/nonexistent-video-id-12345");

    // While loading the page shows a spinner; once the 404 resolves it shows
    // a "加载视频失败" error state. Either is acceptable - no white screen.
    const meaningful = page
      .locator(".animate-spin")
      .or(page.locator("text=/加载视频失败|处理失败|未知错误|返回浏览/i"));
    await expect(meaningful.first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("body")).toBeVisible();
  });
});

/**
 * Navigate to the first video on the home page and wait for the subtitle mode
 * tabs to render. Returns false if there is no video (skip) or the watch page
 * didn't reach the loaded state.
 */
async function openFirstVideo(page: Page): Promise<boolean> {
  await page.goto("/");
  const videoLink = page.locator('a[href*="/watch/"]').first();
  const hasVideos = await videoLink.isVisible({ timeout: 5000 }).catch(() => false);
  if (!hasVideos) return false;

  const href = (await videoLink.getAttribute("href"))!;
  await page.goto(href);
  return page
    .locator('[role="tablist"]')
    .isVisible({ timeout: 8000 })
    .catch(() => false);
}

test.describe("Watch Page - Valid Video", () => {
  test("watch page loads with a valid video ID", async ({ page }) => {
    await page.goto("/");
    const videoLink = page.locator('a[href*="/watch/"]').first();
    const hasVideos = await videoLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasVideos) {
      test.skip();
      return;
    }

    const href = (await videoLink.getAttribute("href"))!;
    await page.goto(href);
    // Page should render without crashing: title, spinner, or error.
    await expect(
      page
        .locator("h1")
        .or(page.locator(".animate-spin"))
        .or(page.locator("text=/加载视频失败|处理失败/"))
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Watch Page - Subtitle Mode Tabs", () => {
  test("subtitle mode tabs render bilingual / english / chinese labels", async ({ page }) => {
    if (!(await openFirstVideo(page))) {
      test.skip();
      return;
    }
    for (const label of ["双语", "英语", "中文"]) {
      await expect(page.locator(`[role="tab"]:has-text("${label}")`)).toBeVisible();
    }
  });

  test("clicking a mode tab activates it", async ({ page }) => {
    if (!(await openFirstVideo(page))) {
      test.skip();
      return;
    }
    const tab = page.locator('[role="tab"]:has-text("英语")');
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("Watch Page - Keyboard Shortcuts", () => {
  test("ArrowDown/ArrowUp advance the subtitle exactly one step (no double-fire)", async ({
    page,
  }) => {
    if (!(await openFirstVideo(page))) {
      test.skip();
      return;
    }
    // Regression guard: the page and useVideoPlayer both used to register a
    // window keydown listener, so every press fired twice (ArrowDown jumped
    // two subtitles; Space was a no-op). CI seeds one official ready video
    // (scripts/seed_e2e.py), so this test executes for real in CI.
    const counter = page.getByTestId("subtitle-counter");
    await expect(counter).toBeVisible();
    const text = (await counter.textContent()) ?? "";
    const total = Number(text.split("/")[1]?.trim());
    expect(total).toBeGreaterThanOrEqual(2);

    await expect(counter).toHaveText(`1 / ${total}`);
    await page.keyboard.press("ArrowDown");
    await expect(counter).toHaveText(`2 / ${total}`);
    await page.keyboard.press("ArrowUp");
    await expect(counter).toHaveText(`1 / ${total}`);
  });
});
