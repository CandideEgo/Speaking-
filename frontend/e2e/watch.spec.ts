import { test, expect, type Page } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaToken } from "./helpers";
import { openWatch, setupWatch } from "./watch-baseline.fixture";

/**
 * Watch-page e2e tests（桌面版式）。
 *
 * 视频用例需要库里有「ready」视频才有意义：CI 会 seed 一条官方视频
 * （`backend/scripts/seed_e2e.py`），让它们在 CI 里真跑；本地空库时守卫按
 * 「无视频」skip。错误态用例无条件跑。
 *
 * 登录墙（proxy.ts）：`/` 与 `/watch/*` 未登录一律 302 到 `/login` —— 4 条视频
 * 用例曾因不登录而长期静默 skip（10-02 复核发现，2026-10-11 补登录）。
 */

// 本文件断言的是桌面版式（字幕模式页签 / 键盘快捷键 / 错误态）。移动壳
// （≤1023px，DEC-069）的等价覆盖在 mobile-*.spec.ts；这里按同族先例强制桌面
// 视口，让断言在每个项目里都真跑（repro-stage1 / mobile-current-sentence-card /
// mobile-wordcard-drawer）。
test.use({ viewport: { width: 1280, height: 900 } });

// 首访教程浮层（fixed inset-0 z-[100]）盖住观看页，并把焦点收进它自己的按钮 ——
// 键盘快捷键会被 handler 的「焦点在交互元素上就不响应」护栏吞掉。本 spec 考的是
// 页面行为，不是首访引导（同 repro-stage1 / mobile-player-shell 口径）。
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("seeword_coach_done", "true"));
});

test.describe("Watch Page - Error States", () => {
  test("invalid video ID shows an error state, not a white screen", async ({ page, request }) => {
    // /watch/* 在登录墙后（proxy.ts）：未登录会被 302 到 /login，那里既没有
    // spinner 也没有错误态 —— 必须先登录才测得到错误态。
    const token =
      process.env.DESIGN_E2E_TOKEN || (await registerUserViaApi(request, uniquePhone())).token;
    await loginViaToken(page, token);

    await page.goto("/watch/nonexistent-video-id-12345");

    // While loading the page shows a spinner; once the 404 resolves it shows
    // a "加载视频失败" error state. Either is acceptable - no white screen.
    const meaningful = page
      .locator(".animate-spin")
      .or(page.locator("text=/加载视频失败|处理失败|未知错误/i"));
    await expect(meaningful.first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("body")).toBeVisible();
  });
});

/**
 * 登录 → 进首页 → 等第一条视频链接渲染 → 进观看页等字幕模式页签。
 * 返回 false = 空库无视频（真 skip）或观看页没到加载态。
 */
async function openFirstVideo(page: Page, token: string): Promise<boolean> {
  // 登录墙：不登录 goto("/") 会被 302 到 /login，首页自然没有视频链接 —— 4 条
  // 视频用例曾因此长期静默 skip（10-02 复核发现）。loginViaToken 自带 goto("/")。
  await loginViaToken(page, token);
  const videoLink = page.locator('a[href*="/watch/"]').first();
  // 守卫用 waitFor：`isVisible({ timeout })` 忽略 timeout、未水合即返回 false
  // （同 repro-stage1 的守卫缺陷，3c7f34c 已修），会把「还没渲染」误判成
  // 「没有视频」而 skip。waitFor 超时 = 空库无种子视频，是真 skip。
  try {
    await videoLink.waitFor({ state: "visible", timeout: 15000 });
  } catch {
    return false;
  }
  const href = await videoLink.getAttribute("href");
  if (!href) return false;
  await page.goto(href);
  try {
    await page.getByTestId("video-frame").waitFor({ state: "visible", timeout: 15000 });
  } catch {
    return false;
  }
  return true;
}

test.describe("Watch Page - Valid Video", () => {
  test("watch page loads with a valid video ID", async ({ page, request }) => {
    const token =
      process.env.DESIGN_E2E_TOKEN || (await registerUserViaApi(request, uniquePhone())).token;
    await loginViaToken(page, token);
    const videoLink = page.locator('a[href*="/watch/"]').first();
    try {
      await videoLink.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      test.skip(); // 空库（无种子视频）
      return;
    }

    const href = (await videoLink.getAttribute("href"))!;
    await page.goto(href);
    // Page should render without crashing: title, spinner, or error.
    await expect(
      page
        .locator("h1")
        .or(page.locator(".animate-spin"))
        .or(page.locator("text=/加载视频失败|处理失败/"))
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Watch Page - Subtitle Modes", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await setupWatch(page);
    await openWatch(page);
  });

  test("文稿不重复提供字幕切换或时间戳", async ({ page }) => {
    await expect(page.getByRole("tablist", { name: "字幕模式" })).toHaveCount(0);
    await expect(page.getByTestId("watch-transcript").locator(".font-mono")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "字幕：双语（S）" })).toBeVisible();
    await expect(page.getByTestId("sentence-actions").getByText("少一点辅助再听")).toHaveCount(0);
  });

  test("播放器按钮切换字幕，文稿与当前句同步", async ({ page }) => {
    await page.getByRole("button", { name: "字幕：双语（S）" }).click();
    await expect(page.getByRole("button", { name: "字幕：英文（S）" })).toBeVisible();
    await expect(page.getByTestId("current-sentence-zh")).toHaveCount(0);
    await expect(page.getByTestId("watch-transcript")).not.toContainText("我走进去了。");
  });

  test("S 键循环关闭字幕并恢复双语", async ({ page }) => {
    for (const label of ["英文", "中文", "关闭", "双语"]) {
      await page.keyboard.press("s");
      await expect(
        page.getByTestId("controls-bar").getByRole("button", { name: `字幕：${label}（S）` })
      ).toBeVisible();
      if (label === "关闭")
        await expect(page.getByTestId("watch-transcript")).toContainText("字幕已关闭");
    }
    await expect(page.getByTestId("current-sentence-zh")).toContainText("我走进去了。");
  });
});

test.describe("Watch Page - Keyboard Shortcuts", () => {
  test("ArrowDown/ArrowUp adjust volume by exactly one step (no double-fire)", async ({
    page,
    request,
  }) => {
    const token =
      process.env.DESIGN_E2E_TOKEN || (await registerUserViaApi(request, uniquePhone())).token;
    if (!(await openFirstVideo(page, token))) {
      test.skip();
      return;
    }
    // Regression guard: the page and useVideoPlayer both used to register a
    // window keydown listener, so every press fired twice (Space was a no-op).
    // D1 统一快捷键后 ↑/↓ 不再是字幕导航而是音量（字幕导航改为在列表里点击），
    // 双击旧疾的守卫口径随之搬到音量上：一次按键恰好一档 —— 两个监听器并存
    // 时会掉 0.2。CI seeds one official ready video (backend/scripts/seed_e2e.py),
    // so this test executes for real in CI.
    const counter = page.getByTestId("subtitle-counter");
    await expect(counter).toBeVisible();
    const text = (await counter.textContent()) ?? "";
    const total = Number(text.split("/")[1]?.trim());
    expect(total).toBeGreaterThanOrEqual(2);
    await expect(counter).toHaveText(`1 / ${total}`);

    const video = page.locator("video").first();
    await expect(video).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).volume))
      .toBeCloseTo(0.9, 2);
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).volume))
      .toBeCloseTo(1.0, 2);
  });
});
