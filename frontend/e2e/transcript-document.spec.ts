import { test, expect, type Page } from "@playwright/test";

/**
 * 全文文稿页（`/watch/{id}/transcript`）：从首页 hero 的「看全文文稿」进来，
 * 整段字幕按段落排成文档，考试词带下划线可回播放器查释义，右栏给目录与考试词索引。
 *
 * 数据全量 mock（只打 `/videos/{id}` 一个请求），不依赖本地库里的视频。
 */

function mintToken(): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({ sub: "probe", name: "学习者", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${header}.${payload}.probe`;
}

function subtitle(
  sentenceIndex: number,
  start: number,
  end: number,
  textEn: string,
  textZh: string | null,
  wordLevels: Record<string, string[]> | null = null
) {
  return {
    id: `s${sentenceIndex + 1}`,
    video_id: "v1",
    sentence_index: sentenceIndex,
    start_time: start,
    end_time: end,
    text_en: textEn,
    text_zh: textZh,
    grammar_note: null,
    word_levels: wordLevels,
    speaker: null,
  };
}

const VIDEO = {
  id: "v1",
  source_url: "https://example.com/v1",
  video_source: "local",
  title: "How to make sense of a world that keeps telling you to hurry",
  channel_name: "TED",
  channel_slug: "ted",
  thumbnail_url: null,
  duration: 684,
  difficulty_level: "C1",
  status: "ready",
  wpm: 148,
  subtitles: [
    subtitle(
      0,
      0,
      3,
      "The rush we feel is not a property of the world.",
      "我们感到的匆忙并不是世界的属性。",
      {
        rush: ["cet4"],
        property: ["cet6"],
        world: ["cet4"],
      }
    ),
    subtitle(
      1,
      3.4,
      6,
      "It is a habit we practice until it looks like one.",
      "它是一种被反复练习、直到看起来像天性的习惯。",
      {
        habit: ["cet4"],
      }
    ),
    subtitle(2, 12, 15, "Nobody teaches you how to hurry.", "没有人教你怎么着急。", {
      teaches: ["cet4"],
    }),
    subtitle(
      3,
      15.5,
      18,
      "You learn it by watching everyone else do it.",
      "你是看着别人这么做，才学会的。",
      null
    ),
  ],
};

async function mockTranscript(page: Page) {
  // 注册顺序：catch-all 先，具体路由后（Playwright 后注册的先匹配）。
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.route("**/api/v1/videos/v1", (route) => route.fulfill({ json: VIDEO }));

  const token = mintToken();
  await page.context().addCookies([
    {
      name: "seeword_token",
      value: token,
      url: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    },
  ]);
  await page.addInitScript((t: string) => {
    window.localStorage.setItem("seeword_token", t);
    window.localStorage.setItem("seeword_coach_done", "true");
  }, token);
}

test.describe("全文文稿页", () => {
  test("整段字幕按段落排成文档，考试词点回播放器", async ({ page }) => {
    // 右栏目录是桌面布局；手机宽度由下一条「390 手机」用例覆盖，这里跳过
    // 以免同一断言在 mobile-chrome project 里按设计必然失败。
    test.skip((page.viewportSize()?.width ?? 1440) < 768, "桌面右栏布局由 390 手机用例覆盖");
    await mockTranscript(page);
    await page.goto("/watch/v1/transcript");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "How to make sense of a world that keeps telling you to hurry",
      })
    ).toBeVisible();
    // 页头事实：句数 / 考试词数都在，说明拿到的是整段数据而不是节选。
    await expect(page.getByText("完整 4 句")).toBeVisible();
    await expect(page.getByText("5 个考试词")).toBeVisible();

    // 两段：0-6s 两句、12-18s 两句（中间 6s 静默换段）。
    await expect(page.getByText("第 1 段 · 2 句")).toBeVisible();
    await expect(page.getByText("第 2 段 · 2 句")).toBeVisible();

    // 四句都在（没有「节选 N 句」）。限于正文列表 `<ol>`：右栏目录会重复首句文字。
    const doc = page.locator("ol");
    await expect(doc.getByText("The rush we feel is not a property of the world.")).toBeVisible();
    await expect(doc.getByText("It is a habit we practice until it looks like one.")).toBeVisible();
    await expect(doc.getByText("Nobody teaches you how to hurry.")).toBeVisible();
    await expect(doc.getByText("You learn it by watching everyone else do it.")).toBeVisible();
    await expect(doc.getByText("我们感到的匆忙并不是世界的属性。")).toBeVisible();

    // 考试词是链接：回播放器、落在这一句并打开词卡。
    await expect(page.getByRole("link", { name: "rush", exact: true })).toHaveAttribute(
      "href",
      "/watch/v1?from=transcript&sub=s1&word=rush"
    );

    // 右栏：目录两条 + 考试词索引。
    const toc = page.getByRole("navigation", { name: "文稿目录" });
    await expect(toc.getByRole("button")).toHaveCount(2);
    const vocab = page.getByRole("region", { name: "考试词" });
    await expect(vocab.getByText("5", { exact: true })).toBeVisible();

    // 返回首页，不是弹窗、也不是播放页。
    await expect(page.getByRole("link", { name: /返回首页/ }).first()).toHaveAttribute("href", "/");
  });

  test("译文可以一键隐藏", async ({ page }) => {
    await mockTranscript(page);
    await page.goto("/watch/v1/transcript");

    const zh = page.getByText("我们感到的匆忙并不是世界的属性。");
    await expect(zh).toBeVisible();

    await page.getByRole("button", { name: "隐藏译文" }).click();
    await expect(zh).toHaveCount(0);
    await expect(page.getByRole("button", { name: "显示译文" })).toBeVisible();

    await page.getByRole("button", { name: "显示译文" }).click();
    await expect(zh).toBeVisible();
  });

  test("句首时间回到播放器并从该句开始", async ({ page }) => {
    await mockTranscript(page);
    await page.goto("/watch/v1/transcript");

    await page.getByRole("link", { name: "从 0:12 开始播放" }).click();
    await page.waitForURL(/\/watch\/v1\?from=transcript&sub=s3$/);
  });

  test("390 手机：右栏不出现，页面不横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 812 });
    await mockTranscript(page);
    await page.goto("/watch/v1/transcript");

    await expect(page.locator("ol").getByText("Nobody teaches you how to hurry.")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "文稿目录" })).toBeHidden();
    await expect(page.getByRole("region", { name: "考试词" })).toBeHidden();

    const metrics = await page.evaluate(() => ({
      docWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(metrics.docWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  });
});
