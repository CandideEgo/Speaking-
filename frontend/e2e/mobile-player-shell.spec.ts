/**
 * 移动端播放页壳层 —— DEC-069 / #31 的**页面级**验收（375 / 390 / 414 / 700 / 1280）。
 *
 * 背景（#24/#28 乙 → DEC-069 反转）：真机 414×896 首屏 776px 里，64px 顶栏全是全局噪音、
 * 355px 给了次要信息，文稿只剩 76px；而入画字幕还压在画框下沿盖住人物的脸。决议是把
 * 观看控制搬进**壳的顶栏与底栏**（`MainLayoutInner` 按 `pathname` 换），页面里只剩
 * 「画面 + 画面正下方的当前句卡」。
 *
 * 这条断言盯的就是那个形态：
 *   ① 画面出血满宽（x=0、w=视口宽）—— 首屏必须是画面，页头不占播放器上方的高度；
 *   ② 画框顶 = `main#main-scroll` 上沿 = 观看页顶栏（44px）的下沿；
 *   ③ 画框内**零文字、零覆盖物**（标题卡/返回键/级别药丸/入画字幕全删，判据 1）；
 *   ④ 露出画面 ≥120px（原型 128.9；修前 107.9）—— 现在量「画框顶到当前句卡顶」，
 *      因为压在画面下沿的入画字幕块已经不存在了。
 *
 * 与 mobile-inline-subtitle.spec.ts 的分工：那边管「当前句卡与点词」，这边管
 * 「画面本身在哪、多大，顶栏长什么样」。
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

const FRAME = '[data-testid="video-frame"]';
const TOP_BAR = '[data-testid="watch-top-bar"]';
const CARD = '[data-testid="current-sentence-card"]';

async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return box;
}

async function openWatch(
  page: Page,
  request: APIRequestContext,
  width: number,
  height: number,
  { firstVisit = false }: { firstVisit?: boolean } = {}
) {
  await page.setViewportSize({ width, height });
  // 所有移动端 spec 都靠这个标记跳过教程浮层 —— 于是「首访那一刻的移动端版式」零覆盖
  // （§7 补测点 9 就是补它，所以那一条走 firstVisit: true）。
  if (!firstVisit) {
    await page.addInitScript(() => window.localStorage.setItem("seeword_coach_done", "true"));
  }
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

  // 就绪门：画框 + 当前句卡（+ 移动端的壳两栏）。
  await expect(page.locator(FRAME)).toBeVisible({ timeout: 5000 });
  await expect(page.locator(CARD)).toBeVisible({ timeout: 5000 });
}

/**
 * 量一处移动端壳层：画框 / 壳顶 / 观看页顶栏 / 当前句卡 / 壳底栏 / 桌面页头 h1 /
 * 画框内文字与覆盖物。`--` 的读数全部走 `getBoundingClientRect()`。
 */
async function measure(page: Page, width: number) {
  const frame = await boxOf(page, FRAME);
  const shell = await page.evaluate(() => {
    const main = document.querySelector("main#main-scroll");
    const r = main?.getBoundingClientRect();
    return { mainTop: r ? +r.top.toFixed(1) : null };
  });
  const topBar = await boxOf(page, TOP_BAR);
  const card = await boxOf(page, CARD);
  const bottomBar = await page.locator('[data-testid="watch-bottom-bar"]').boundingBox();
  const frameText = (await page.locator(FRAME).innerText()).trim();
  const frameOverlays = await page.evaluate((sel) => {
    const f = document.querySelector(sel)!;
    return {
      title: f.querySelectorAll('[data-testid="frame-title"]').length,
      back: f.querySelectorAll('[data-testid="frame-back"]').length,
      level: f.querySelectorAll('[data-testid="level-selector"]').length,
      controls: f.querySelectorAll('[data-testid="controls-bar"]').length,
      thinProgress: f.querySelectorAll('[data-testid="thin-progress"]').length,
      burn: f.querySelectorAll('[data-testid="burn-subtitle"]').length,
    };
  }, FRAME);
  const h1Visible = await page
    .locator("h1")
    .first()
    .isVisible()
    .catch(() => false);

  const bottomBarTop = bottomBar ? bottomBar.y : null;
  // 露出画面 = 画框顶到「当前句卡顶」（DEC-069：压在下沿的入画字幕块没了，
  // 所以画面可见高度就是画框顶部到卡口这一段；两列布局与出血都不会改这个数）。
  const visiblePicture = card.y - frame.y;
  console.log(
    `[#31] ${width}× 画框 x=${frame.x.toFixed(1)} y=${frame.y.toFixed(1)} ` +
      `w=${frame.width.toFixed(1)} h=${frame.height.toFixed(1)} 壳顶=${shell.mainTop} ` +
      `顶栏=${topBar.height.toFixed(0)}px(下沿 ${(topBar.y + topBar.height).toFixed(1)}) ` +
      `当前句卡 y=${card.y.toFixed(1)} h=${card.height.toFixed(1)} ` +
      `露出画面=${visiblePicture.toFixed(1)} 底栏顶=${bottomBarTop === null ? "--" : bottomBarTop.toFixed(1)}`
  );
  return {
    frame,
    topBar,
    card,
    bottomBar,
    h1Visible,
    shell,
    frameText,
    frameOverlays,
    visiblePicture,
  };
}

