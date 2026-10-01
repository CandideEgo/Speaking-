/**
 * 移动端播放页的滚动形态 —— wayfinder #30 决议（**画面贴顶常驻**）的毕业物验收。
 *
 * 定稿的形态：滚过画框之后，画面**不缩、不飞、不消失** —— 它与整张字幕卡一起
 * 贴到壳顶常驻（`sticky`，活动范围是左列那层 grid item），`<video>` 节点不换父，
 * 所以内联 ↔ 常驻切换不丢播放进度。被否的三条与它们的读数代价在
 * `docs/design/mobile/prototypes/S-scroll.md`：
 *   · A2「只留一条」—— 入画字幕与点词热区整体出画（#27 的锚点在滚动后失效）
 *   · B「画面缩成条」—— 长句被画框切掉（216 字符句：条内只看得见 62/107px）
 *   · C「右下角 160×90」—— 入画字幕份数归零（INV-021 的锚点消失）+ iOS 地址栏 40px
 *
 * 断言的数字全部来自 `getBoundingClientRect()`；热区用 `elementFromPoint` 逐像素探。
 *
 * 需要本地库里有**真能播**的视频（CI seed 的 `/media/<id>.mp4` 是占位 URL 404）→ skip。
 *
 * 运行：npx playwright test e2e/mobile-pip-scroll.spec.ts --project=chromium
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { registerUserViaApi, loginViaToken, uniquePhone } from "./helpers";

// 串行 + 一次注册：/auth/sms/register 是 3/minute（按 IP），每个用例各注册一个用户会 429。
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

/** 滚到某一处（滚动容器是壳里的 `main#main-scroll`，`window.scrollY` 恒 0）。 */
async function scrollTo(page: Page, top: number) {
  await page.evaluate((y) => {
    const main = document.querySelector("main#main-scroll");
    if (main) main.scrollTop = y;
  }, top);
  await page.waitForTimeout(500);
}

/**
 * 登录 → 打开第一条 ready 视频 → 跳过教程浮层 → 等到真能播。
 * **不**退出常驻态：本票量的就是常驻态本身（旧的「进页面即迷你窗」那层 workaround 不需要了）。
 */
async function enterWatch(page: Page, request: APIRequestContext) {
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

  await expect(page.locator('[data-testid="controls-bar"]')).toHaveCount(1);
}

/**
 * 贴顶常驻的对象 = **画框自己**：移动端左列是 `display: contents`，画框直接成为 grid item，
 * 包含块是整个网格容器（余量 ≈900px > 滚动上限 707px），所以滚动全程都钉得住。
 * 别再量左列：它没有盒子（rect 恒 0×0、`position` 恒 static），量它只会量到空气。
 */
async function columnOf(page: Page) {
  return page.evaluate(() => {
    const v = document.querySelector("video");
    const frame = v?.parentElement?.parentElement as HTMLElement | undefined;
    if (!frame) return null;
    const r = frame.getBoundingClientRect();
    return { y: r.y, height: r.height, position: getComputedStyle(frame).position };
  });
}

test.use({ viewport: { width: 375, height: 812 } });

