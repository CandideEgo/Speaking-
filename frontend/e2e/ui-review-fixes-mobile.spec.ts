import { test, expect, type Page } from "@playwright/test";
import { setupWatch, openWatch, mediaState, VIDEO_ID } from "./watch-baseline.fixture";

test("复习总量、预览与训练分开说明，词性归一化与来源链接一致", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await setupWatch(page);
  const words = Array.from({ length: 20 }, (_, i) => ({
    id: `word-${i}`,
    word: i === 0 ? "objected" : i === 1 ? "citing" : `word${i}`,
    ipa: null,
    part_of_speech: i === 1 ? "v:15/n:85" : "v:100",
    mastery_level: i < 10 ? "reviewing" : "new",
    review_count: i < 10 ? 1 : 0,
    translation: "n. 物体；目标\nv. 反对；提出异议",
    definition: null,
    context_sentence: "I objected to this.",
    video_id: VIDEO_ID,
    subtitle_id: i === 0 ? "second" : null,
    difficulty_level: null,
    next_review_at: null,
    created_at: "2026-10-20",
  }));
  await page.route("**/api/v1/vocabulary**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/stats"))
      return route.fulfill({
        json: {
          total: 300,
          due_count: 239,
          new_count: 61,
          learning_count: 0,
          reviewing_count: 239,
          mastered_count: 0,
        },
      });
    if (path.endsWith("/daily-session"))
      return route.fulfill({
        json: {
          new_words: words.slice(10),
          review_words: words.slice(0, 10),
          // 累计到期来自 daily-session 的 due_total（复习队列口径，与 stats.due_count 不同）
          totals: { new_total: 10, due_total: 239 },
        },
      });
    if (path.endsWith("/sessions/current"))
      return route.fulfill({
        json: {
          session: {
            id: "round",
            status: "active",
            target_count: 10,
            items: words
              .slice(10)
              .map((word) => ({ word, id: word.id, status: "pending", correct_streak: 0 })),
          },
        },
      });
    return route.fulfill({ json: { items: words, total: 20 } });
  });
  await page.goto("/vocabulary");
  await expect(page.getByRole("heading", { name: "先完成这一轮" })).toBeVisible();
  await expect(page.getByText("本轮复习 10 个 · 新词 10 个", { exact: true })).toBeVisible();
  await expect(page.getByText("累计还有 239 个到期词", { exact: false })).toBeVisible();
  const preview = page.getByRole("region", { name: "本轮词汇" });
  await expect(preview).toBeVisible();
  const first = preview.getByRole("listitem").first();
  await expect(first).toContainText("动词");
  await expect(first).toContainText("反对");
  await expect(first.getByRole("link", { name: "去原句 →" })).toHaveAttribute(
    "href",
    `/watch/${VIDEO_ID}?from=vocabulary&sub=second&word=objected`
  );
  const second = preview.getByRole("listitem").nth(1);
  await expect(second.getByRole("link", { name: "去来源视频 →" })).toHaveAttribute(
    "href",
    `/watch/${VIDEO_ID}?from=vocabulary`
  );
  await expect(page.locator("#main-scroll")).not.toContainText("v:100");
  await page.getByRole("button", { name: "展开本轮全部 20 个词" }).click();
  await expect(preview.getByRole("listitem")).toHaveCount(20);
  await page.screenshot({ path: "../docs/ui-review-2026-10-21/fixed-vocabulary-390.png" });
  await page.goto("/vocabulary/drill");
  await expect(page.getByRole("heading", { name: "本轮训练 · 20 个词" })).toBeVisible();
  await expect(page.getByText("本轮复习 10 个 · 新词 10 个")).toBeVisible();
  await expect(page.getByText(/累计到期 239 个；本轮取 10 个复习词/)).toBeVisible();
  await expect(page.getByRole("link", { name: "去原句 →" })).toHaveAttribute(
    "href",
    `/watch/${VIDEO_ID}?from=drill&sub=second&word=objected`
  );
  await expect(page.getByRole("link", { name: "去来源视频 →" }).first()).toHaveAttribute(
    "href",
    `/watch/${VIDEO_ID}?from=drill`
  );
  await expect(page.locator("#main-scroll")).not.toContainText("v:15/n:85");
  await page.screenshot({ path: "../docs/ui-review-2026-10-21/fixed-drill-390.png" });
  await page.getByRole("link", { name: "去原句 →" }).click();
  await expect(page.getByTestId("current-sentence-en")).toHaveText("Then I walk home.");
  await expect.poll(async () => (await mediaState(page)).time).toBeGreaterThanOrEqual(5);
  await expect(page.getByTestId("word-tooltip")).toContainText("第 2 句");
  await expect
    .poll(() =>
      fixture.calls.find((c) => c.path.endsWith("/gloss/enrich"))?.params.get("subtitle_id")
    )
    .toBe("second");
  await page.goto("/vocabulary/drill");
  await page.getByRole("link", { name: "去来源视频 →" }).first().click();
  await expect(page).toHaveURL(`/watch/${VIDEO_ID}?from=drill`);
});

