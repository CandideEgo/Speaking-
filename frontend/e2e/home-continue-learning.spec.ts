import { test, expect, type Page } from "@playwright/test";

/**
 * 首页：真实表达与点词学习，顶部横条包含续学 / 少量复习 / 练习入口。
 * 下方保留分类、难度、排序齐全的视频流。
 *
 * 这些用例只关心三件仍然值得守的事：
 *   1) 续播只给最近一条「未完成且看过一点」的记录，链接带 from=home；
 *   2) 任一入口取数失败不拖垮推荐流；
 *   3) 学习横条始终在内容之前，桌面三栏、手机换行且不横向溢出。
 * API 全量 mock：这些测试不依赖真实库里的视频与学习记录。
 */

function mintToken(): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({
    sub: "probe",
    name: "学习者",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `${header}.${payload}.probe`;
}

interface MockRecord {
  id: string;
  video_id: string;
  title: string;
  progress: number;
  completed: boolean;
  duration?: number;
}

function recordJson(r: MockRecord) {
  return {
    id: r.id,
    video_id: r.video_id,
    words_learned: 3,
    speaking_attempts: 0,
    quiz_score: null,
    completed: r.completed,
    time_spent_seconds: 120,
    position_seconds: 60,
    progress_percentage: r.progress,
    last_accessed_at: "2026-10-12T12:00:00Z",
    created_at: "2026-10-11T12:00:00Z",
    video: {
      title: r.title,
      thumbnail_url: null,
      duration: r.duration ?? 600,
      channel_name: null,
    },
  };
}

const IN_PROGRESS: MockRecord[] = [
  {
    id: "r1",
    video_id: "v1",
    title: "进行中课程 A",
    progress: 60,
    completed: false,
  },
  {
    id: "r2",
    video_id: "v2",
    title: "进行中课程 B",
    progress: 25,
    completed: false,
  },
  {
    id: "r3",
    video_id: "v3",
    title: "已完成课程",
    progress: 100,
    completed: true,
  },
  {
    id: "r4",
    video_id: "v4",
    title: "未开始课程",
    progress: 0,
    completed: false,
  },
];

const RECOMMENDATION = {
  items: [
    {
      id: "rec-1",
      source_url: "https://example.com/rec-1",
      title: "推荐视频 A",
      channel_name: "SeeWord",
      channel_slug: null,
      thumbnail_url: null,
      duration: 480,
      view_count: 12,
      favorite_count: 3,
      description: null,
      difficulty_level: "B1",
      topic_tags: "tech",
      is_official: true,
      status: "ready",
      created_at: "2026-10-01T00:00:00Z",
    },
  ],
  page: 1,
  page_size: 20,
  has_more: false,
  total: 1,
};

const FEATURED = {
  items: [
    {
      id: "featured-1",
      source_url: "https://example.com/featured-1",
      title: "本周精选视频",
      channel_name: "TED",
      channel_slug: "ted",
      thumbnail_url: null,
      duration: 684,
      difficulty_level: "C1",
      topic_tags: "ted",
      is_official: true,
      status: "ready",
      storage_mode: "local",
      wpm: 148,
      created_at: "2026-10-01T00:00:00Z",
    },
  ],
};

const METADATA = {
  "featured-1": {
    subtitle_count: 38,
    exam_word_count: 52,
    sample_text_en: "The rush we feel is not a property of the world.",
    sample_text_zh: "我们感到的匆忙并不是世界的属性。",
    sample_start_time: 0.2,
    sample_end_time: 3.2,
    sample_subtitle_id: "featured-sub-1",
    sample_words: [
      { word: "rush", phonetic: "rʌʃ", translation: "n. 匆忙", levels: ["cet4"] },
      { word: "property", phonetic: "ˈprɒpəti", translation: "n. 属性", levels: ["cet6"] },
    ],
  },
};

async function mockHome(
  page: Page,
  options: { authenticated: boolean; records: MockRecord[]; recordsFail?: boolean }
) {
  // 注册顺序：catch-all 先，具体路由后（Playwright 后注册的先匹配）。
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.route("**/api/v1/recommendations/home**", (route) =>
    route.fulfill({ json: RECOMMENDATION })
  );
  await page.route("**/api/v1/browse/featured**", (route) => route.fulfill({ json: FEATURED }));
  await page.route("**/api/v1/discovery/learning-metadata**", (route) =>
    route.fulfill({ json: METADATA })
  );
  await page.route("**/api/v1/vocabulary/stats**", (route) =>
    route.fulfill({ json: { total: 241, due_count: 24 } })
  );
  await page.route("**/api/v1/exams/attempts**", (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 1 } })
  );
  await page.route("**/api/v1/learning/stats/weekly**", (route) =>
    route.fulfill({
      json: {
        this_week_minutes: 18,
        this_week_words: 0,
        this_week_videos: 0,
        daily_minutes: [],
        week_delta_pct: null,
      },
    })
  );
  await page.route("**/api/v1/learning/records**", (route) => {
    if (options.recordsFail) {
      return route.abort("failed");
    }
    return route.fulfill({
      json: {
        items: options.records.map(recordJson),
        page: 1,
        page_size: 6,
        has_more: false,
        total: options.records.length,
      },
    });
  });

  if (options.authenticated) {
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
  } else {
    await page.addInitScript(() => {
      window.localStorage.setItem("seeword_coach_done", "true");
    });
  }
}

