/**
 * 移动端入画字幕 + 控制条点出 —— wayfinder #28 决议（乙 · 控制条点出）的毕业物验收。
 *
 * 断言的是决议里写死的那几个数，不是「看起来差不多」：
 *   ① 入画字幕贴画框最下沿（落在 3px 细进度之上）
 *   ② 静息时画框底部只有一条 3px 进度线
 *   ③ 点画面 → 控制条浮起；字幕不动（压在它下面）；3s 自收
 *   ④ 点词与点画面错开：点词开词卡，并且不把控制条顶起来
 *
 * 需要本地库里有**真能播**的视频：CI seed 的 `/media/<id>.mp4` 是占位 URL（404），
 * 这种情况下和 mobile-d1-d10.spec.ts 一样 skip，而不是在几何断言上失败。
 *
 * 运行：npx playwright test e2e/mobile-inline-subtitle.spec.ts --project=chromium
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { registerUserViaApi, loginViaToken, uniquePhone } from "./helpers";

async function openFirstReadyVideo(request: APIRequestContext): Promise<string | null> {
  const res = await request.get("/api/v1/videos/public?page=1&page_size=1");
  if (!res.ok()) return null;
  const data = await res.json();
  return data?.items?.[0]?.id ?? null;
}

async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return box;
}

/** 登录 → 打开第一条 ready 视频 → 跳过教程浮层 → 等到真能播。返回画框几何。 */
async function enterWatch(page: Page, request: APIRequestContext) {
  const { token } = await registerUserViaApi(request, uniquePhone());
  // D2 教程浮层会盖住画面：直接用 app 自己的「看过了」标记关掉，别靠点按钮文案。
  await page.addInitScript(() => window.localStorage.setItem("seeword_coach_done", "true"));
  await loginViaToken(page, token);

  const videoId = await openFirstReadyVideo(request);
  test.skip(!videoId, "no ready video in local DB; seed first");

  await page.goto(`/watch/${videoId}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);

  const playable = await page
    .waitForFunction(
      () => {
        const v = document.querySelector("video");
        return !!v && v.readyState >= 2;
      },
      null,
      { timeout: 8000 }
    )
    .then(() => true)
    .catch(() => false);
  test.skip(!playable, "no playable media in local DB (the CI seed writes a placeholder URL)");

  // 375×812 下画框顶（y≈166）落在 useStickyPip 的「上 20%」观察带（y<162）之外，
  // 于是进页面就已经是迷你窗、内联播放器不渲染。这是既有行为（见 #30），
  // 这里照真人的做法点 X 退出小窗，再量内联播放器。
  const pipClose = page.locator('[aria-label="关闭小窗播放"]');
  if (await pipClose.isVisible({ timeout: 1500 }).catch(() => false)) {
    await pipClose.click();
    await page.waitForTimeout(500);
  }
  await expect(page.locator('[data-testid="controls-bar"]')).toHaveCount(1);

  const frame = await boxOf(page, "video");
  return frame;
}

test.use({ viewport: { width: 375, height: 812 } });

test.describe("移动端入画字幕与控制条点出（#28 乙，375×812）", () => {
  test("字幕贴画框下沿、常驻 3px 进度线、点画面浮起控制条 3s 自收", async ({ page, request }) => {
    const frame = await enterWatch(page, request);
    const frameBottom = frame.y + frame.height;

    // ① 常驻进度线：3px，贴画框底
    const thin = await boxOf(page, '[data-testid="thin-progress"]');
    expect(Math.round(thin.height), "细进度线高度").toBe(3);
    expect(Math.abs(thin.y + thin.height - frameBottom), "细进度线贴画框底").toBeLessThan(1.5);

    // ② 入画字幕：贴画框最下沿（3px 细进度之上）
    const burn = await boxOf(page, '[data-testid="burn-subtitle"]');
    expect(Math.abs(burn.y + burn.height + 3 - frameBottom), "字幕块底边贴画框下沿").toBeLessThan(
      2
    );
    expect(burn.x, "字幕块与画框同宽（出血到画框两侧）").toBeCloseTo(frame.x, 0);
    expect(burn.width).toBeCloseTo(frame.width, 0);
    expect(burn.height, "字幕块有实际高度（不是空壳）").toBeGreaterThan(20);

    // ③ 静息：播放 4s 后控制条已收（只剩细进度线）
    await page
      .locator("video")
      .first()
      .evaluate((v) => (v as HTMLVideoElement).play());
    await page.waitForTimeout(4000);
    const barRest = await boxOf(page, '[data-testid="controls-bar"]');
    expect(barRest.y, "静息时控制条整体沉到画框外").toBeGreaterThanOrEqual(frameBottom - 2);

    // ④ 点画面 → 浮起；字幕一个字不动（压在它下面）
    await page.mouse.click(frame.x + frame.width / 2, frame.y + frame.height * 0.3);
    await page.waitForTimeout(400);
    const barUp = await boxOf(page, '[data-testid="controls-bar"]');
    expect(barUp.y, "点画面后控制条浮起").toBeLessThan(frameBottom - 40);
    const burnWhileUp = await boxOf(page, '[data-testid="burn-subtitle"]');
    expect(Math.abs(burnWhileUp.y - burn.y), "控制条浮起时字幕不动").toBeLessThan(1);

    // ⑤ 3s 自收（3s 定时 + 200ms 过渡）
    await page.waitForTimeout(3600);
    const barAgain = await boxOf(page, '[data-testid="controls-bar"]');
    expect(barAgain.y, "3s 后控制条自收").toBeGreaterThanOrEqual(frameBottom - 2);

    // ⑥ 点词与点画面错开：开词卡，且不把控制条顶起来
    await page.locator('[data-testid="burn-subtitle"] .burn-sub-word').first().click();
    await expect(page.locator('[data-testid="word-tooltip"]')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(300);
    const barAfterWord = await boxOf(page, '[data-testid="controls-bar"]');
    expect(barAfterWord.y, "点词不该顺带把控制条顶起来").toBeGreaterThanOrEqual(frameBottom - 2);

    // ⑦ 入画字幕不引入横向溢出
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });
});

test.describe("桌面端不受影响（#28 只动移动端）", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("1280 宽：不渲染入画字幕，字幕卡里仍有当前句", async ({ page, request }) => {
    await enterWatch(page, request);

    await expect(page.locator('[data-testid="burn-subtitle"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="thin-progress"]')).toHaveCount(0);
    await expect(page.locator(".now-sub-en .now-sub-word").first()).toBeVisible();
  });
});