test("主按钮明暗主题默认与悬停文字对比度至少 4.5", async ({ browser }) => {
  // 观看页的动作行按设计已全部收敛为 ghost 文本按钮（V-23），主按钮改在
  // 登录页验证：那才是全站 primary action 的真实用色。
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  const button = page.getByRole("button", { name: "登录", exact: true });
  await expect(button).toBeVisible({ timeout: 15000 });
  for (const dark of [false, true]) {
    await page.evaluate((value) => document.documentElement.classList.toggle("dark", value), dark);
    for (const hover of [false, true]) {
      if (hover) await button.hover();
      else await page.mouse.move(0, 0);
      await page.waitForTimeout(200);
      const ratio = await button.evaluate((el) => {
        const css = getComputedStyle(el);
        const lum = (c: string) => {
          const rgb = c
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              v /= 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const a = lum(css.color),
          b = lum(css.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  }
  await context.close();
});

async function reachable(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  const nav = await page.getByTestId("mobile-tab-bar").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
  expect(
    await page.locator(selector).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    })
  ).toBe(true);
}

for (const [width, height] of [
  [390, 844],
  [375, 667],
]) {
  test(`${width}×${height} 短屏长句操作、词卡正文及错误加载可达`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const fixture = await setupWatch(page, {
      title:
        "An extremely long English video title about everyday action verbs and learning to describe what happens",
      longSentence: true,
      richGloss: true,
    });
    await openWatch(page);
    await expect(page.locator("#main-scroll")).toHaveJSProperty("scrollTop", 0);
    await reachable(page, '[data-testid="watch-toggle-play"]');
    await reachable(page, '[data-testid="watch-replay"]');
    await page.getByTestId("watch-toggle-play").click();
    await expect.poll(async () => (await mediaState(page)).paused).toBe(false);
    await page.getByTestId("watch-toggle-play").click();
    await page.getByTestId("watch-next").click();
    await expect(page.getByTestId("current-sentence-en")).toContainText("Then");
    await page.getByTestId("watch-prev").click();
    await page.getByTestId("current-sentence-expand").click();
    await expect(page.getByTestId("current-sentence-en")).toContainText("available in full");
    await page.getByTestId("current-sentence-expand").click();
    const word = page
      .getByTestId("current-sentence-card")
      .getByRole("button", { name: "查看 slip 的词义", exact: true });
    fixture.delayLookup("slip");
    await word.click();
    await expect(page.getByTestId("word-card-content")).toContainText("查询中");
    await expect(page.getByTestId("word-brief-meaning")).toHaveText("滑倒");
    const body = await page.getByTestId("word-card-content").boundingBox();
    const meaning = await page.getByTestId("word-brief-meaning").boundingBox();
    expect(body!.height).toBeGreaterThan(70);
    expect(meaning!.y + meaning!.height).toBeLessThanOrEqual(body!.y + body!.height);
    expect(
      await page
        .getByTestId("word-card-content")
        .evaluate((el) => el.scrollHeight > el.clientHeight)
    ).toBe(true);
    await reachable(page, '[data-testid="word-tooltip"] button:has-text("发音")');
    await reachable(page, '[data-testid="word-tooltip"] button:has-text("加入词库")');
    await page.screenshot({ path: `../docs/ui-review-2026-10-21/fixed-word-${width}.png` });
    await page.getByRole("button", { name: "加入词库", exact: true }).click();
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(word).toBeFocused();
    fixture.failLookup(true);
    await page
      .getByTestId("current-sentence-card")
      .getByRole("button", { name: "查看 when 的词义", exact: true })
      .click();
    await expect(page.getByTestId("word-tooltip").getByRole("alert")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("word-tooltip")).toHaveCount(0);
    await page.screenshot({ path: `../docs/ui-review-2026-10-21/fixed-watch-${width}.png` });
  });
}

test("更多设置模态焦点进入、约束、Escape 与把手键盘关闭", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupWatch(page);
  await openWatch(page);
  const trigger = page.getByTestId("watch-more-button");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "更多设置" });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.getByTestId("watch-more-grab")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("button", { name: "关闭更多设置" }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByTestId("watch-more-grab").press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

for (const stale of [false, true])
  test(`片段${stale ? "失效阻止自动播放" : "到终点暂停，选择后才继续完整视频"}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupWatch(page, { saved: 15 });
    await page.route("**/api/v1/browse/home-editorial", (route) =>
      route.fulfill({
        json: {
          editorial: {
            layout_revision: 1,
            lead: {
              video: { id: VIDEO_ID },
              content: {
                video_id: VIDEO_ID,
                content_revision_id: "clip-v1",
                headline: "听懂这句动作描述",
                clip: {
                  start_subtitle_id: stale ? "removed" : "second",
                  end_subtitle_id: "second",
                  start_time: 5,
                  end_time: 8,
                  duration: 3,
                },
              },
            },
            secondary: [],
          },
        },
      })
    );
    await openWatch(page, "?from=home&clip=clip-v1&sub=second&t=5&autoplay=1");
    const task = page.getByRole("region", { name: "片段任务" });
    if (stale) {
      await expect(task).toContainText("片段已失效");
      expect((await mediaState(page)).paused).toBe(true);
      return;
    }
    await expect(task).toContainText("听懂这句动作描述");
    await expect(task).toContainText("0:05–0:08");
    await expect(task).toContainText("已到片段终点", { timeout: 10000 });
    expect((await mediaState(page)).paused).toBe(true);
    expect((await mediaState(page)).time).toBeLessThan(8.3);
    // 新版片段任务把「继续播放」收窄成两个显式选择：重听片段 / 继续完整视频；
    // 结束态默认仍暂停，不会自动续播。
    await expect(task.getByRole("button", { name: "重听片段", exact: true })).toBeVisible();
    await expect(task.getByRole("button", { name: "继续完整视频" })).toBeVisible();
    expect((await mediaState(page)).paused).toBe(true);
    await page.screenshot({ path: "../docs/ui-review-2026-10-21/fixed-clip-end.png" });
    await task.getByRole("button", { name: "重听片段", exact: true }).click();
    await expect.poll(async () => (await mediaState(page)).time).toBeLessThan(7);
    await expect(task).toContainText("已到片段终点", { timeout: 10000 });
    await task.getByRole("button", { name: "继续完整视频" }).click();
    await expect(task).toHaveCount(0);
    await expect.poll(async () => (await mediaState(page)).time).toBeGreaterThan(8.5);
  });