test.describe("首页第一行动：继续观看 / 词汇 / 练习", () => {
  test("续学只给最近一条进行中记录，链接直接落到真实位置", async ({ page }) => {
    await mockHome(page, { authenticated: true, records: IN_PROGRESS });
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "我的学习入口" });
    await expect(nav).toBeVisible();
    // 入口只剩三个：找视频与分类/频道重复，已下线。
    await expect(nav.getByRole("link")).toHaveCount(3);

    const rail = page.getByTestId("continue-learning-rail");
    await expect(rail).toBeVisible();
    await expect(rail.getByText("进行中课程 A")).toBeVisible();
    await expect(rail.getByText(/60%/)).toBeVisible();
    await expect(rail.getByText("进行中课程 B")).toHaveCount(0);
    await expect(rail.getByText("已完成课程")).toHaveCount(0);
    await expect(rail.getByText("未开始课程")).toHaveCount(0);

    await expect(rail.getByRole("link", { name: /继续观看/ })).toHaveAttribute(
      "href",
      "/watch/v1?from=home&t=60"
    );

    // 首页邀请完成一小轮，而不是把全部到期数量变成压力。
    const vocab = nav.getByRole("region", { name: "词汇" });
    await expect(vocab.getByRole("link", { name: /5 个到期/ })).toHaveAttribute(
      "href",
      "/vocabulary/drill?review_count=5"
    );

    await expect(nav.getByRole("region", { name: "练习" }).getByRole("link")).toHaveAttribute(
      "href",
      "/practice"
    );
    await expect(page.getByRole("region", { name: "找视频" })).toHaveCount(0);

    // 主行动不吞推荐流。
    await expect(page.getByText("推荐视频 A")).toBeVisible();
  });

  test("没有可继续记录时，今日精选就是首屏主任务（完整视频入口）", async ({ page }) => {
    await mockHome(page, { authenticated: true, records: [] });
    await page.goto("/");

    await expect(page.getByTestId("continue-learning-rail")).toHaveCount(0);
    const task = page.getByRole("region", { name: "今日学习任务" });
    await expect(task).toBeVisible();
    await expect(task.getByRole("heading", { name: "本周精选视频" })).toBeVisible();
    // 兜底没有片段数据：主按钮如实去完整视频，不写「听懂这段」。
    const cta = task.getByRole("link", { name: /从这段开始/ });
    await expect(cta).toHaveAttribute("href", "/watch/featured-1?from=home");
    await expect(cta).toHaveAttribute("data-variant", "primary");
    await expect(
      page
        .getByRole("article", { name: "练一句原话" })
        .getByText("The rush we feel is not a property of the world.")
    ).toBeVisible();
  });

  test("到期不足 5 个时显示实际数量，没有到期词时改去词库", async ({ page }) => {
    await mockHome(page, { authenticated: true, records: [] });
    let due = 3;
    await page.route("**/api/v1/vocabulary/stats**", (route) =>
      route.fulfill({ json: { due_count: due, total: 12 } })
    );
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "我的学习入口" });
    const vocab = nav.getByRole("region", { name: "词汇" });
    await expect(vocab.getByRole("link", { name: /3 个到期/ })).toHaveAttribute(
      "href",
      "/vocabulary/drill?review_count=5"
    );
    due = 0;
    await page.reload();
    await expect(vocab.getByRole("link", { name: "词汇" })).toHaveAttribute("href", "/vocabulary");
    await expect(page.getByTestId("continue-learning-rail")).toHaveCount(0);
  });

  test("首页短复习只请求 5 个到期词，不启动完整的今日训练", async ({ page }) => {
    await mockHome(page, { authenticated: true, records: IN_PROGRESS });
    const practiceRequests: URL[] = [];
    const fullTrainingRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/vocabulary\/(daily-session|sessions)(\?|$)/.test(request.url()))
        fullTrainingRequests.push(request.url());
    });
    await page.route("**/api/v1/vocabulary/practice**", (route) => {
      practiceRequests.push(new URL(route.request().url()));
      return route.fulfill({ json: { items: [] } });
    });
    await page.goto("/");
    await page.getByRole("link", { name: /5 个到期/ }).click();
    await expect(page).toHaveURL(/\/vocabulary\/drill\?review_count=5$/);
    await expect.poll(() => practiceRequests.length).toBeGreaterThan(0);
    await expect(page.getByText("今天没有到期词，去听一点新内容吧。")).toBeVisible();
    for (const request of practiceRequests) {
      expect(request.searchParams.get("count")).toBe("5");
      expect(request.searchParams.get("due_only")).toBe("true");
    }
    expect(fullTrainingRequests).toEqual([]);
  });

  test("续播加载失败可重试，今日任务与推荐流照常", async ({ page }) => {
    await mockHome(page, { authenticated: true, records: [], recordsFail: true });
    await page.goto("/");

    await expect(page.getByText("学习记录暂时未能加载")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
    await expect(page.getByRole("region", { name: "今日学习任务" })).toBeVisible();
    await expect(page.getByText("推荐视频 A")).toBeVisible();
  });

  test("未登录不渲染续播", async ({ page }) => {
    await mockHome(page, { authenticated: false, records: IN_PROGRESS });
    await page.goto("/");

    // 首页属受保护路由：未登录会被 proxy 302 到 /login?next=/，根本进不了首页。
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByTestId("continue-learning-rail")).toHaveCount(0);
  });
});

