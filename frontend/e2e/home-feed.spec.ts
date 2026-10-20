import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { uniquePhone, registerUserViaApi, loginViaToken } from "./helpers";

/**
 * 首页下滑流：`/browse` 的分类 / 难度 / 排序并入首页后，筛选仍然是 URL 的
 * 单一真相，并且真的落在请求上。
 *
 * 这里断言**发出去的请求**，而不是只看 URL：`SORT_VALUES`（`isFeedSort` 的
 * 白名单）漏一个值时，URL 上照样写着 `sort=favorite`，请求里却没有 `sort`——
 * 页面看起来一切正常，只断言 URL 抓不到这种静默回落。断言响应 200 同时覆盖
 * 「后端认这个值」（认不出会 422）。
 *
 * 四条用例共用一个注册账号（serial）：注册接口有频率限制，并行注册会 429。
 */

test.describe.configure({ mode: "serial" });

let token: string;

test.beforeAll(async ({ request }) => {
  token = (await registerUserViaApi(request, uniquePhone())).token;
});

async function openHome(page: Page) {
  await loginViaToken(page, token);
  await page.goto("/");
  await expect(page.locator("#feed-sort")).toBeVisible({ timeout: 15000 });
}

test.describe("首页下滑流 · 筛选", () => {
  for (const viewport of [
    { width: 1440, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`筛选原地更新并保留滚动位置 ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      // 几何回归固定所有接口，反复切换/刷新不消耗真实账号的接口限流额度。
      await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
      await page.route("**/api/v1/users/me", (route) =>
        route.fulfill({ json: { id: "scroll-user", name: "学习者", onboarding_completed: true } })
      );
      await page.route("**/api/v1/vocabulary/stats**", (route) =>
        route.fulfill({ json: { total: 0, due_count: 0 } })
      );
      await page.route("**/api/v1/learning/records**", (route) =>
        route.fulfill({ json: { items: [] } })
      );
      const items = (label: string) =>
        Array.from({ length: 40 }, (_, index) => ({
          id: `scroll-video-${index}`,
          title: `${label}视频 ${index}`,
          source_url: `https://example.com/scroll-${index}`,
          thumbnail_url: null,
          duration: 300,
          difficulty_level: "B2",
          channel_name: "SeeWord",
          status: "ready",
          is_official: true,
          created_at: "2026-10-01T00:00:00Z",
        }));
      await page.route("**/api/v1/browse/home-editorial", (route) =>
        route.fulfill({ json: { editorial: null } })
      );
      await page.route("**/api/v1/browse/featured**", (route) =>
        route.fulfill({ json: { items: items("精选").slice(0, 1) } })
      );
      await page.route("**/api/v1/discovery/learning-metadata**", (route) =>
        route.fulfill({ json: {} })
      );
      await page.route("**/api/v1/recommendations/home**", (route) =>
        route.fulfill({
          json: { items: items("推荐"), has_more: false, total: 40, page: 1, page_size: 40 },
        })
      );
      await page.route("**/api/v1/browse/feed**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const params = new URL(route.request().url()).searchParams;
        const label = `${params.get("category")}-${params.get("level")}-${params.get("sort") ?? "latest"}`;
        const results = params.get("sort") === "hot" ? [] : items(label);
        await route.fulfill({
          json: { items: results, has_more: false, total: results.length, page: 1, page_size: 40 },
        });
      });
      await openHome(page);
      await expect(page.getByText("推荐视频 0", { exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const main = page.locator("#main-scroll");
      await main.evaluate((element) => {
        const feed = document.getElementById("feed")!;
        element.scrollTop +=
          feed.getBoundingClientRect().top - element.getBoundingClientRect().top - 24;
      });
      const initialTop = await main.evaluate((element) => element.scrollTop);
      expect(initialTop).toBeGreaterThan(100);
      const toolbarTop = (await page.locator("#feed").boundingBox())!.y;
      await page.evaluate(() => {
        // 曾经用过同一筛选并滑到深处；重新点筛选不能恢复那次访问的位置。
        sessionStorage.setItem("scroll:/?category=ted", "1400");
      });
      for (const [action, expected] of [
        [
          async () => {
            // 真正点击可见坐标，避免 Playwright 自动 scrollIntoView 改动被测位置。
            const box = (await page
              .locator("#feed")
              .getByRole("button", { name: "TED", exact: true })
              .boundingBox())!;
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          },
          "ted-null-latest",
        ],
        [() => page.locator("#feed-level").selectOption("B2"), "ted-B2-latest"],
        [() => page.locator("#feed-sort").selectOption("favorite"), "ted-B2-favorite"],
      ] as const) {
        await action();
        await expect(page.getByText(`${expected}视频 0`, { exact: true })).toBeVisible();
        await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(initialTop);
        expect(
          Math.abs((await page.locator("#feed").boundingBox())!.y - toolbarTop)
        ).toBeLessThanOrEqual(2);
      }
      // 离开/刷新后按当前筛选恢复；禁止恢复旧筛选，并不等于取消页面返回记忆。
      await page.reload();
      await expect(page.getByText("ted-B2-favorite视频 0", { exact: true })).toBeVisible();
      await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(initialTop);
      await page.locator("#feed-sort").selectOption("hot");
      await expect(page.getByText("没有同时满足这些条件的视频")).toBeVisible();
      await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(initialTop);
    });
  }

  test("收藏最多 / 本周收藏 写进 URL 且带进 /browse/feed 请求", async ({ page }) => {
    await openHome(page);
    const sort = page.locator("#feed-sort");

    const [favoriteResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/browse/feed") && r.url().includes("sort=favorite"),
        { timeout: 20000 }
      ),
      sort.selectOption("favorite"),
    ]);
    expect(favoriteResponse.status()).toBe(200);
    await expect(page).toHaveURL(/sort=favorite/);

    const [weeklyResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/browse/feed") && r.url().includes("sort=weekly_favorite"),
        { timeout: 20000 }
      ),
      sort.selectOption("weekly_favorite"),
    ]);
    expect(weeklyResponse.status()).toBe(200);
    await expect(page).toHaveURL(/sort=weekly_favorite/);
  });

  test("分类与难度写进 URL 并带进请求；筛选时不再提供「推荐」排序", async ({ page }) => {
    await openHome(page);
    const feed = page.locator("#feed");
    const sort = page.locator("#feed-sort");
    const level = page.locator("#feed-level");

    // 默认是推荐流，没有「看全部视频」的中转按钮
    await expect(page.getByRole("link", { name: "看全部视频" })).toHaveCount(0);
    await expect(sort).toHaveValue("recommended");

    const [categoryResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/browse/feed") && r.url().includes("category=news"),
        { timeout: 20000 }
      ),
      feed.getByRole("button", { name: "新闻", exact: true }).click(),
    ]);
    expect(categoryResponse.status()).toBe(200);
    await expect(page).toHaveURL(/category=news/);
    // 后端没有「分类内的个性化」这条排序，界面如实显示最新，并隐藏推荐
    await expect(sort).toHaveValue("latest");
    await expect(sort.locator('option[value="recommended"]')).toHaveCount(0);

    const [levelResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/browse/feed") && r.url().includes("level=B2"),
        { timeout: 20000 }
      ),
      level.selectOption("B2"),
    ]);
    expect(levelResponse.status()).toBe(200);
    await expect(page).toHaveURL(/level=B2/);
    await expect(page).toHaveURL(/category=news/);
  });

  test("空结果可清除筛选，回到推荐流", async ({ page }) => {
    await loginViaToken(page, token);
    // 筛选流为空（顺带证明空态不会吞掉工具条）；推荐流仍有一条视频。
    await page.route("**/api/v1/browse/feed**", (route) =>
      route.fulfill({
        json: { items: [], page: 1, page_size: 20, has_more: false, total: 0 },
      })
    );
    await page.route("**/api/v1/recommendations/home**", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: "rec-1",
              source_url: "https://example.com/rec-1",
              title: "首页推荐视频",
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
        },
      })
    );

    await page.goto("/?category=movie");
    await expect(page.getByText("没有同时满足这些条件的视频")).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "清除筛选" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("首页推荐视频")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#feed-sort")).toHaveValue("recommended");
  });

  test("旧链接 /browse 307 到首页并保留筛选，丢弃无关参数", async ({ page }) => {
    await loginViaToken(page, token);
    await page.goto("/browse?category=ted&sort=hot&utm_source=old&page=2");

    await expect(page).toHaveURL(/\/\?category=ted&sort=hot$/);
    await expect(page.locator("#feed-sort")).toHaveValue("hot");
  });

  test("真实数据首页在桌面与手机使用新版式，短复习入口不修改今日训练", async ({
    page,
    request,
  }) => {
    const directory = path.resolve(process.cwd(), "../docs/evidence/home-design-refresh");
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    fs.mkdirSync(directory, { recursive: true });
    await loginViaToken(page, token);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "今天从哪里开始？" })).toBeVisible();
    await expect(page.locator(".home-editorial-lead")).toBeVisible();
    await expect(page.locator(".home-personal")).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: "其他学习入口" })).toBeVisible();
    for (const [label, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 1100],
    ] as const) {
      await page.setViewportSize({ width, height });
      const task = (await page.locator(".home-editorial-lead").boundingBox())!;
      expect(task.width).toBeLessThanOrEqual(width);
      await expect(page.locator(".home-editorial-lead").getByRole("link").first()).toBeVisible();
      if (label === "desktop") {
        // 真实编排的任务与场景文案更长，首屏主位给续学/任务后，发现流标题
        // 仍应落在视口内；不写死 900，避免被字体与真实文案高度差异误伤。
        expect((await page.locator("#feed").boundingBox())!.y).toBeLessThanOrEqual(height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width
      );
      await page
        .locator(".home-editorial-lead img")
        .first()
        .evaluate((image: HTMLImageElement) => image.decode());
      await page.screenshot({ path: path.join(directory, `live-${label}.png`) });
    }
    // 真实后端验证新深链使用的既有练习接口：允许没有到期词时返回业务 409。
    const response = await request.get("/api/v1/vocabulary/practice?count=5&due_only=true", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 409]).toContain(response.status());
    if (response.ok()) {
      const body = await response.json();
      expect(body.items.length).toBeLessThanOrEqual(5);
    }
    expect(browserErrors).toEqual([]);
  });
});
