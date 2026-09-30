/**
 * #27 词卡贴画面下沿 + #26 跟读底部抽屉 —— 两条决议在 app 里的毕业物验收（375×812）。
 *
 * 断言的是决议里写死的那几个数，不是「看起来差不多」：
 *   ① #27 复议后的卡口：词卡顶边 = 画框下沿 → 压不到刚点的那句（0px 盖住画面）
 *   ② 词卡高度随内容、底边不越过移动底栏上沿（不铺满屏，原型 W2-edge 的形态），
 *      「加入词库」默认不自动关
 *   ③ #26 硬约束：抽屉展开前后播放器几何一像素不动
 *   ④ 抽屉顶边同样不越过画框下沿（半屏 400px 与「不压画面」取更靠下的一条）
 *   ⑤ 抽屉里真的有「要跟读的这一句」、有计时（现状缺口：seconds 从来没画出来）
 *   ⑥ 动作行一律 44px；把手下拉 > 64px 关抽屉
 *   ⑦ 自动推进默认关
 *
 * 需要本地库里有**真能播**的视频：CI seed 的 `/media/<id>.mp4` 是占位 URL（404），
 * 这种情况下和 mobile-inline-subtitle.spec.ts 一样 skip，而不是在几何断言上失败。
 *
 * 运行：npx playwright test e2e/mobile-wordcard-drawer.spec.ts --project=chromium
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { registerUserViaApi, loginViaToken, uniquePhone } from "./helpers";

const PHONE = uniquePhone();
let token = "";

test.use({ viewport: { width: 375, height: 812 } });
// 串行：fullyParallel 会把同一文件的用例分到不同 worker，各自跑一遍 beforeAll，
// 而 dev 后端对短信发码/注册有按 IP 的限流。
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  ({ token } = await registerUserViaApi(request, PHONE));
});

/** 假麦克风：MediaRecorder 一 stop 就交出一小段 blob，足以走完 listening → reviewing。 */
async function mockMic(page: Page) {
  await page.addInitScript(() => {
    const track = { stop() {}, kind: "audio" };
    const fakeStream = { getTracks: () => [track] } as unknown as MediaStream;
    navigator.mediaDevices.getUserMedia = async () => fakeStream;

    class FakeMediaRecorder {
      state = "inactive";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      static isTypeSupported() {
        return true;
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
        });
        this.onstop?.();
      }
    }
    Object.defineProperty(window, "MediaRecorder", {
      value: FakeMediaRecorder,
      configurable: true,
    });
  });
}

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

/** 登录 → 打开第一条 ready 视频 → 退出迷你窗 → 等到真能播。返回画框与底栏几何。 */
async function enterWatch(page: Page, request: APIRequestContext) {
  // D2 教程浮层会盖住画面：直接用 app 自己的「看过了」标记关掉。
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

  // 375×812 下画框顶已经越过 useStickyPip 的观察带，进页面就是迷你窗（既有行为，见 #30）：
  // 照真人的做法点 X 退出小窗，再量内联播放器。
  const pipClose = page.locator('[aria-label="关闭小窗播放"]');
  if (await pipClose.isVisible({ timeout: 1500 }).catch(() => false)) {
    await pipClose.click();
    await page.waitForTimeout(500);
  }
  await expect(page.locator('[data-testid="controls-bar"]')).toHaveCount(1);

  const frame = await boxOf(page, "video");
  // 桌面端底栏是 md:hidden，量不到盒子（调用方只在移动端用这个读数）。
  const tabBar = await page.locator('[data-testid="mobile-tab-bar"]').boundingBox();
  return { frame, tabBar };
}

