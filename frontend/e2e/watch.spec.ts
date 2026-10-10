import { test, expect, type Page } from "@playwright/test";
import { uniquePhone, registerUserViaApi, loginViaToken } from "./helpers";

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
    const { token } = await registerUserViaApi(request, uniquePhone());
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
    await page.locator('[role="tablist"]').first().waitFor({ state: "visible", timeout: 15000 });
  } catch {
    return false;
  }
  return true;
}

test.describe("Watch Page - Valid Video", () => {
  test("watch page loads with a valid video ID", async ({ page, request }) => {
    const { token } = await registerUserViaApi(request, uniquePhone());
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

test.describe("Watch Page - Subtitle Mode Tabs", () => {
  test("subtitle mode tabs render bilingual / english / chinese labels", async ({
    page,
    request,
  }) => {
    const { token } = await registerUserViaApi(request, uniquePhone());
    if (!(await openFirstVideo(page, token))) {
      test.skip();
      return;
    }
    for (const label of ["双语", "英语", "中文"]) {
      await expect(page.locator(`[role="tab"]:has-text("${label}")`)).toBeVisible();
    }
  });

  test("clicking a mode tab activates it", async ({ page, request }) => {
    const { token } = await registerUserViaApi(request, uniquePhone());
    if (!(await openFirstVideo(page, token))) {
      test.skip();
      return;
    }
    const tab = page.locator('[role="tab"]:has-text("英语")');
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("Watch Page - Keyboard Shortcuts", () => {
  test("ArrowDown/ArrowUp adjust volume by exactly one step (no double-fire)", async ({
    page,
    request,
  }) => {
    const { token } = await registerUserViaApi(request, uniquePhone());
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
