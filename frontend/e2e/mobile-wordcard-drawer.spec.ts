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
 * 另含 Destination §7 的补测点（编号带 `§7-` 前缀，与上面 ①③… 是两套编号）：
 *  §7-6 / §7-6b 词卡落档的两支（375×600 走「画框下沿」支；落档支只在视口高 < ~560px
 *  激活，375×480 实测卡片抬进画面 79.9px —— 该区与 INV-022 的冲突归 #25，见 §7-6b 注释）、
 *  §7-7 被点的那**一个词**不被盖、§7-8 计时真的在走、§7-10 常驻态下的词卡与抽屉、
 *  §7-11 词卡把手 >64px 关 / <64px 不关。
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

  // #30 之后「进页面即迷你窗」这一态已经不存在（跟随时画框贴顶常驻、退出口 44×44），
  // 这里原来那套「先点 X 退出小窗」的 workaround 一并删掉 —— 留着它只会在真的回归时
  // 静默把状态盖掉；改成正面断言首屏**没有**跟随态。
  await expect(page.locator('[aria-label="关闭小窗播放"]')).toHaveCount(0);
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

/** 滚到画面贴顶常驻那一态（判据是零高度哨兵越过滚动容器顶边，见 INV-023）。 */
async function scrollToSticky(page: Page, top = 700) {
  await page.evaluate((y) => {
    const main = document.querySelector("main#main-scroll");
    if (main) main.scrollTop = y;
  }, top);
  await page.waitForTimeout(600);
  await expect(page.locator('[aria-label="关闭小窗播放"]')).toBeVisible({ timeout: 5000 });
}

/**
 * Destination §7 补测点 6：`WordCardSheet.tsx` 的落档公式
 * `top = max(8, min(画框下沿, 底栏顶 − 240))` 此前一条断言都没有 —— 812 档永远走
 * 「画框下沿」那一支，落档那一支从没被执行过。
 *
 * 实测（本轮探针）：落档**只在视口高 < 560px 时**才激活 —— 375×600 的底栏顶 555、
 * `555−240 = 315 > 画框底 274.9`，仍然走画框下沿那一支（§7 那条「375×600 触发落档」
 * 的推测不成立，实测阈值见下一条）。所以这条在 600 档量的是**正支**：
 * 顶边 = 画框下沿 ⇒ 压不到刚点的那句（#27 的硬约束），卡底不越底栏。
 */
test("§7-6 短视口（375×600）下词卡仍走画框下沿那一支：顶边 = 画框下沿、卡底不越底栏", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 600 });
  const { frame, tabBar } = await enterWatch(page, request);
  expect(tabBar).not.toBeNull();
  const frameBottom = frame.y + frame.height;
  // 前提：这一档还没进落档区（进了的话下面那条断言就成了在量另一支）。
  expect(tabBar!.y - 240, "375×600 仍在落档阈值之上").toBeGreaterThan(frameBottom);

  const word = page.locator('[data-testid="burn-subtitle"] .burn-sub-word').first();
  const wordBox = (await word.boundingBox())!;
  await word.click();
  const card = await boxOf(page, '[data-testid="word-tooltip"][data-variant="sheet"]');

  console.log(
    `[#27] 375×600 画框底=${frameBottom.toFixed(1)} 底栏顶=${tabBar!.y.toFixed(1)} ` +
      `词卡 top=${card.y.toFixed(1)} h=${card.height.toFixed(1)}`
  );
  expect(card.y, "词卡顶边 = 画框下沿（0 断层）").toBeCloseTo(frameBottom, 0);
  expect(card.y, "词卡压不到被点的那个词").toBeGreaterThanOrEqual(wordBox.y + wordBox.height - 1);
  expect(card.y + card.height, "词卡底边不越过移动底栏上沿").toBeLessThanOrEqual(tabBar!.y + 2);
});

/**
 * 落档区（视口高 < ~560px，含**横屏**）的实测刻画 —— 这一档没有决议，只锁当前行为。
 *
 * 实测：375×480 → `top = 435−240 = 195`（画框底 274.9），卡片从画面里 195 起、高 240；
 * 入画字幕块是 189.9..272 ⇒ **整句被卡片盖住**。667×375（横屏）→ 画框 64..439.2 比屏幕
 * 还高、底栏顶 330，`top = 330−240 = 90`。
 *
 * 为什么不能简单按 INV-022 的「绝不压进画面」把顶边压回画框下沿：横屏下画框底
 * （439.2）本身就在底栏顶（330）**之下**，压回去等于卡片高度 0 —— 词卡直接消失。
 * 也就是说 `min(...)` 这一支是「画框根本装不下时保住 240px 卡片」的兜底。
 * 这条冲突（永不盖住刚点的那句 ↔ 卡片始终可用）**归 #25（全屏与方向策略）**：
 * 横屏要不要走移动版式本身还没拍。若将来按 INV-022 压回画框下沿，这条会红 —— 那是决议，
 * 请连 INV-022 与本节一起改，不是把断言改绿。
 */
