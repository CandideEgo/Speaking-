import { test, expect } from "@playwright/test";
import { clickReplay, mediaState, openWatch, setupWatch, VIDEO_ID } from "./watch-baseline.fixture";

test("当前句同词来源正确，关闭恢复播放，原本暂停则不播放", async ({ page }) => {
  const fixture = await setupWatch(page);
  await openWatch(page, "?sub=second");
  const word = page
    .getByTestId("current-sentence-card")
    .getByRole("button", { name: "查看 walk 的词义", exact: true });
  await word.click();
  const card = page.getByTestId("word-tooltip");
  await expect(card).toContainText("第 2 句");
  await expect
    .poll(async () =>
      fixture.calls.find((c) => c.path.endsWith("/gloss/enrich"))?.params.get("subtitle_id")
    )
    .toBe("second");
  await card.getByRole("button", { name: "关闭", exact: true }).click();
  expect((await mediaState(page)).paused).toBe(true);
  await page.getByRole("button", { name: "继续播放", exact: true }).click();
  await expect.poll(async () => (await mediaState(page)).paused).toBe(false);
  await word.click();
  await expect.poll(async () => (await mediaState(page)).paused).toBe(true);
  await card.getByRole("button", { name: "加入词库" }).click();
  await expect
    .poll(() =>
      fixture.calls.find((c) => c.path === "/api/v1/vocabulary")?.params.get("subtitle_id")
    )
    .toBe("second");
  await card.getByRole("button", { name: "关闭", exact: true }).click();
  await expect.poll(async () => (await mediaState(page)).paused).toBe(false);
});

test("减少辅助只影响本次，重听到句末停，文稿行连续播放", async ({ page }) => {
  await setupWatch(page);
  await openWatch(page, "?sub=second");
  const preference = await page.evaluate(() => localStorage.getItem("seeword_subtitle_mode"));
  await page
    .getByTestId("sentence-actions")
    .getByRole("button", { name: "少一点辅助再听" })
    .click();
  await expect(page.getByTestId("current-sentence-zh")).toHaveCount(0);
  await expect(page.locator("#subtitle-1")).not.toContainText("然后我走回家。");
  await expect.poll(async () => (await mediaState(page)).paused).toBe(false);
  await page.getByTestId("current-sentence-card").click({ position: { x: 4, y: 4 } });
  await expect.poll(async () => (await mediaState(page)).paused).toBe(true);
  await expect(page.getByTestId("current-sentence-zh")).toHaveCount(0);
  await page
    .getByTestId("sentence-actions")
    .getByRole("button", { name: "少一点辅助再听" })
    .click();
  await expect.poll(async () => (await mediaState(page)).paused, { timeout: 7000 }).toBe(true);
  const stopped = await mediaState(page);
  expect(stopped.time).toBeGreaterThanOrEqual(8);
  expect(stopped.time).toBeLessThanOrEqual(8.5);
  expect(await page.evaluate(() => localStorage.getItem("seeword_subtitle_mode"))).toBe(preference);
  await page.getByRole("button", { name: "继续播放", exact: true }).click();
  await expect(page.getByTestId("current-sentence-zh")).toBeVisible();
  await page.locator("#subtitle-1").click();
  await expect
    .poll(async () => (await mediaState(page)).time, { timeout: 7000 })
    .toBeGreaterThan(8.5);
});

test("重听期间求助关闭后保留句末边界，新定位取消旧边界", async ({ page }) => {
  await setupWatch(page);
  await openWatch(page, "?sub=second");
  await clickReplay(page);
  await expect.poll(async () => (await mediaState(page)).paused).toBe(false);
  await page
    .getByTestId("current-sentence-card")
    .getByRole("button", { name: "查看 walk 的词义" })
    .click();
  await page.getByTestId("word-tooltip").getByRole("button", { name: "关闭", exact: true }).click();
  await expect.poll(async () => (await mediaState(page)).paused, { timeout: 7000 }).toBe(true);
  expect((await mediaState(page)).time).toBeLessThanOrEqual(8.5);
  await clickReplay(page);
  await page.locator("#subtitle-0").click();
  await expect
    .poll(async () => (await mediaState(page)).time, { timeout: 7000 })
    .toBeGreaterThan(3.5);
  expect((await mediaState(page)).paused).toBe(false);
});

