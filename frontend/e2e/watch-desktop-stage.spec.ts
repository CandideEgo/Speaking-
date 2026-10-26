import { test, expect } from "@playwright/test";
import { openWatch, setupWatch } from "./watch-baseline.fixture";

for (const [width, height] of [
  [1280, 720],
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
  [2560, 1080],
]) {
  test(`桌面 ${width}×${height}：画面、当前句与主操作完整可达`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await setupWatch(page);
    await openWatch(page, "?sub=second");
    const frame = page.getByTestId("video-frame"),
      card = page.getByTestId("current-sentence-card"),
      actions = page.getByTestId("sentence-actions");
    await expect
      .poll(async () => (await card.boundingBox())!.y + (await card.boundingBox())!.height)
      .toBeLessThanOrEqual(height);
    const f = (await frame.boundingBox())!,
      c = (await card.boundingBox())!,
      a = (await actions.boundingBox())!;
    expect(Math.abs(c.x - f.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(c.width - f.width)).toBeLessThanOrEqual(2);
    expect(c.y).toBeGreaterThanOrEqual(f.y + f.height - 1.5);
    expect(f.width).toBeGreaterThanOrEqual(480);
    expect(f.height).toBeLessThanOrEqual(height * 0.55 + 1);
    expect(a.y).toBeGreaterThanOrEqual(c.y + c.height - 1);
    await page.screenshot({ path: test.info().outputPath("watch-stage.png") });
    for (const name of ["上一句", "重听本句", "下一句", "继续播放"]) {
      const button = actions.getByRole("button", { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport();
      const box = (await button.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(height);
    }
    await expect(page.getByRole("button", { name: /录音|跟读/ })).toHaveCount(0);
  });
}
