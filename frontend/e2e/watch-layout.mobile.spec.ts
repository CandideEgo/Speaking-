import { test, expect, type Page } from "@playwright/test";
import { openWatch, setupWatch } from "./watch-baseline.fixture";

async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    .toBe(false);
  await expect
    .poll(() =>
      page.locator("main").evaluate((element) => element.scrollWidth - element.clientWidth)
    )
    .toBeLessThanOrEqual(1);
}

test("桌面拖动、键盘边界、沉浸与复位保留媒体和偏好", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await setupWatch(page);
  await openWatch(page, "?sub=second");
  const video = await page.locator("video").elementHandle();
  const frame = page.getByTestId("video-frame");
  const divider = page.getByRole("separator", { name: "调整视频与文稿比例" });
  await expect(divider).toBeVisible();
  const before = (await frame.boundingBox())!;
  const handle = (await divider.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 40);
  await page.mouse.down();
  await page.mouse.move(handle.x - 120, handle.y + 40, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeLessThan(before.width - 80);
  const stored = await page.evaluate(() => localStorage.getItem("seeword_watch_layout"));
  await page.getByRole("button", { name: "沉浸观看", exact: true }).click();
  await expect(page.getByTestId("watch-transcript")).toBeHidden();
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeGreaterThan(before.width);
  await page.getByRole("button", { name: "退出沉浸", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("seeword_watch_layout"))).toBe(stored);
  await divider.focus();
  await divider.press("Home");
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeCloseTo(480, 0);
  await divider.press("End");
  expect((await page.getByTestId("watch-transcript").boundingBox())!.width).toBeGreaterThanOrEqual(
    319
  );
  await divider.press("Enter");
  await expect(divider).toHaveAttribute("aria-valuenow", "65");
  expect(await video!.evaluate((element) => element.isConnected)).toBe(true);
  expect(
    await page.locator("video").evaluate((element: HTMLVideoElement) => element.currentTime)
  ).toBeGreaterThanOrEqual(5);
  await page.reload();
  await expect(divider).toHaveAttribute("aria-valuenow", "65");
  await divider.press("ArrowLeft");
  await divider.dblclick();
  await expect(divider).toHaveAttribute("aria-valuenow", "65");
  await expect(page.getByTestId("watch-workspace")).toHaveAttribute("data-layout", "split");
  await noOverflow(page);
});

test("字幕、字号与笔记不再缩小视频，窗口不足时上下排布", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await setupWatch(page, { longSentence: true });
  await openWatch(page);
  const frame = page.getByTestId("video-frame");
  const before = (await frame.boundingBox())!;
  await page.getByRole("button", { name: "笔记", exact: true }).click();
  await page.getByTestId("current-sentence-card").getByRole("button", { name: /展开/ }).click();
  await page
    .getByTestId("controls-bar")
    .getByRole("button", { name: "更多设置", exact: true })
    .click();
  await page.getByTestId("controls-bar").getByRole("button", { name: "大", exact: true }).click();
  const after = (await frame.boundingBox())!;
  expect(after.width).toBeCloseTo(before.width, 0);
  expect(after.height).toBeCloseTo(before.height, 0);
  await page.setViewportSize({ width: 1100, height: 768 });
  await expect(page.getByTestId("watch-workspace")).toHaveAttribute("data-layout", "stacked");
  await noOverflow(page);
});

test("播放中跨桌面、上下布局和手机切换，媒体节点与进度连续", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await setupWatch(page);
  await openWatch(page);
  const media = await page.locator("video").elementHandle();
  const state = () =>
    media!.evaluate((element) => {
      if (!(element instanceof HTMLVideoElement)) throw new Error("Video was replaced");
      return { time: element.currentTime, paused: element.paused, connected: element.isConnected };
    });
  await page.getByRole("button", { name: "播放（空格）", exact: true }).click();
  await expect.poll(async () => (await state()).time).toBeGreaterThan(0.5);
  for (const width of [1100, 960, 1366]) {
    const before = (await state()).time;
    await page.setViewportSize({ width, height: 768 });
    await expect
      .poll(async () => {
        const current = await state();
        return current.connected && !current.paused;
      })
      .toBe(true);
    await expect.poll(async () => (await state()).time).toBeGreaterThan(before);
    await noOverflow(page);
  }
  await page.goto("/");
  await expect(page.getByTestId("watch-bottom-bar")).toHaveCount(0);
});