test("晚到续播不能覆盖显式锚点或用户定位，短会话暂停保存", async ({ page }) => {
  const fixture = await setupWatch(page, { saved: 16, delayProgress: 1800 });
  await openWatch(page);
  await page.locator("#subtitle-1").click();
  await page.getByTestId("current-sentence-card").click({ position: { x: 4, y: 4 } });
  await expect.poll(() => fixture.writes.at(-1)).toBeGreaterThanOrEqual(5);
  await page.waitForTimeout(2000); // Deliberately allow the delayed history response to arrive.
  expect((await mediaState(page)).time).toBeLessThan(10);
  expect((await mediaState(page)).paused).toBe(true);
});

test("词义失败可重试；关闭后的旧响应不能重新打开词卡", async ({ page }) => {
  const fixture = await setupWatch(page);
  fixture.failLookup(true);
  await openWatch(page, "?sub=second");
  const word = page
    .getByTestId("current-sentence-card")
    .getByRole("button", { name: "查看 walk 的词义" });
  await word.click();
  await expect(page.getByTestId("word-tooltip")).toContainText("单词查询失败", { timeout: 10000 });
  fixture.failLookup(false);
  await page.getByRole("button", { name: "重试查询" }).click();
  await expect(page.getByTestId("word-tooltip")).toContainText("行走");
  await page.getByTestId("word-tooltip").getByRole("button", { name: "关闭", exact: true }).click();
  fixture.delayLookup("walk");
  await word.click();
  await page.getByTestId("word-tooltip").getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.getByTestId("word-tooltip")).toHaveCount(0);
  await page
    .getByTestId("current-sentence-card")
    .getByRole("button", { name: "查看 home. 的词义" })
    .click();
  await page.waitForTimeout(900);
  await expect(page.getByTestId("word-tooltip")).toHaveAttribute("aria-label", "home 词卡");
  await expect(page.getByTestId("word-tooltip")).toContainText("Then I walk home.");
});

test("空字幕仍可播放，没有录音请求或旧功能入口", async ({ page }) => {
  const fixture = await setupWatch(page, { empty: true });
  await openWatch(page);
  await expect(page.getByTestId("watch-status")).toContainText("本段暂无字幕");
  await page.getByRole("button", { name: "继续播放", exact: true }).click();
  await expect.poll(async () => (await mediaState(page)).paused).toBe(false);
  await expect(page.getByRole("button", { name: /录音|跟读/ })).toHaveCount(0);
  expect(
    fixture.calls.some((c) => /shadowing|weekly-reports|milestones|heatmap/.test(c.path))
  ).toBe(false);
});

test("媒体失败有重试与返回，非法锚点需要明确备用选择", async ({ page }) => {
  await setupWatch(page, { brokenMedia: true });
  await page.goto(`/watch/${VIDEO_ID}?t=Infinity`);
  await expect(page.getByTestId("watch-status")).toContainText("媒体加载失败");
  await expect(page.getByRole("button", { name: "重试媒体" })).toBeVisible();
  await expect(page.getByRole("button", { name: "从头观看" })).toBeVisible();
  await expect(page.getByRole("button", { name: "返回", exact: true }).last()).toBeVisible();
});

test("当前句可键盘点词，词卡关闭和重听按钮不被短视口裁掉", async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 1280, height: 720 });
  await setupWatch(page);
  await openWatch(page, "?sub=second");
  const word = page
    .getByTestId("current-sentence-card")
    .getByRole("button", { name: "查看 walk 的词义" });
  await word.focus();
  await word.press("Enter");
  const card = page.getByTestId("word-tooltip");
  for (const name of ["关闭", "重听本句"]) {
    const button = card.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  await card.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(word).toBeFocused();
});

