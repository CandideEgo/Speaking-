import { test, expect, type Page } from "@playwright/test";

/** 真实位置续播与精选/发现流独立；没有记录时省略，失败时可重试。 */

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
  await page.route("**/api/v1/users/me", (route) =>
    route.fulfill({ json: { id: "probe", name: "学习者", onboarding_completed: true } })
  );
  await page.route("**/api/v1/recommendations/home**", (route) =>
    route.fulfill({ json: RECOMMENDATION })
  );
  await page.route("**/api/v1/browse/featured**", (route) => route.fulfill({ json: FEATURED }));
  await page.route("**/api/v1/browse/home-editorial", (route) =>
    route.fulfill({ json: { editorial: null } })
  );
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

test.describe("首页续看入口", () => {
  test("只展示最近一条有效续看记录，恢复真实时间", async ({ page }) => {
    await mockHome(page, { authenticated: true, records: IN_PROGRESS });
    await page.goto("/");
    const rail = page.getByTestId("continue-learning-rail");
    await expect(rail).toContainText("进行中课程 A");
    await expect(rail).toContainText("60%");
    await expect(rail).not.toContainText("进行中课程 B");
    await expect(rail).toHaveAttribute("href", "/watch/v1?from=home&t=60");
    await expect(page.getByRole("navigation", { name: "我的学习入口" })).toHaveCount(0);
    await expect(page.getByText("推荐视频 A", { exact: true })).toBeVisible();
  });

  test("没有可继续记录时不显示空的续看入口", async ({ page }) => {
    await mockHome(page, { authenticated: true, records: IN_PROGRESS.slice(2) });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "观看完整视频", exact: true })).toBeVisible();
    await expect(page.getByTestId("continue-learning-rail")).toHaveCount(0);
  });

  test("续看加载失败允许重试，不阻塞精选和推荐流", async ({ page }) => {
    await mockHome(page, { authenticated: true, records: [], recordsFail: true });
    await page.goto("/");
    await expect(page.getByText("观看记录暂时未能加载")).toBeVisible();
    await expect(page.getByRole("link", { name: "观看完整视频", exact: true })).toBeVisible();
    await expect(page.getByText("推荐视频 A", { exact: true })).toBeVisible();
    await page.route("**/api/v1/learning/records**", (route) =>
      route.fulfill({ json: { items: IN_PROGRESS.map(recordJson) } })
    );
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await expect(page.getByTestId("continue-learning-rail")).toContainText("进行中课程 A");
  });

  for (const width of [1440, 390, 320]) {
    test(`${width}：紧凑续看在精选之前且不溢出`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockHome(page, { authenticated: true, records: IN_PROGRESS });
      await page.goto("/");
      const rail = page.getByTestId("continue-learning-rail");
      await expect(rail).toBeVisible();
      const r = (await rail.boundingBox())!;
      const c = (await page.locator(".home-editorial-lead").boundingBox())!;
      expect(r.y + r.height).toBeLessThanOrEqual(c.y);
      const geometry = await page
        .locator("#main-scroll")
        .evaluate((el) => ({ scroll: el.scrollWidth, width: el.clientWidth }));
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
    });
  }
});