test.describe("移动端滚动形态：画面贴顶常驻（#30，375×812）", () => {
  test("首屏不受影响：画框顶 = 壳顶、不常驻、入画字幕贴画框下沿", async ({ page, request }) => {
    await enterWatch(page, request);

    const frame = await boxOf(page, "video");
    const shellTop = await page.evaluate(
      () => document.querySelector("main#main-scroll")!.getBoundingClientRect().top
    );
    const col = await columnOf(page);

    expect(frame.y, "首屏画框顶贴壳顶（INV-024）").toBeCloseTo(shellTop, 0);
    expect(col?.position, "首屏不贴顶常驻").not.toBe("sticky");
    await expect(page.locator('[data-testid="burn-subtitle"]')).toHaveCount(1);
    await expect(page.locator('[aria-label="关闭小窗播放"]')).toHaveCount(0);
  });

  test("滚过画框 → 画面贴顶常驻：画框顶仍 = 壳顶、尺寸一像素没缩、字幕还在画面内", async ({
    page,
    request,
  }) => {
    await enterWatch(page, request);
    const before = await boxOf(page, "video");

    await scrollTo(page, 400);

    const col = await columnOf(page);
    const frame = await boxOf(page, "video");
    const shellTop = await page.evaluate(
      () => document.querySelector("main#main-scroll")!.getBoundingClientRect().top
    );

    // ① 真的粘住了：滚过画框下沿之后画框顶仍在壳顶。
    // 注意滚动上限是 707px 不是 1200（`scrollTop=1200` 会被夹住）——上限那条另有 ①′ 单独断言。
    expect(col?.position, "滚过之后画框是 sticky").toBe("sticky");
    expect(frame.y, "常驻时画框顶 = 壳顶").toBeCloseTo(shellTop, 0);

    // ② 尺寸一像素没缩（这就是「不缩成小窗」的硬证据）
    expect(frame.width, "常驻时画框仍满宽").toBeCloseTo(before.width, 0);
    expect(frame.height, "常驻时画框高不变").toBeCloseTo(before.height, 0);
    expect(frame.height, "画框是 16:9 全宽（不是 160×90）").toBeGreaterThan(200);

    // ③ 入画字幕跟着画面一起留下（INV-021：当前句全页仍只有一份）
    await expect(page.locator('[data-testid="burn-subtitle"]')).toHaveCount(1);
    const burn = await boxOf(page, '[data-testid="burn-subtitle"]');
    expect(burn.y, "字幕顶还在画框内").toBeGreaterThanOrEqual(frame.y);
    expect(burn.y + burn.height, "字幕底不越出画框").toBeLessThanOrEqual(
      frame.y + frame.height + 1
    );
    expect(
      Math.abs(burn.y + burn.height + 3 - (frame.y + frame.height)),
      "字幕底边仍贴画框下沿（其下是 3px 细进度）"
    ).toBeLessThan(2);

    // ④ 点词热区还在画面里且没变矮（#27 的锚点没丢）
    const hit = await page.evaluate(() => {
      const w = document.querySelector(
        '[data-testid="burn-subtitle"] .burn-sub-word'
      ) as HTMLElement;
      if (!w) return null;
      const r = w.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2);
      const mid = r.top + r.height / 2;
      const at = (y: number) => document.elementsFromPoint(cx, y).indexOf(w) >= 0;
      if (!at(mid)) return { h: 0, tappable: false };
      let lo = mid,
        hi = mid;
      for (let i = 0; i < 40 && lo > r.top - 26; i++) {
        if (!at(lo - 1)) break;
        lo--;
      }
      for (let i = 0; i < 40 && hi < r.bottom + 26; i++) {
        if (!at(hi + 1)) break;
        hi++;
      }
      return { h: Math.round(hi - lo), tappable: true };
    });
    expect(hit?.tappable, "常驻时画面内的词仍可点").toBe(true);
    expect(hit!.h, "词热区与 #28 实测同档（22px 行距 + 外扩）").toBeGreaterThanOrEqual(21);

    // ①′ 一路滚到**滚动上限**仍然钉得住 —— 这是旧实现翻车的地方，单独留一条回归：
    // sticky 的活动范围是它的包含块。旧实现把它挂在 490px 高的左列上（包含块余量 635px
    // < 滚动上限 707px），于是最后 ~72px 里画面被包含块底边推着走（实测滚到上限时
    // 画框顶 y=-28，而壳顶是 64）。现在挂在画框自己身上、包含块是整个网格容器。
    await scrollTo(page, 9999);
    const atMax = await page.evaluate(() =>
      Math.round(document.querySelector("main#main-scroll")!.scrollTop)
    );
    expect(atMax, "确实滚到了上限（上限不是 1200，别被 scrollTo(1200) 骗了）").toBeGreaterThan(400);
    expect((await boxOf(page, "video")).y, "滚到上限画框顶仍 = 壳顶").toBeCloseTo(shellTop, 0);
  });

  test("常驻不丢播放进度：切进常驻前后 currentTime 连续", async ({ page, request }) => {
    await enterWatch(page, request);

    await page
      .locator("video")
      .first()
      .evaluate((v) => (v as HTMLVideoElement).play());
    await page.waitForTimeout(1500);
    const before = await page
      .locator("video")
      .first()
      .evaluate((v) => (v as HTMLVideoElement).currentTime);

    await scrollTo(page, 1200);
    await page.waitForTimeout(1200);
    const after = await page
      .locator("video")
      .first()
      .evaluate((v) => (v as HTMLVideoElement).currentTime);

    // 元素没被换父重建 → 播放继续、时间只前进
    expect(after, "常驻后播放没有归零").toBeGreaterThanOrEqual(before);
    expect(
      await page
        .locator("video")
        .first()
        .evaluate((v) => (v as HTMLVideoElement).paused),
      "常驻后仍在播"
    ).toBe(false);
  });

  test("常驻时的退出出口：44×44 热区，点了就落回常规流", async ({ page, request }) => {
    await enterWatch(page, request);
    await scrollTo(page, 1200);

    const close = page.locator('[aria-label="关闭小窗播放"]');
    await expect(close, "常驻态给得出退出出口").toBeVisible({ timeout: 5000 });
    const box = (await close.boundingBox())!;
    expect(box.width, "退出按钮宽 ≥44px（旧小窗实测 24px）").toBeGreaterThanOrEqual(44);
    expect(box.height, "退出按钮高 ≥44px").toBeGreaterThanOrEqual(44);

    await close.click();
    await page.waitForTimeout(400);
    const col = await columnOf(page);
    expect(col?.position, "点过之后不再贴顶常驻").not.toBe("sticky");

    // 回到原位重新武装：贴顶常驻是「跟/不跟」的可逆状态，不是一次性的
    await scrollTo(page, 0);
    await scrollTo(page, 1200);
    expect((await columnOf(page))?.position, "回到原位后重新武装").toBe("sticky");
  });

  test("不压底栏、不引入横向溢出；四态里没有第二个贴底 fixed（INV-019）", async ({
    page,
    request,
  }) => {
    await enterWatch(page, request);
    await scrollTo(page, 1200);

    const tabBar = await boxOf(page, '[data-testid="mobile-tab-bar"]');
    const frame = await boxOf(page, "video");
    expect(frame.y + frame.height, "常驻的画框不越到移动底栏上沿以下").toBeLessThanOrEqual(
      tabBar.y + 1
    );

    const probe = await page.evaluate(() => {
      const fixedBottom: string[] = [];
      document.querySelectorAll("body *").forEach((el) => {
        const c = getComputedStyle(el);
        if (c.position === "fixed" && /px$/.test(c.bottom) && parseFloat(c.bottom) < 200) {
          fixedBottom.push(el.tagName + "." + String(el.className).slice(0, 40));
        }
      });
      return {
        fixedBottom,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        burnCount: document.querySelectorAll('[data-testid="burn-subtitle"]').length,
        burnWords: document.querySelectorAll(".burn-sub-word").length,
      };
    });
    expect(probe.fixedBottom, "底栏之外不许再有贴底 fixed 常驻件（INV-019）").toEqual([]);
    expect(probe.scrollWidth, "无横向溢出").toBeLessThanOrEqual(probe.clientWidth + 2);
    expect(probe.burnCount, "当前句在画面里只有一份（INV-021）").toBe(1);
    expect(probe.burnWords, "画面内点词热区还在").toBeGreaterThan(0);
  });
});