test.describe("移动端首屏＝画面，控制进壳（#24/#28 乙 → DEC-069 的页面级版式）", () => {
  test("375×812：画面出血满宽、顶边贴壳顶、顶栏 44px、画框内零覆盖物、露出画面 ≥120px", async ({
    page,
    request,
  }) => {
    await openWatch(page, request, 375, 812);
    const m = await measure(page, 375);

    // ① 出血：与视口同宽、左边界 0（原型 375×210.9 的 16:9）
    expect(m.frame.x, "画框左边界贴 0（出血）").toBeCloseTo(0, 0);
    expect(m.frame.width, "画框与视口同宽").toBeCloseTo(375, 0);
    expect(m.frame.height, "16:9 全宽高度").toBeGreaterThan(205);

    // ② 贴壳顶：画框顶边 = 滚动容器顶边；而滚动容器顶边 = 观看页顶栏下沿（44）。
    expect(m.topBar.height, "观看页顶栏高 44px（DEC-069：64 → 44）").toBeCloseTo(44, 0);
    expect(m.frame.y, "画框顶边贴壳顶（页头不占首屏）").toBeCloseTo(m.shell.mainTop!, 0);
    expect(
      m.topBar.y + m.topBar.height,
      "壳顶 = 顶栏下沿（贴顶常驻的钉住位置随之 64 → 44）"
    ).toBeCloseTo(m.shell.mainTop!, 0);

    // ③ 顶栏内容：标题 + 返回 + 级别选择器（都从画面/页头搬上来）。
    await expect(page.locator('[data-testid="watch-top-title"]')).toBeVisible();
    expect(
      (await page.locator('[data-testid="watch-top-title"]').innerText()).length,
      "顶栏标题不是空的（观看页形态真的接通了 chrome）"
    ).toBeGreaterThan(0);
    await expect(page.locator('[data-testid="watch-top-back"]')).toBeVisible();
    await expect(page.locator(`${TOP_BAR} [data-testid="level-selector"]`)).toHaveCount(1);

    // ④ 画框内零文字、零覆盖物（判据 1）。级别药丸也从画面里搬走了。
    expect(m.frameText, "画框内零文字").toBe("");
    expect(m.frameOverlays, "画框内零覆盖物").toEqual({
      title: 0,
      back: 0,
      level: 0,
      controls: 0,
      thinProgress: 0,
      burn: 0,
    });
    // 移动动作行（来源/版权/动作）整块搬进 ⋯ 面板，首屏不再有这块次要信息。
    await expect(page.locator('[data-testid="mobile-actions"]')).toHaveCount(0);

    // ⑤ 露出画面 ≥120px（原型 128.9；修前 107.9）
    expect(m.visiblePicture, "露出画面不少于 120px").toBeGreaterThanOrEqual(120);

    // ⑥ 当前句卡在画面正下方，且整块在可视区内（判据 2 的一半）。
    const innerHeight = await page.evaluate(() => window.innerHeight);
    expect(m.bottomBar, "375 档壳底栏在").not.toBeNull();
    expect(m.card.y, "当前句卡在画框下沿之下").toBeGreaterThanOrEqual(
      m.frame.y + m.frame.height - 1
    );
    expect(m.card.y + m.card.height, "当前句卡整块在可视区内").toBeLessThanOrEqual(innerHeight);
    expect(m.card.y + m.card.height, "当前句卡不压壳底栏").toBeLessThanOrEqual(m.bottomBar!.y + 1);

    // ⑦ 不引入横向溢出（w-screen 出血最容易在这里翻车）
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test("390 / 414 两档同样出血满宽、顶边贴壳顶、露出画面 ≥120px", async ({ page, request }) => {
    for (const w of [390, 414]) {
      await openWatch(page, request, w, 812);
      const m = await measure(page, w);
      expect(m.frame.x, `${w} 档出血`).toBeCloseTo(0, 0);
      expect(m.frame.width, `${w} 档与视口同宽`).toBeCloseTo(w, 0);
      expect(m.frame.y, `${w} 档画框贴壳顶`).toBeCloseTo(m.shell.mainTop!, 0);
      expect(m.topBar.height, `${w} 档顶栏仍是 44px`).toBeCloseTo(44, 0);
      expect(m.visiblePicture, `${w} 档露出画面不少于 120px`).toBeGreaterThanOrEqual(120);
      expect(m.frameText, `${w} 档画框内零文字`).toBe("");
    }
  });

  /**
   * §7 补测点 5：375×812 只是「地址栏收起」档。真机地址栏展开时可视高就是 750 / 700
   * 这一带 —— 首屏版式（画框贴壳顶 + 露出画面 ≥120px + 完整底栏）必须在那一档也成立，
   * 否则「首屏就是画面」只在实验室里成立。
   */
  test("375×700（地址栏展开档）画框仍贴壳顶、露出画面仍 ≥120px、底栏完整", async ({
    page,
    request,
  }) => {
    await openWatch(page, request, 375, 700);
    const m = await measure(page, 375);

    expect(m.frame.x, "700 档出血").toBeCloseTo(0, 0);
    expect(m.frame.width, "700 档与视口同宽").toBeCloseTo(375, 0);
    expect(m.frame.y, "700 档画框贴壳顶（页头仍不占首屏）").toBeCloseTo(m.shell.mainTop!, 0);
    expect(m.visiblePicture, "700 档露出画面不少于 120px").toBeGreaterThanOrEqual(120);

    // 底栏在这一档仍完整贴住可视区底边（判据 2 的「完整底栏」）。
    const innerHeight = await page.evaluate(() => window.innerHeight);
    expect(m.bottomBar, "700 档壳底栏在").not.toBeNull();
    expect(
      Math.abs(m.bottomBar!.y + m.bottomBar!.height - innerHeight),
      "700 档底栏贴底"
    ).toBeLessThanOrEqual(1);
    expect(m.card.y + m.card.height, "700 档当前句卡不压底栏").toBeLessThanOrEqual(
      m.bottomBar!.y + 1
    );

    // 短视口最容易翻车的地方：画框 + 当前句卡一起把文档撑出可视区。
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollHeight - root.clientHeight;
    });
    expect(overflow, "700 档文档无溢出").toBeLessThanOrEqual(1);
  });

  /**
   * §7 补测点 9：**首访那一刻**的移动端版式此前零覆盖 —— 所有移动端 spec
   * 都用 `seeword_coach_done=true` 跳过教程，而教程浮层是 `fixed inset-0 z-[100]`，
   * 真机上它就是第一屏。这一条走真实首访：浮层必须是全屏 dialog，跳过之后
   * 当前句卡的词**立刻**存在且可点（不是等一帧、等一次滚动），壳底栏也必须在。
   */
  test("首访：教程浮层是全屏 dialog；点「跳过教程」后当前句卡的词热区立刻可点、底栏已在", async ({
    page,
    request,
  }) => {
    await openWatch(page, request, 375, 812, { firstVisit: true });

    const tour = page.locator('[role="dialog"][aria-label="新手引导"]');
    await expect(tour, "首访要给出教程浮层").toBeVisible({ timeout: 10000 });

    // ① 它是**全屏**的：浮层矩形覆盖整个可视区（真机上它就是第一屏）。
    const box = (await tour.boundingBox())!;
    expect(box.x, "教程浮层左边界").toBeCloseTo(0, 0);
    expect(box.y, "教程浮层上边界").toBeCloseTo(0, 0);
    expect(box.width, "教程浮层覆盖视口宽").toBeCloseTo(375, 0);
    expect(box.height, "教程浮层覆盖视口高").toBeCloseTo(812, 0);

    // ② 跳过之后：当前句卡的词热区立刻在，且真的可点（能开出词卡）；壳底栏也在。
    await page.getByRole("button", { name: "跳过教程" }).click();
    await expect(tour).toHaveCount(0);
    await expect(page.locator('[data-testid="watch-bottom-bar"]')).toBeVisible();
    const words = page.locator(`${CARD} .now-sub-word`);
    expect(await words.count(), "跳过教程后点词热区立刻存在").toBeGreaterThan(0);
    await words.first().click({ timeout: 5000 });
    await expect(page.locator('[data-testid="word-tooltip"]')).toBeVisible({ timeout: 10000 });
  });

  // 旧实现在画面里画了一层返回键（`frame-back`），而 `VideoControls` 的面层也是 `z-10`
  // 且整块 `inset-0` 接指针、在 DOM 里更靠后 —— 同层靠后者胜，返回键被整块吞掉，
  // 症状不是「点了没反应」而是「点了出控制条」。
  // DEC-069 把返回键搬进壳顶栏（`watch-top-back`），画面里不再有覆盖层；这条断言盯的是
  // **新出口**：中心点上命中的必须是它自己，Playwright 的可点性检查（自动 hit-target 校验）
  // 必须放行，点下去真的离开播放页。
  test("顶栏的返回键真的可点：44×44、中心命中自己、点了就离开播放页", async ({ page, request }) => {
    await openWatch(page, request, 375, 812);

    const back = page.locator('[data-testid="watch-top-back"]');
    await expect(back).toBeVisible();

    const hit = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="watch-top-back"]') as HTMLElement;
      const r = b.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        self: el === b || b.contains(el),
        got: el ? `${el.tagName}.${String(el.className).slice(0, 40)}` : "null",
        rect: [r.left, r.top, r.width, r.height].map((n) => Math.round(n)),
      };
    });
    expect(hit.self, `返回键中心命中的是 ${hit.got}，不是它自己`).toBe(true);
    expect(hit.rect[2], "返回键宽 ≥44px").toBeGreaterThanOrEqual(44);
    expect(hit.rect[3], "返回键高 ≥44px").toBeGreaterThanOrEqual(44);

    // 历史里上一页是登录后的 "/"（`loginViaToken`）→ `router.back()` 应离开 /watch。
    await back.click({ timeout: 5000 });
    await page.waitForURL((url) => !url.pathname.startsWith("/watch/"), { timeout: 10000 });
  });
});

test.describe("桌面端不受影响（壳层改动只动 ≤1023px）", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("1280：页头仍在播放器上方，画框不出血、仍圆角；没有观看页两栏", async ({
    page,
    request,
  }) => {
    await openWatch(page, request, 1280, 900);
    const frame = await boxOf(page, FRAME);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator('[data-testid="frame-title"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="mobile-actions"]')).toHaveCount(0);
    await expect(page.locator(TOP_BAR)).toHaveCount(0);
    await expect(page.locator('[data-testid="watch-bottom-bar"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="burn-subtitle"]')).toHaveCount(0);
    // 桌面端画框在 1280 容器里（不是出血），且页头把它压在下面
    expect(frame.x, "桌面画框有左内边距").toBeGreaterThan(8);
    expect(frame.width, "桌面画框不满宽").toBeLessThan(1000);
    expect(frame.y, "桌面画框在页头之下").toBeGreaterThan(80);
  });
});
