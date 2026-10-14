import { test, expect, type Page } from "@playwright/test";

/**
 * DEC-080 · 首页最小发现页修正。
 *
 * 两个可独立回归的点：
 *   1) 「继续学习」rail 只吃未完成且进度 > 0 的记录；空数据 / 500 / 未登录整块不渲染，
 *      但推荐网格照常；
 *   2) 统计条降级为头部附属（inline），不再是推荐区上方那条整宽 band。
 *
 * 不依赖后端：本地铸票 + `page.route` mock `/learning/records` 与 `/recommendations/home`，
 * 其余 `/api/**` abort。authStore 从 token payload 派生用户，所以铸票即可走登录态。
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

async function mockHome(
  page: Page,
  options: { authenticated: boolean; records: MockRecord[]; recordsFail?: boolean }
) {
  // 注册顺序：catch-all 先，具体路由后（Playwright 后注册的先匹配）。
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.route("**/api/v1/recommendations/home**", (route) =>
    route.fulfill({ json: RECOMMENDATION })
  );
  await page.route("**/api/v1/learning/records**", (route) => {
    const url = new URL(route.request().url());
    // CompactStatsBar 的「已学视频」计数请求不带 completed 参数。
    if (url.searchParams.get("completed") !== "false") {
      return route.fulfill({
        json: { items: [], page: 1, page_size: 1, has_more: false, total: 9 },
      });
    }
    if (options.recordsFail) {
      return route.fulfill({ status: 500, json: { detail: "boom" } });
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
    await page
      .context()
      .addCookies([{ name: "seeword_token", value: token, url: "http://localhost:3000" }]);
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

test.describe("DEC-080 首页继续学习 rail", () => {
  test("进行中记录显示 rail，完成/0 进度被排除，链接带 from=home", async ({ page }) => {
    await mockHome(page, { authenticated: true, records: IN_PROGRESS });
    await page.goto("/");

    const rail = page.getByTestId("continue-learning-rail");
    await expect(rail).toBeVisible();
    await expect(rail.getByText("进行中课程 A")).toBeVisible();
    await expect(rail.getByText("进行中课程 B")).toBeVisible();
    await expect(rail.getByText("已完成课程")).toHaveCount(0);
    await expect(rail.getByText("未开始课程")).toHaveCount(0);

    const links = rail.locator('a[href*="/watch/"]');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute("href", /\/watch\/v1\?from=home/);
    await expect(links.nth(1)).toHaveAttribute("href", /\/watch\/v2\?from=home/);

    // rail 不吞推荐流：推荐网格照常渲染。
    await expect(page.getByText("推荐视频 A")).toBeVisible();
  });

  test("500 时 rail 不渲染，推荐网格照常", async ({ page }) => {
    await mockHome(page, { authenticated: true, records: [], recordsFail: true });
    await page.goto("/");

    await expect(page.getByText("推荐视频 A")).toBeVisible();
    await expect(page.getByTestId("continue-learning-rail")).toHaveCount(0);
  });

  test("未登录不渲染 rail", async ({ page }) => {
    await mockHome(page, { authenticated: false, records: IN_PROGRESS });
    await page.goto("/");

    // 首页属受保护路由：未登录会被 proxy 302 到 /login?next=/，根本进不了首页。
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByTestId("continue-learning-rail")).toHaveCount(0);
  });
});

test.describe("DEC-080 统计条降级为头部附属", () => {
  test("1440 桌面：统计在头部行、不再是整宽 band", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockHome(page, { authenticated: true, records: IN_PROGRESS });
    await page.goto("/");

    const inline = page.getByTestId("compact-stats-inline");
    await expect(inline).toBeVisible();
    const styles = await inline.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { background: cs.backgroundColor, borderTop: cs.borderTopWidth };
    });
    expect(styles.background).toBe("rgba(0, 0, 0, 0)");
    expect(styles.borderTop).toBe("0px");

    const greeting = page.locator("h1").first();
    const greetingBox = (await greeting.boundingBox())!;
    const inlineBox = (await inline.boundingBox())!;
    const railBox = (await page.getByTestId("continue-learning-rail").boundingBox())!;
    expect(inlineBox.x).toBeGreaterThan(greetingBox.x);
    expect(inlineBox.y).toBeLessThan(railBox.y);
  });

  test("390 移动：rail 可横向滚动，页面不横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 812 });
    await mockHome(page, {
      authenticated: true,
      records: [...IN_PROGRESS, ...IN_PROGRESS.map((r) => ({ ...r, id: `${r.id}-x` }))],
    });
    await page.goto("/");

    const rail = page.getByTestId("continue-learning-rail");
    await expect(rail).toBeVisible();
    const metrics = await rail.evaluate((el) => {
      const scroller = el.querySelector<HTMLElement>("div.overflow-x-auto");
      return {
        scrollWidth: scroller?.scrollWidth ?? 0,
        clientWidth: scroller?.clientWidth ?? 0,
        docWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    expect(metrics.docWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  });
});