test("① 词卡贴画框下沿升起：压不到刚点的那句，高度随内容、不铺满屏", async ({ page, request }) => {
  const { frame, tabBar } = await enterWatch(page, request);
  expect(tabBar).not.toBeNull();
  const frameBottom = frame.y + frame.height;
  const subtitleBottom = (await boxOf(page, '[data-testid="burn-subtitle"]')).y;

  await page.locator('[data-testid="burn-subtitle"] .burn-sub-word').first().click();
  const card = await boxOf(page, '[data-testid="word-tooltip"][data-variant="sheet"]');

  // 卡口 = 画面下沿：顶边落在字幕块下沿/画框下沿附近，且**绝不**压进画面。
  expect(card.y, "词卡顶边不高于画框下沿").toBeGreaterThanOrEqual(frameBottom - 1.5);
  expect(card.y, "词卡顶边贴着画面下沿（不是又一条断层）").toBeLessThanOrEqual(frameBottom + 2);
  expect(card.y, "词卡顶边在入画字幕之下").toBeGreaterThan(subtitleBottom);
  expect(card.height, "词卡有实际高度").toBeGreaterThan(200);
  expect(card.x, "词卡出血到屏宽两侧").toBeCloseTo(0, 0);
  expect(card.width).toBeCloseTo(375, 0);
  // 高度随内容（原型 W2-edge：只给 top、卡高由内容决定，max-height 封顶）：
  // 底边**不**钉在底栏上沿，而是内容多高就多高，底下的文稿列表仍看得见。
  expect(card.y + card.height, "词卡底边不越过移动底栏上沿").toBeLessThanOrEqual(tabBar!.y + 2);
  expect(card.y + card.height, "词卡没铺满到只剩一条缝（内容高 vs 拉满）").toBeLessThan(
    tabBar!.y - 80
  );
  console.log(
    `[#27] 375×812 画框底=${frameBottom.toFixed(1)} 入画字幕顶=${subtitleBottom.toFixed(1)} ` +
      `词卡 top=${card.y.toFixed(1)} h=${card.height.toFixed(1)} 底栏顶=${tabBar!.y.toFixed(1)}`
  );

  // 「加入词库」默认不自动关（#27 ③）—— 不管保存成功失败，词卡都还在。
  await page.getByRole("button", { name: "加入词库" }).click();
  await page.waitForTimeout(600);
  await expect(page.locator('[data-testid="word-tooltip"][data-variant="sheet"]')).toBeVisible();

  // 关掉：浮层消失。
  await page
    .locator('[data-testid="word-tooltip"][data-variant="sheet"] [aria-label="关闭"]')
    .click();
  await expect(page.locator('[data-testid="word-tooltip"]')).toHaveCount(0);

  // 不引入横向溢出。
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
});

