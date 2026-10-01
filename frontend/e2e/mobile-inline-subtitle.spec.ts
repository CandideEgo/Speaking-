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

// 串行 + 一次注册：/auth/sms/register 是 3/minute（按 IP），每个用例各注册一个用户
// 会在第 4 条上 429（本文件现在 4 条）。
test.describe.configure({ mode: "serial" });
let token = "";
test.beforeAll(async ({ request }) => {
  ({ token } = await registerUserViaApi(request, uniquePhone()));
});

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

/**
 * 登录 → 打开第一条 ready 视频 → 跳过教程浮层 → 等到真能播。返回画框几何。
 *
 * `dismissPip` 默认 true：真滚走了的迷你窗仍要按真人做法退出（这层 workaround 留着，
 * 但它不再掩盖首屏行为 —— 首屏那条由「进入页面即内联播放器」单独断言）。返回画框几何。
 */
async function enterWatch(
  page: Page,
  request: APIRequestContext,
  { dismissPip = true }: { dismissPip?: boolean } = {}
) {
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

  if (dismissPip) {
    const pipClose = page.locator('[aria-label="关闭小窗播放"]');
    if (await pipClose.isVisible({ timeout: 1500 }).catch(() => false)) {
      await pipClose.click();
      await page.waitForTimeout(500);
    }
  }
  await expect(page.locator('[data-testid="controls-bar"]')).toHaveCount(1);

  const frame = await boxOf(page, "video");
  return frame;
}

test.use({ viewport: { width: 375, height: 812 } });

test.describe("移动端入画字幕与控制条点出（#28 乙，375×812）", () => {
  // 375×812 是参考机型（iPhone X），而它的画框顶 y=166 落在 useStickyPip 观察带底
  // （812×20% = 162.4）之下 —— 只要把「带外」当成「滚走了」，这一档首屏就是迷你窗、
  // 内联播放器与入画字幕全不渲染，整条移动端重设计等于不可见。所以这条断言盯首屏。
  test("进入页面即内联播放器：375 首屏不收成迷你窗，入画字幕贴画框下沿", async ({
    page,
    request,
  }) => {
    const frame = await enterWatch(page, request, { dismissPip: false });

    await expect(page.locator('[aria-label="关闭小窗播放"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="controls-bar"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="burn-subtitle"]')).toHaveCount(1);

    const burn = await boxOf(page, '[data-testid="burn-subtitle"]');
    const thin = await boxOf(page, '[data-testid="thin-progress"]');
    expect(Math.round(thin.height), "细进度线高度").toBe(3);
    expect(
      Math.abs(burn.y + burn.height + 3 - (frame.y + frame.height)),
      "入画字幕底边贴画框下沿（其下就是那条 3px 细进度）"
    ).toBeLessThan(2);
  });

  // 上面那条修复必须只掐掉「首屏误判」：真滚走了**仍然要进跟随态**，否则等于把跟随关掉。
  // #30 定的跟随形态是「画面贴顶常驻」——不缩、不飞、不消失（旧的右下角 160×90 迷你窗已取消），
  // 所以这条断言量的是「仍满宽 + 仍贴壳顶」，不再是「缩到 ≤200px」。
  // 滚动容器是壳里的 main#main-scroll（window.scrollY 恒 0）。
  test("向下滚动把画框滚出视口顶部 → 仍进跟随态（贴顶常驻，不再是迷你窗）", async ({
    page,
    request,
  }) => {
    const first = await enterWatch(page, request, { dismissPip: false });

    await page.evaluate(() => {
      const main = document.querySelector("main#main-scroll");
      if (main) main.scrollTop = 700;
      else window.scrollTo(0, 700);
    });
    await page.waitForTimeout(600);

    await expect(page.locator('[aria-label="关闭小窗播放"]')).toBeVisible({ timeout: 5000 });
    const stuck = await boxOf(page, "video");
    expect(stuck.width, "画面一个像素没缩（贴顶常驻，不是迷你窗）").toBeCloseTo(first.width, 0);
    expect(stuck.height, "画面高不变").toBeCloseTo(first.height, 0);
    const shellTop = await page.evaluate(
      () => document.querySelector("main#main-scroll")!.getBoundingClientRect().top
    );
    expect(stuck.y, "画面贴住壳顶").toBeCloseTo(shellTop, 0);
  });

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

  /**
   * Destination §7 补测点 3：INV-021 的「当前句恰好渲染一次」此前只有桌面那半边
   * （1280 下 `burn-subtitle` count 0、卡片里 `.now-sub-en` 还在）。移动这半边缺 ——
   * 而移动端才是两处都存在的风险面：入画一份 + 卡片一份 = 点词热区分裂成两半，
   * #27 的词卡落位也就没有唯一锚点。
   */
  test("375 下当前句只渲染一次：入画那份在，字幕卡那份不在", async ({ page, request }) => {
    await enterWatch(page, request, { dismissPip: false });

    await expect(page.locator('[data-testid="burn-subtitle"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="burn-subtitle-en"]')).toHaveCount(1);
    // 卡片里的当前句与其点词热区在移动端必须一个都不渲染。
    await expect(page.locator(".now-sub-en")).toHaveCount(0);
    await expect(page.locator(".now-sub-word")).toHaveCount(0);
    // 反向：入画那句的点词热区必须真的在（否则「恰好一次」是靠两边都没有达成的）。
    expect(await page.locator(".burn-sub-word").count()).toBeGreaterThan(0);
  });

  /**
   * Destination §7 补测点 4：字幕同步回归（`state.md` 的「iPhone 真机待办：字幕同步」
   * 需要一条本地可复现的回归；真机只补「音频对齐」那一层）。
   *
   * 做法：把播放头设到第 N 句 `start_time + 0.2s`（HTML5 那条路每 250ms 轮询一次
   * `currentTime` 并重算当前句，所以**暂停状态也能触发**，不依赖播放漂移），
   * 断言入画字幕的那行字与计数都换成第 N 句。选一句时长 >3s 的，避开跳过去就翻页的短句。
   */
  test("字幕同步：跳到第 N 句 start+0.2s，入画字幕与计数立刻换成那一句", async ({
    page,
    request,
  }) => {
    await enterWatch(page, request, { dismissPip: false });

    const videoId = new URL(page.url()).pathname.split("/").filter(Boolean).pop()!;
    const res = await request.get(`/api/v1/videos/${videoId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok(), `取字幕失败：${res.status()}`).toBe(true);
    const subs: { start_time: number; end_time: number; text_en: string }[] =
      (await res.json())?.subtitles ?? [];
    test.skip(subs.length < 3, "本地这条视频字幕太短，测不了切句");

    // 第 2 句之后找一句长于 3s 的（跳过去之后不会立刻再翻页）。
    const index = subs.findIndex((s, i) => i >= 1 && s.end_time - s.start_time > 3);
    test.skip(index < 0, "没有时长 >3s 的句子可用");

    await page
      .locator("video")
      .first()
      .evaluate((v, t) => {
        (v as HTMLVideoElement).pause();
        (v as HTMLVideoElement).currentTime = t;
      }, subs[index].start_time + 0.2);

    await expect(page.locator('[data-testid="subtitle-counter"]')).toHaveText(
      `${index + 1} / ${subs.length}`,
      { timeout: 5000 }
    );
    const shown = (await page.locator('[data-testid="burn-subtitle-en"]').innerText())
      .replace(/\s+/g, " ")
      .trim();
    expect(shown, `第 ${index + 1} 句入画字幕`).toBe(
      subs[index].text_en.replace(/\s+/g, " ").trim()
    );
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