test("第三方播放器协议使用同一重听与点词恢复规则", async ({ page }) => {
  await setupWatch(page, { youtube: true });
  await page.goto(`/watch/${VIDEO_ID}?sub=second`);
  await expect(page.getByText("第三方播放器协议测试")).toBeVisible();
  await clickReplay(page);
  await page
    .getByTestId("current-sentence-card")
    .getByRole("button", { name: "查看 walk 的词义" })
    .click();
  await page.getByTestId("word-tooltip").getByRole("button", { name: "关闭", exact: true }).click();
  const state = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          watchFixturePlayer: { getState: () => { time: number; paused: boolean } };
        }
      ).watchFixturePlayer.getState()
    );
  await expect.poll(async () => (await state()).paused).toBe(false);
  await expect.poll(async () => (await state()).paused, { timeout: 7000 }).toBe(true);
  expect((await state()).time).toBeGreaterThanOrEqual(8);
  expect((await state()).time).toBeLessThan(8.5);
  const next = page.getByRole("button", { name: "下一句", exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await expect.poll(async () => (await state()).time).toBeGreaterThanOrEqual(15);
  await expect(page.getByRole("button", { name: "录音" })).toHaveCount(0);
});

test("首句和末句在两倍速下可重复重听，旧边界不干扰新任务", async ({ page }) => {
  await setupWatch(page);
  await page.addInitScript(() => localStorage.setItem("seeword_playback_rate", "2"));
  await openWatch(page, "?sub=first");
  for (const end of [3, 3, 20]) {
    if (end === 20) await page.locator("#subtitle-2").click();
    await clickReplay(page);
    await expect.poll(async () => (await mediaState(page)).paused).toBe(false);
    await expect.poll(async () => (await mediaState(page)).paused, { timeout: 7000 }).toBe(true);
    const stopped = await mediaState(page);
    expect(stopped.rate).toBe(2);
    expect(stopped.time).toBeGreaterThanOrEqual(end);
    expect(stopped.time).toBeLessThanOrEqual(end + 0.5);
  }
});

test("失效原句不自动使用旧时间，保存失败可见且不阻止离开", async ({ page }) => {
  const fixture = await setupWatch(page);
  await openWatch(page, "?sub=removed&t=5");
  await expect(page.getByText("原句位置已变化，请选择备用位置或从头观看")).toBeVisible();
  expect((await mediaState(page)).time).toBeLessThan(0.5);
  await page.getByRole("button", { name: "使用备用时间" }).click();
  await expect.poll(async () => (await mediaState(page)).time).toBeGreaterThanOrEqual(4.75);
  fixture.failProgress(true);
  await page.getByRole("button", { name: "继续播放", exact: true }).click();
  await expect.poll(async () => (await mediaState(page)).paused).toBe(false);
  await page.getByTestId("current-sentence-card").click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId("watch-status")).toContainText("位置保存失败");
  expect(fixture.writes).toHaveLength(0);
  await page.getByRole("button", { name: "返回", exact: true }).last().click();
  await expect(page).not.toHaveURL(new RegExp(`/watch/${VIDEO_ID}`));
});

test("极短字幕即使错过首个时钟区间也不会整片播放", async ({ page }) => {
  await setupWatch(page, { short: true });
  await openWatch(page, "?sub=first");
  await clickReplay(page);
  await expect
    .poll(async () => {
      const state = await mediaState(page);
      return state.paused && state.time >= 0.01;
    })
    .toBe(true);
  expect((await mediaState(page)).time).toBeLessThan(0.5);
});

test("减少辅助后主动点词仍可求助，关闭后继续原句重听", async ({ page }) => {
  await setupWatch(page);
  await openWatch(page, "?sub=second");
  await page
    .getByTestId("sentence-actions")
    .getByRole("button", { name: "少一点辅助再听" })
    .click();
  await page
    .getByTestId("current-sentence-card")
    .getByRole("button", { name: "查看 walk 的词义" })
    .click();
  const card = page.getByTestId("word-tooltip");
  await expect(card).toBeVisible();
  expect((await mediaState(page)).paused).toBe(true);
  await card.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.getByTestId("current-sentence-zh")).toHaveCount(0);
  await expect.poll(async () => (await mediaState(page)).paused).toBe(false);
  await expect.poll(async () => (await mediaState(page)).paused, { timeout: 7000 }).toBe(true);
  expect((await mediaState(page)).time).toBeLessThan(8.5);
});