test("§7-6b 落档区（375×480）实测刻画：卡片抬进画面 79.9px 以保住 240px 高（#25 待定）", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 480 });
  const { frame, tabBar } = await enterWatch(page, request);
  expect(tabBar).not.toBeNull();
  const frameBottom = frame.y + frame.height;
  const burn = await boxOf(page, '[data-testid="burn-subtitle"]');

  await page.locator('[data-testid="burn-subtitle"] .burn-sub-word').first().click();
  const card = await boxOf(page, '[data-testid="word-tooltip"][data-variant="sheet"]');
  console.log(
    `[#27] 375×480 画框底=${frameBottom.toFixed(1)} 字幕块=${burn.y.toFixed(1)}..${(burn.y + burn.height).toFixed(1)} ` +
      `底栏顶=${tabBar!.y.toFixed(1)} 词卡 top=${card.y.toFixed(1)} h=${card.height.toFixed(1)}`
  );

  expect(card.y, "落档：顶边 = 底栏顶 − 240").toBeCloseTo(tabBar!.y - 240, 0);
  expect(card.height, "落档：卡片仍保住 240px").toBeCloseTo(240, 0);
  expect(card.y + card.height, "底边仍贴底栏上沿").toBeLessThanOrEqual(tabBar!.y + 2);
  // 代价照账：这一档卡片确实压进了画面（INV-022 的「绝不压进画面」在此让位给卡片可用性）。
  expect(card.y, "落档区的代价：顶边已经高过画框下沿").toBeLessThan(frameBottom - 1);
  expect(card.y, "落档区的代价：连入画字幕都被盖住").toBeLessThan(burn.y + burn.height);
});

/**
 * Destination §7 补测点 7：#27 的硬约束是「压不到刚点的那句」，上面几条用**画框下沿**
 * 做代理量它。这条直接盯被点的那**一个词**：卡片顶边 ≥ 那个词的底边。
 */
test("§7-7 词卡压不到刚点的那个词：卡顶 ≥ 被点词的底边", async ({ page, request }) => {
  const { frame } = await enterWatch(page, request);
  const frameBottom = frame.y + frame.height;

  const word = page.locator('[data-testid="burn-subtitle"] .burn-sub-word').nth(2);
  const wordBox = (await word.boundingBox())!;
  expect(wordBox.y + wordBox.height, "被点的词在画面内").toBeLessThanOrEqual(frameBottom + 1);

  await word.click();
  const card = await boxOf(page, '[data-testid="word-tooltip"][data-variant="sheet"]');
  expect(
    card.y,
    `卡顶 ${card.y.toFixed(1)} 与被点词底 ${(wordBox.y + wordBox.height).toFixed(1)}`
  ).toBeGreaterThanOrEqual(wordBox.y + wordBox.height - 1);
});

/**
 * Destination §7 补测点 8：计时**在走**。此前只断言格式 `^\d+:\d{2}$` —— 一个恒为
 * `0:00` 的僵尸计时器也能过，而「seconds 从来没画出来」正是本轮点名的旧缺口。
 */
test("§7-8 跟读计时真的在走：1.3s 后读数前进", async ({ page, request }) => {
  await mockMic(page);
  await enterWatch(page, request);
  await page.getByRole("button", { name: "录音", exact: true }).click();
  const timer = page.locator('[data-testid="recording-timer"]');
  await expect(timer).toBeVisible({ timeout: 5000 });

  const read = async () => {
    const [m, s] = (await timer.innerText()).trim().split(":");
    return Number(m) * 60 + Number(s);
  };
  const before = await read();
  await page.waitForTimeout(1300);
  const after = await read();
  console.log(`[#26] 计时 ${before}s → ${after}s`);
  expect(after, "计时器必须真的在推进（恒 0:00 不算通过）").toBeGreaterThan(before);
});

/**
 * Destination §7 补测点 10：**常驻态下的浮层卡口**。`mobile-pip-scroll.spec.ts` 覆盖了
 * 常驻形态本身，但没覆盖常驻态里的词卡 / 抽屉 —— 而 `useSheetGeometry` 的锚点是画框
 * rect，常驻时它就是另一条线（贴顶那一版），最容易漏。
 *
 * 抽屉那半边的顺序反过来（先开抽屉、再滚到常驻）：跟读入口在字幕卡里，常驻之后它被
 * 粘在顶上的画框盖住，Playwright 点它会先把页面滚回去 —— 那样量的就不是常驻态了。
 */
