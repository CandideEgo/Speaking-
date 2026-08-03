import { test, expect, type Page } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaUi } from "./helpers";

/**
 * Stage 2 watch-page fixed-viewport + scroll-snap paging regression (A1/A3/A6):
 *  - The watch root is a snap-y mandatory container with two min-h-full screens
 *    (screen 1 = header + video + subtitle panel, screen 2 = practice).
 *  - Scrolling down snaps to the practice screen (page-flip feel + damping).
 *  - The subtitle list scrolls independently without scrolling the page.
 *
 * CI starts with an empty DB, so the test skips when no video is present on the
 * home page (same pattern as watch.spec.ts).
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
  return page
    .locator("[role='tablist']")
    .first()
    .isVisible({ timeout: 15000 })
    .catch(() => false);
}

test.describe("Stage2 - watch page snap paging (A1/A3/A6)", () => {
  test("desktop: snap container with two screens, scroll snaps to practice", async ({ page }) => {
    if (!(await openFirstWatch(page))) test.skip();

    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const t = m.text();
      if (t.startsWith("Failed to load resource")) return;
      errors.push(`console: ${t}`);
    });

    // No horizontal overflow (layout intact).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(2);

    // Video + subtitle card render (no black screen).
    await expect(page.locator("video").first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator(".now-sub-en .now-sub-word").first()).toBeVisible({ timeout: 8000 });

    // Snap container present, paged (two screens).
    const snap = await page.evaluate(() => {
      const r = document.querySelector("div.snap-y.snap-mandatory") as HTMLElement | null;
      if (!r) return null;
      return {
        snapType: getComputedStyle(r).scrollSnapType,
        scrollHeight: r.scrollHeight,
        clientHeight: r.clientHeight,
        initialScrollTop: r.scrollTop,
      };
    });
    expect(snap).not.toBeNull();
    expect(snap!.snapType).toContain("y");
    expect(snap!.scrollHeight).toBeGreaterThan(snap!.clientHeight);
    expect(snap!.initialScrollTop).toBe(0);

    // Practice CTA is attached (screen 2 content).
    const cta = page.locator("button", { hasText: "开始本句练习" }).first();
    await expect(cta).toBeAttached();

    // Scroll down -> snaps forward to the practice screen.
    await page.evaluate(() => {
      const r = document.querySelector("div.snap-y.snap-mandatory") as HTMLElement;
      r.scrollTo({ top: r.clientHeight, behavior: "instant" });
    });
    await page.waitForTimeout(700);
    const afterScroll = await page.evaluate(() => {
      const r = document.querySelector("div.snap-y.snap-mandatory") as HTMLElement;
      return r.scrollTop;
    });
    expect(afterScroll).toBeGreaterThan(100);

    // Subtitle list scrolls internally.
    const listScroll = await page.evaluate(() => {
      const list = document.querySelector(".subtitle-scroll") as HTMLElement | null;
      if (!list) return null;
      list.scrollTop = 80;
      return list.scrollTop;
    });
    expect(listScroll).not.toBeNull();
    expect(listScroll).toBeGreaterThan(0);

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
