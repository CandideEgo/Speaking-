import { test, expect, type Page } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaUi } from "./helpers";

/**
 * Stage 1 watch-page layout regression (A2/A4/A5):
 *  - A2 subtitle panel scrolls independently (no hardcoded 560px)
 *  - A4 word card defaults to bottom-LEFT when panel expanded (avoids right
 *    subtitle panel), bottom-RIGHT when collapsed
 *  - A5 collapsing the panel constrains the video wrapper max-width
 *
 * CI starts with an empty DB, so the video-dependent tests skip when no video
 * link is present on the home page (same pattern as watch.spec.ts).
 */

const PHONE = uniquePhone();

test.beforeAll(async ({ request }) => {
  await registerUserViaApi(request, PHONE);
});

async function openFirstWatch(page: Page): Promise<boolean> {
  await loginViaUi(page, PHONE);
  await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
  await page.goto("/");
  const videoLink = page.locator('a[href*="/watch/"]').first();
  const hasVideos = await videoLink.isVisible({ timeout: 5000 }).catch(() => false);
  if (!hasVideos) return false;
  const href = (await videoLink.getAttribute("href"))!;
  await page.goto(href);
  // Subtitle mode tabs render once the video metadata is loaded - confirms the
  // page mounted without a black-screen / crashed layout.
  return page
    .locator("[role='tablist']")
    .first()
    .isVisible({ timeout: 15000 })
    .catch(() => false);
}

test.describe("Stage1 - watch page layout (A2/A4/A5)", () => {
  test("desktop: renders subtitle panel + current subtitle card, no errors", async ({ page }) => {
    if (!(await openFirstWatch(page))) test.skip();

    // Capture app-level JS errors only. Browser-level "Failed to load resource"
    // network noise (e.g. analytics keepalive preflight in dev) is filtered out
    // - it's unrelated to the layout under test and would mask real regressions.
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const text = m.text();
      if (text.startsWith("Failed to load resource")) return;
      errors.push(`console: ${text}`);
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    await expect(page.locator("aside").first()).toBeVisible();
    // Current subtitle card with clickable words renders.
    await expect(page.locator(".now-sub-en .now-sub-word").first()).toBeVisible({
      timeout: 8000,
    });
    await page.waitForTimeout(1500);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("desktop: word card defaults to bottom-LEFT when panel expanded", async ({ page }) => {
    if (!(await openFirstWatch(page))) test.skip();
    await page.locator(".now-sub-en .now-sub-word").first().click({ timeout: 8000 });
    const card = page.locator("[data-testid='word-tooltip']");
    await expect(card).toBeVisible({ timeout: 5000 });

    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    const vw = page.viewportSize()!.width;
    // Default (panel expanded) -> anchored bottom-LEFT.
    expect(box!.x).toBeLessThan(vw / 2);
    // Does not overlap the right subtitle panel.
    expect(box!.x + box!.width).toBeLessThan(vw * 0.62);
  });

  test("desktop: collapse panel -> video wrapper constrained + word card to bottom-RIGHT", async ({
    page,
  }) => {
    if (!(await openFirstWatch(page))) test.skip();
    await page.locator(".now-sub-en .now-sub-word").first().click({ timeout: 8000 });
    const card = page.locator("[data-testid='word-tooltip']");
    await expect(card).toBeVisible({ timeout: 5000 });

    const vw = page.viewportSize()!.width;
    const wrapper = page.locator("div.relative.aspect-video").first();

    // Before collapse: video wrapper spans (nearly) full column width.
    const before = await wrapper.boundingBox();
    expect(before).not.toBeNull();

    // Collapse the subtitle panel.
    await page.locator('button[aria-label="收起为字幕轨"]').first().click();
    await page.waitForTimeout(500);

    // After collapse: word card re-anchors to bottom-RIGHT.
    const cardBox = await card.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.x + cardBox!.width).toBeGreaterThan(vw / 2);

    // After collapse: video wrapper is constrained (max-width) + centered ->
    // width strictly less than viewport width with visible side margins.
    const after = await wrapper.boundingBox();
    expect(after).not.toBeNull();
    expect(after!.width).toBeLessThan(vw - 16);
    // And centered (left margin > some px).
    expect(after!.x).toBeGreaterThan(8);
  });
});