for (const zoom of [1.25, 1.5, 2]) {
  test(`浏览器 ${zoom * 100}% 缩放的等效 CSS 视口可用`, async ({ page }) => {
    await page.setViewportSize({ width: Math.round(1920 / zoom), height: Math.round(1080 / zoom) });
    await setupWatch(page, { longSentence: true, title: "A long title ".repeat(12) });
    await openWatch(page);
    await noOverflow(page);
    const frame = (await page.getByTestId("video-frame").boundingBox())!;
    expect(frame.height).toBeGreaterThan(70);
    expect(frame.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}

for (const [width, height] of [
  [320, 700],
  [375, 600],
  [390, 844],
  [430, 932],
  [844, 390],
  [1024, 768],
]) {
  test(`手机 ${width}×${height}：大小切换、滚动和两层底栏互不遮挡`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await setupWatch(page, { longSentence: true, richGloss: true });
    await openWatch(page);
    const video = await page.locator("video").elementHandle();
    const frame = page.getByTestId("video-frame");
    const controls = page.getByTestId("watch-bottom-bar");
    const tabs = page.getByTestId("mobile-tab-bar");
    const controlBox = (await controls.boundingBox())!;
    expect(controlBox.y + controlBox.height).toBeCloseTo((await tabs.boundingBox())!.y, 0);
    expect(
      await page
        .locator("main")
        .evaluate((element) =>
          element.contains(document.querySelector('[data-testid="watch-bottom-bar"]'))
        )
    ).toBe(false);
    await page.getByRole("button", { name: "紧凑", exact: true }).click();
    await expect(frame).toHaveAttribute("data-frame-size", "compact");
    expect((await frame.boundingBox())!.height).toBeLessThanOrEqual(145);
    if (width === 390)
      await page.screenshot({ path: test.info().outputPath("watch-mobile-compact.png") });
    await page.locator("main").evaluate((element) => {
      element.scrollTop = 350;
    });
    await expect
      .poll(async () => (await frame.boundingBox())!.y)
      .toBeCloseTo((await page.locator("main").boundingBox())!.y, 0);
    expect((await controls.boundingBox())!.y).toBeCloseTo(controlBox.y, 0);
    expect(await video!.evaluate((element) => element.isConnected)).toBe(true);
    await noOverflow(page);
    await page.locator("main").evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.reload();
    await expect(frame).toHaveAttribute("data-frame-size", "compact");
    await page.getByRole("button", { name: "标准", exact: true }).click();
    await expect(frame).toHaveAttribute("data-frame-size", "standard");
    await page
      .getByTestId("current-sentence-card")
      .getByRole("button", { name: "查看 I 的词义", exact: true })
      .first()
      .click();
    const sheet = page.getByTestId("word-tooltip");
    await expect(sheet).toBeVisible();
    const sheetBox = (await sheet.boundingBox())!;
    expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual((await controls.boundingBox())!.y + 1);
    expect(sheetBox.height).toBeGreaterThanOrEqual(239);
    for (const name of ["关闭", "重听本句"]) {
      const button = sheet.getByRole("button", { name, exact: true });
      await expect(button).toBeInViewport();
    }
    await sheet.getByRole("button", { name: "关闭", exact: true }).click();
    if (width === 390) {
      await page.screenshot({ path: test.info().outputPath("watch-mobile.png") });
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.screenshot({
        path: test.info().outputPath("watch-mobile-dark.png"),
        animations: "disabled",
      });
    }
  });
}