test("§7-10 常驻态下的词卡与抽屉：都贴着**常驻**画框的下沿，且不盖底栏", async ({
  page,
  request,
}) => {
  await mockMic(page);
  const { tabBar } = await enterWatch(page, request);
  expect(tabBar).not.toBeNull();

  // (a) 词卡：先滚到常驻，再点画面里的词。
  await scrollToSticky(page);
  const stuck = await boxOf(page, "video");
  const stuckBottom = stuck.y + stuck.height;

  await page.locator('[data-testid="burn-subtitle"] .burn-sub-word').first().click();
  const card = await boxOf(page, '[data-testid="word-tooltip"][data-variant="sheet"]');
  console.log(
    `[#27] 常驻态 画框顶=${stuck.y.toFixed(1)} 底=${stuckBottom.toFixed(1)} ` +
      `词卡 top=${card.y.toFixed(1)} h=${card.height.toFixed(1)} 底栏顶=${tabBar!.y.toFixed(1)}`
  );
  expect(card.y, "常驻态词卡顶边 = 常驻画框下沿（0 断层）").toBeGreaterThanOrEqual(
    stuckBottom - 1.5
  );
  expect(card.y, "常驻态词卡顶边没掉到画框下面去").toBeLessThanOrEqual(stuckBottom + 2);
  expect(card.y + card.height, "常驻态词卡底边不越底栏").toBeLessThanOrEqual(tabBar!.y + 2);
  await page
    .locator('[data-testid="word-tooltip"][data-variant="sheet"] [aria-label="关闭"]')
    .click();
  await expect(page.locator('[data-testid="word-tooltip"]')).toHaveCount(0);

  // (b) 抽屉：入口在常驻时被画框盖住 → 先开抽屉，再滚到常驻。
  await page.evaluate(() => {
    const main = document.querySelector("main#main-scroll");
    if (main) main.scrollTop = 0;
  });
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "录音", exact: true }).click();
  await expect(page.locator('[data-testid="shadowing-drawer"]')).toBeVisible({ timeout: 5000 });
  await scrollToSticky(page);

  const stuck2 = await boxOf(page, "video");
  const drawer = await boxOf(page, '[data-testid="shadowing-drawer"]');
  const bar = await boxOf(page, '[data-testid="mobile-tab-bar"]');
  console.log(
    `[#26] 常驻态 画框底=${(stuck2.y + stuck2.height).toFixed(1)} ` +
      `抽屉 top=${drawer.y.toFixed(1)} 底=${(drawer.y + drawer.height).toFixed(1)} 底栏顶=${bar.y.toFixed(1)}`
  );
  expect(drawer.y, "常驻态抽屉顶边不越过常驻画框下沿").toBeGreaterThanOrEqual(
    stuck2.y + stuck2.height - 1.5
  );
  expect(Math.abs(drawer.y + drawer.height - bar.y), "常驻态抽屉底边仍贴底栏").toBeLessThanOrEqual(
    2
  );
  // 常驻之后画框没缩、没跑：否则上面那条「不越画框下沿」就成了一句空话。
  expect(stuck2.y, "常驻态画框仍贴壳顶").toBeLessThan(stuck.y + 2);
  expect(stuck2.height, "常驻态画框高不变").toBeCloseTo(stuck.height, 0);
});

/**
 * Destination §7 补测点 11：词卡把手下拉。抽屉那条已经有（见上一条 spec 的 ⑥），
 * 但 `word-card-grab` 这个 testId **没有任何用例引用** —— 两条把手走的是同一份
 * `SheetHandle`，漏测了一半：>64px 关、<64px 不关。
 */
test("§7-11 词卡把手：下拉 >64px 关掉，<64px 不关", async ({ page, request }) => {
  await enterWatch(page, request);
  const card = () => page.locator('[data-testid="word-tooltip"][data-variant="sheet"]');
  const dragHandle = async (dy: number) => {
    const grab = (await boxOf(page, '[data-testid="word-card-grab"]'))!;
    await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
    await page.mouse.down();
    await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2 + dy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  };

  await page.locator('[data-testid="burn-subtitle"] .burn-sub-word').first().click();
  await expect(card()).toBeVisible({ timeout: 10000 });

  // <64px：拉一把但不到阈值 —— 卡还在（松手回弹）。
  await dragHandle(40);
  await expect(card(), "下拉 40px 不该关掉词卡").toHaveCount(1);

  // >64px：过阈值即关。
  await dragHandle(140);
  await expect(card(), "下拉 140px 应该关掉词卡").toHaveCount(0);
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