test("③④⑤⑥⑦ 跟读底部抽屉：播放器不动、顶边不越画框、计时/44px/下拉关闭/自动推进默认关", async ({
  page,
  request,
}) => {
  await mockMic(page);
  const { frame, tabBar } = await enterWatch(page, request);
  expect(tabBar).not.toBeNull();
  const frameBottom = frame.y + frame.height;

  const sentence = (await page.locator('[data-testid="burn-subtitle-en"]').innerText()).trim();

  await page.getByRole("button", { name: "录音", exact: true }).click();
  const drawer = page.locator('[data-testid="shadowing-drawer"]');
  await expect(drawer).toBeVisible({ timeout: 5000 });

  // ③ 硬约束：展开前后播放器几何不动。
  const frameAfter = await boxOf(page, "video");
  expect(Math.abs(frameAfter.y - frame.y), "抽屉展开后画框顶不动").toBeLessThanOrEqual(1);
  expect(Math.abs(frameAfter.height - frame.height), "抽屉展开后画框高不动").toBeLessThanOrEqual(1);

  const d = await boxOf(page, '[data-testid="shadowing-drawer"]');
  // ④ 顶边绝不越过画框下沿（压住入画字幕就是违约）。
  expect(d.y, "抽屉顶边不高于画框下沿").toBeGreaterThanOrEqual(frameBottom - 1.5);
  expect(Math.abs(d.y + d.height - tabBar!.y), "抽屉底边贴移动底栏上沿").toBeLessThanOrEqual(2);
  expect(d.height, "抽屉是半屏档（400px 封顶，短视口下自动落档）").toBeLessThanOrEqual(401);
  console.log(
    `[#26] 375×812 抽屉 top=${d.y.toFixed(1)} h=${d.height.toFixed(1)} ` +
      `画框底=${frameBottom.toFixed(1)} 底栏顶=${tabBar!.y.toFixed(1)} ` +
      `画框展开前 y=${frame.y.toFixed(1)} h=${frame.height.toFixed(1)} / 后 y=${frameAfter.y.toFixed(1)} h=${frameAfter.height.toFixed(1)}`
  );

  // ⑤ 抽屉顶边第一件事是钉住「要跟读的这一句」。
  await expect(page.locator('[data-testid="drawer-sentence-en"]')).toHaveText(sentence);

  // ⑤ 计时：录制中必须把秒数画出来（现状缺口）。
  const timer = page.locator('[data-testid="recording-timer"]');
  await expect(timer).toBeVisible({ timeout: 5000 });
  await expect(timer).toHaveText(/^\d+:\d{2}$/);

  // ⑦ 自动推进默认关。
  await expect(page.locator('[data-testid="auto-advance"]')).toHaveAttribute(
    "aria-checked",
    "false"
  );

  // 录音 → 回放态（#26 记的「e2e 从没跑到回放态」这一条）。
  await page.getByRole("button", { name: "停止录音" }).click();
  await expect(page.getByRole("button", { name: "重录" })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("button", { name: "满意" })).toBeVisible();
  await expect(page.getByRole("button", { name: "下一句" })).toBeVisible();

  // ⑥ 动作行一律 44px 触控目标。
  const actions = page.locator('[data-testid="drawer-actions"] button');
  const count = await actions.count();
  expect(count).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < count; i++) {
    const b = await actions.nth(i).boundingBox();
    expect(b, `drawer action #${i}`).not.toBeNull();
    expect(b!.height, `抽屉动作 ${i} 触控目标高度`).toBeGreaterThanOrEqual(44);
  }

  // ⑥ 把手下拉 > 64px 关抽屉（#26 决议④，也是 #29 手势集要认的那一条）。
  // 先过一遍 390 / 414 档（#28 决议量过这三档）：换尺寸后抽屉要重算顶边，仍不压画面。
  for (const [w, h] of [
    [390, 844],
    [414, 896],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    const f = await boxOf(page, "video");
    const dd = await boxOf(page, '[data-testid="shadowing-drawer"]');
    const bar = await boxOf(page, '[data-testid="mobile-tab-bar"]');
    expect(dd.y, `${w} 档抽屉顶边不越画框下沿`).toBeGreaterThanOrEqual(f.y + f.height - 1.5);
    expect(Math.abs(dd.y + dd.height - bar.y), `${w} 档抽屉底边贴底栏`).toBeLessThanOrEqual(2);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(400);

  const grab = await boxOf(page, '[data-testid="shadowing-drawer-grab"]');
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await page.mouse.down();
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2 + 140, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('[data-testid="shadowing-drawer"]')).toHaveCount(0);

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
});

test.describe("桌面端不受影响", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("1280 宽：词卡仍是可拖动浮动卡，跟读仍在字幕卡里就地展开", async ({ page, request }) => {
    await enterWatch(page, request);

    // 桌面端当前句在字幕卡里（INV-021），点词出的是浮动卡而不是浮层。
    await page.locator(".now-sub-en .now-sub-word").first().click();
    await expect(page.locator('[data-testid="word-tooltip"][data-variant="floating"]')).toBeVisible(
      {
        timeout: 10000,
      }
    );
    await expect(page.locator('[data-testid="word-tooltip"][data-variant="sheet"]')).toHaveCount(0);

    // 桌面端没有跟读抽屉。
    await expect(page.locator('[data-testid="shadowing-drawer"]')).toHaveCount(0);
  });
});