test.describe("首页版式：主行动优先", () => {
  test("1440 桌面：三个入口在横条里，任务在左、真实原句在右", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockHome(page, { authenticated: true, records: IN_PROGRESS });
    await page.goto("/");

    const nav = (await page.getByRole("navigation", { name: "我的学习入口" }).boundingBox())!;
    const task = (await page.locator(".home-editorial-lead").boundingBox())!;
    const scene = (await page.getByRole("article", { name: "练一句原话" }).boundingBox())!;
    // 入口横条在今日推荐之上；任务卡与场景卡左右分栏。
    expect(nav.y + nav.height).toBeLessThanOrEqual(task.y);
    expect(scene.x).toBeGreaterThanOrEqual(task.x + task.width - 1);
    await expect(page.getByRole("complementary", { name: "其他学习入口" })).toHaveCount(0);
    await expect(page.locator(".home-personal")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1440
    );
  });

  test("390 移动：三入口不换行挤压、仍在任务之前，主 CTA 可点且无横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 812 });
    await mockHome(page, { authenticated: true, records: IN_PROGRESS });
    await page.goto("/");

    const nav = (await page.getByRole("navigation", { name: "我的学习入口" }).boundingBox())!;
    const task = (await page.getByRole("region", { name: "今日学习任务" }).boundingBox())!;
    expect(nav.y + nav.height).toBeLessThanOrEqual(task.y);
    await expect(page.getByTestId("continue-learning-rail")).toBeVisible();
    const metrics = await page.evaluate(() => ({
      docWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(metrics.docWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    await expect(page.getByRole("link", { name: /继续观看/ })).toBeVisible();
  });
});
