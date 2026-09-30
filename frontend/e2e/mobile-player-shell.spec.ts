/**
 * 移动端播放页壳层 —— #24/#28 乙 的**页面级**验收（375 / 390 / 414）。
 *
 * 为什么单独一条：入画字幕、词卡、跟读抽屉、控制条点出四件零件都落地了，但页面外壳
 * 一直是桌面版式（1280 容器 + px-4 内边距 + 播放器上方一行「返回/标题/点赞/元信息」），
 * 于是参考机型 375×812 上画框被顶到 y=166、只有 343 宽，露出画面 107.9px —— 而原型
 * B2-tap（#28 乙）同一个无头浏览器量出来是：画框 x=0 **w=375** **y=壳顶高**，
 * 露出画面 128.9px，标题画在画面里的 `.titlecard`（overlay，不占首屏高度）。
 *
 * 这条断言盯的就是那个差：**首屏必须是画面**，页头不许占播放器上方的高度。
 *
 * 与 mobile-inline-subtitle.spec.ts 的分工：那边管「画面内的字幕与控件」，这边管
 * 「画面本身在哪、多大」。
 *
 * 需要本地库里有**真能播**的视频（CI seed 的 /media/<id>.mp4 是占位 URL 404）→ skip。
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { registerUserViaApi, loginViaToken, uniquePhone } from "./helpers";

test.describe.configure({ mode: "serial" });
let token = "";
test.beforeAll(async ({ request }) => {
  ({ token } = await registerUserViaApi(request, uniquePhone()));
});

async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return box;
}

async function openWatch(page: Page, request: APIRequestContext, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => window.localStorage.setItem("seeword_coach_done", "true"));
  await loginViaToken(page, token);
  const res = await request.get("/api/v1/videos/public?page=1&page_size=1");
  const videoId = (await res.json())?.items?.[0]?.id ?? null;
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
}

/** 量一处移动端壳层：画框 / 壳顶 / 标题 overlay / 页头 h1 / 动作行 / 底栏。 */
async function measure(page: Page, width: number) {
  const frame = await boxOf(page, "video");
  const shell = await page.evaluate(() => {
    const main = document.querySelector("main#main-scroll");
    const r = main?.getBoundingClientRect();
    return { mainTop: r ? +r.top.toFixed(1) : null };
  });
  const burn = await boxOf(page, '[data-testid="burn-subtitle"]');
  const title = await boxOf(page, '[data-testid="frame-title"]');
  const actions = await boxOf(page, '[data-testid="mobile-actions"]');
  const tabBar = await boxOf(page, '[data-testid="mobile-tab-bar"]');
  const subtitleCounterBox = await boxOf(page, '[data-testid="subtitle-counter"]');
  const h1Visible = await page
    .locator("h1")
    .first()
    .isVisible()
    .catch(() => false);

  console.log(
    `[#24] ${width}×812 画框 x=${frame.x.toFixed(1)} y=${frame.y.toFixed(1)} ` +
      `w=${frame.width.toFixed(1)} h=${frame.height.toFixed(1)} 壳顶=${shell.mainTop} ` +
      `露出画面=${(burn.y - frame.y).toFixed(1)} 标题 overlay=${title.width.toFixed(0)}×${title.height.toFixed(0)} ` +
      `@y=${title.y.toFixed(1)} 动作行 y=${actions.y.toFixed(1)} 底栏顶=${tabBar.y.toFixed(1)}`
  );
  return { frame, burn, title, actions, tabBar, h1Visible, subtitleCounterBox, shell };
}

test.describe("移动端首屏＝画面（#24/#28 乙 的页面级版式）", () => {
  test("375×812：画框出血满宽、顶边贴壳顶、标题画进画面、页头不占首屏", async ({
    page,
    request,
  }) => {
    await openWatch(page, request, 375, 812);
    const m = await measure(page, 375);

    // ① 出血：与视口同宽、左边界 0（原型 375×210.9 的 16:9）
    expect(m.frame.x, "画框左边界贴 0（出血）").toBeCloseTo(0, 0);
    expect(m.frame.width, "画框与视口同宽").toBeCloseTo(375, 0);
    expect(m.frame.height, "16:9 全宽高度").toBeGreaterThan(205);

    // ② 贴壳顶：画框顶边 = 滚动容器顶边（页头不许占播放器上方的高度）
    expect(m.frame.y, "画框顶边贴壳顶（页头不占首屏）").toBeCloseTo(m.shell.mainTop!, 0);

    // ③ 标题画进画面：overlay 落在画框内部
    expect(m.title.y, "标题 overlay 在画框内（上边）").toBeGreaterThanOrEqual(m.frame.y);
    expect(m.title.y + m.title.height, "标题 overlay 不越出画框").toBeLessThanOrEqual(
      m.frame.y + m.frame.height
    );
    expect(m.title.x, "标题 overlay 在画面左侧（返回键右侧）").toBeLessThan(120);

    // ④ 桌面页头在移动端不渲染（h1 隐藏），动作行搬到字幕卡下面
    expect(m.h1Visible, "桌面页头 h1 在移动端不可见").toBe(false);
    expect(m.actions.y, "动作行在画框下方").toBeGreaterThan(m.frame.y + m.frame.height);
    expect(m.actions.height, "动作行是 44px 触控目标").toBeGreaterThanOrEqual(44);

    // ⑤ 露出画面 ≥120px（原型 128.9；修前 107.9）
    expect(m.burn.y - m.frame.y, "露出画面不少于 120px").toBeGreaterThanOrEqual(120);

    // ⑥ 入画字幕底边仍贴画框下沿（INV-021 在改版后仍成立）
    expect(
      Math.abs(m.burn.y + m.burn.height + 3 - (m.frame.y + m.frame.height)),
      "入画字幕底边贴画框下沿（其下是 3px 细进度）"
    ).toBeLessThan(2);

    // ⑦ 不引入横向溢出（w-screen 出血最容易在这里翻车）
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test("390 / 414 两档同样出血满宽、顶边贴壳顶", async ({ page, request }) => {
    for (const w of [390, 414]) {
      await openWatch(page, request, w, 812);
      const m = await measure(page, w);
      expect(m.frame.x, `${w} 档出血`).toBeCloseTo(0, 0);
      expect(m.frame.width, `${w} 档与视口同宽`).toBeCloseTo(w, 0);
      expect(m.frame.y, `${w} 档画框贴壳顶`).toBeCloseTo(m.shell.mainTop!, 0);
      expect(m.burn.y - m.frame.y, `${w} 档露出画面不少于 120px`).toBeGreaterThanOrEqual(120);
    }
  });
});

test.describe("桌面端不受影响（壳层改动只动 ≤1023px）", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("1280：页头仍在播放器上方，画框不出血、仍圆角", async ({ page, request }) => {
    await openWatch(page, request, 1280, 900);
    const frame = await boxOf(page, "video");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator('[data-testid="frame-title"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="mobile-actions"]')).toHaveCount(0);
    // 桌面端画框在 1280 容器里（不是出血），且页头把它压在下面
    expect(frame.x, "桌面画框有左内边距").toBeGreaterThan(8);
    expect(frame.width, "桌面画框不满宽").toBeLessThan(1000);
    expect(frame.y, "桌面画框在页头之下").toBeGreaterThan(80);
  });
});