test.describe("390 / 414 两档复算（#30 的常驻形态在别的主流宽度也成立）", () => {
  test("390×812", async ({ page, request }) => {
    test.skip(!token, "no session");
    await page.setViewportSize({ width: 390, height: 812 });
    await enterWatch(page, request);
    const before = await boxOf(page, "video");
    await scrollTo(page, 1200);
    const frame = await boxOf(page, "video");
    const col = await columnOf(page);
    expect(col?.position, "滚过之后是 sticky").toBe("sticky");
    expect(frame.y, "画框顶仍贴壳顶").toBeLessThanOrEqual(before.y + 1);
    expect(frame.height, "画框高不变").toBeCloseTo(before.height, 0);
    expect(frame.width, "画框仍满宽").toBeCloseTo(390, 0);
    await expect(page.locator('[data-testid="burn-subtitle"]')).toHaveCount(1);
  });

  test("414×812", async ({ page, request }) => {
    test.skip(!token, "no session");
    await page.setViewportSize({ width: 414, height: 812 });
    await enterWatch(page, request);
    const before = await boxOf(page, "video");
    await scrollTo(page, 1200);
    const frame = await boxOf(page, "video");
    const col = await columnOf(page);
    expect(col?.position, "滚过之后是 sticky").toBe("sticky");
    expect(frame.y, "画框顶仍贴壳顶").toBeLessThanOrEqual(before.y + 1);
    expect(frame.height, "画框高不变").toBeCloseTo(before.height, 0);
    expect(frame.width, "画框仍满宽").toBeCloseTo(414, 0);
    await expect(page.locator('[data-testid="burn-subtitle"]')).toHaveCount(1);
  });
});

test.describe("桌面端不受影响（#30 只动 ≤1023px）", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("1280：滚过画框之后不出现贴顶常驻，也没有退出按钮", async ({ page, request }) => {
    await enterWatch(page, request);
    await scrollTo(page, 1200);
    const col = await columnOf(page);
    expect(col?.position, "桌面端不走移动端的常驻分支").not.toBe("sticky");
    await expect(page.locator('[aria-label="关闭小窗播放"]')).toHaveCount(0);
  });
});
