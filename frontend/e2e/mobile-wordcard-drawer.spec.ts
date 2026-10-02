/**
 * #27 词卡贴画面下沿 + #26 跟读底部抽屉 —— 两条决议在 app 里的毕业物验收（375×812），
 * DEC-069 / #31 换锚点之后的版本。
 *
 * 断言的是决议里写死的那几个数，不是「看起来差不多」：
 *   ① #27 复议后的卡口：词卡顶边 = 画框下沿
 *   ② 词卡高度随内容、底边不越过**壳底栏**上沿（观看页形态 = `WatchBottomBar`），
 *      「加入词库」默认不自动关
 *   ③ #26 硬约束：抽屉展开前后播放器几何一像素不动
 *   ④ 抽屉顶边不越过画框下沿（半屏 400px 与「不压画面」取更靠下的一条）
 *   ⑤ 抽屉里真的有「要跟读的这一句」、有计时
 *   ⑥ 动作行一律 44px；把手下拉 > 64px 关抽屉
 *   ⑦ 自动推进默认关
 *
 * DEC-069 换掉的两处锚点（本文件随之改）：
 *   · **点词热区**从画框里的入画字幕搬到画面正下方的当前句卡（`.now-sub-word` 仍在，
 *     只是宿主换成 `[data-testid="current-sentence-card"]`；画面里零文字）；
 *   · **跟读入口**从字幕卡的「录音」按钮搬到壳底栏的 `[data-testid="watch-shadowing"]`，
 *     抽屉里那句也从 `[data-testid="current-sentence-en"]` 读。
 *
 * 另含 Destination §7 的补测点（编号带 `§7-` 前缀，与上面 ①③… 是两套编号）：
 *  §7-6 / §7-6b 词卡落档的两支、§7-7 被点的那**一个词**、§7-8 计时真的在走、
 *  §7-10 常驻态下的抽屉、§7-11 词卡把手 >64px 关 / <64px 不关。
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

const FRAME = '[data-testid="video-frame"]';
const CARD = '[data-testid="current-sentence-card"]';
const WORD_SHEET = '[data-testid="word-tooltip"][data-variant="sheet"]';

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
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return box;
}

/** 登录 → 打开第一条 ready 视频 → 等到真能播。返回画框与**壳底栏**几何。 */
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

  // 旧的「先点 X 退出小窗」workaround 与「没有跟随态」断言随 X 一起删（DEC-069）：
  // 现在正面断言壳两栏在不在一起（首屏本来就该是内联形态）。
  await expect(page.locator(FRAME)).toBeVisible({ timeout: 5000 });
  await expect(page.locator(CARD)).toBeVisible({ timeout: 5000 });
  // 桌面端 `WatchBottomBar` 自己渲染 null → 量不到盒子，调用方按需断言非空。
  // 注意先 `count()` 再量：`locator.boundingBox()` 会先等元素出现，元素**永远不渲染**
  // 时它一路等到 60s 测试超时（桌面那条就是这样红掉的），`count()` 不会等。
  const barCount = await page.locator('[data-testid="watch-bottom-bar"]').count();
  const bottomBar =
    barCount > 0 ? await page.locator('[data-testid="watch-bottom-bar"]').boundingBox() : null;

  const frame = await boxOf(page, FRAME);
  return { frame, bottomBar };
}

/** 当前句卡里点一个词并等词卡升起（DEC-069 之后唯一的点词锚点）。 */
async function tapWord(page: Page, index = 0) {
  const word = page.locator(`${CARD} .now-sub-word`).nth(index);
  await expect(word).toBeVisible({ timeout: 5000 });
  const wordBox = (await word.boundingBox())!;
  const text = (await word.innerText()).trim();
  await word.click();
  await expect(page.locator(WORD_SHEET)).toBeVisible({ timeout: 10000 });
  return { wordBox, text };
}

test("① 词卡贴画框下沿升起：高度随内容、不铺满屏；「加入词库」默认不关", async ({
  page,
  request,
}) => {
  const { frame, bottomBar } = await enterWatch(page, request);
  expect(bottomBar, "375 档壳底栏在").not.toBeNull();
  const frameBottom = frame.y + frame.height;

  await tapWord(page, 0);
  const card = await boxOf(page, WORD_SHEET);

  // 卡口 = 画面下沿：顶边落在画框下沿（`useSheetGeometry` 的 `frameBottom`），
  // 且**绝不**压进画面。
  expect(card.y, "词卡顶边不高于画框下沿").toBeGreaterThanOrEqual(frameBottom - 1.5);
  expect(card.y, "词卡顶边贴着画面下沿（不是又一条断层）").toBeLessThanOrEqual(frameBottom + 2);
  expect(card.height, "词卡有实际高度").toBeGreaterThan(200);
  expect(card.x, "词卡出血到屏宽两侧").toBeCloseTo(0, 0);
  expect(card.width).toBeCloseTo(375, 0);
  // 高度随内容（原型 W2-edge：只给 top、卡高由内容决定，max-height 封顶）：
  // 底边**不**钉在底栏上沿，而是内容多高就多高，底下的文稿列表仍看得见。
  expect(card.y + card.height, "词卡底边不越过壳底栏上沿").toBeLessThanOrEqual(bottomBar!.y + 2);
  expect(card.y + card.height, "词卡没铺满到只剩一条缝（内容高 vs 拉满）").toBeLessThan(
    bottomBar!.y - 80
  );
  console.log(
    `[#27] 375×812 画框底=${frameBottom.toFixed(1)} 词卡 top=${card.y.toFixed(1)} ` +
      `h=${card.height.toFixed(1)} 底栏顶=${bottomBar!.y.toFixed(1)}`
  );

  // 「加入词库」默认不自动关（#27 ③）—— 不管保存成功失败，词卡都还在。
  await page.getByRole("button", { name: "加入词库" }).click();
  await page.waitForTimeout(600);
  await expect(page.locator(WORD_SHEET)).toBeVisible();

  // 关掉：浮层消失。
  await page.locator(`${WORD_SHEET} [aria-label="关闭"]`).click();
  await expect(page.locator('[data-testid="word-tooltip"]')).toHaveCount(0);

  // 不引入横向溢出。
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
});

test("③④⑤⑥⑦ 跟读底部抽屉：入口在壳底栏、播放器不动、顶边不越画框、计时/44px/下拉关闭/自动推进默认关", async ({
  page,
  request,
}) => {
  await mockMic(page);
  const { frame, bottomBar } = await enterWatch(page, request);
  expect(bottomBar, "375 档壳底栏在").not.toBeNull();
  const frameBottom = frame.y + frame.height;

  const sentence = (await page.locator('[data-testid="current-sentence-en"]').innerText()).trim();

  // DEC-069：入口从字幕卡的「录音」搬到壳底栏的「跟读」。
  await page.locator('[data-testid="watch-shadowing"]').click();
  const drawer = page.locator('[data-testid="shadowing-drawer"]');
  await expect(drawer).toBeVisible({ timeout: 5000 });

  // ③ 硬约束：展开前后播放器几何不动。
  const frameAfter = await boxOf(page, FRAME);
  expect(Math.abs(frameAfter.y - frame.y), "抽屉展开后画框顶不动").toBeLessThanOrEqual(1);
  expect(Math.abs(frameAfter.height - frame.height), "抽屉展开后画框高不动").toBeLessThanOrEqual(1);

  const d = await boxOf(page, '[data-testid="shadowing-drawer"]');
  // ④ 顶边绝不越过画框下沿（压住画面或当前句卡就是违约）。
  expect(d.y, "抽屉顶边不高于画框下沿").toBeGreaterThanOrEqual(frameBottom - 1.5);
  expect(Math.abs(d.y + d.height - bottomBar!.y), "抽屉底边贴壳底栏上沿").toBeLessThanOrEqual(2);
  expect(d.height, "抽屉是半屏档（400px 封顶，短视口下自动落档）").toBeLessThanOrEqual(401);
  console.log(
    `[#26] 375×812 抽屉 top=${d.y.toFixed(1)} h=${d.height.toFixed(1)} ` +
      `画框底=${frameBottom.toFixed(1)} 底栏顶=${bottomBar!.y.toFixed(1)} ` +
      `画框展开前 y=${frame.y.toFixed(1)} h=${frame.height.toFixed(1)} / 后 y=${frameAfter.y.toFixed(1)} h=${frameAfter.height.toFixed(1)}`
  );

  // ⑤ 抽屉顶边第一件事是钉住「要跟读的这一句」，那句来自当前句卡（唯一一份当前句）。
  await expect(page.locator('[data-testid="drawer-sentence-en"]')).toHaveText(sentence);

  // ⑦ 自动推进默认关。
  await expect(page.locator('[data-testid="auto-advance"]')).toHaveAttribute(
    "aria-checked",
    "false"
  );

  // 抽屉打开时是 idle 档：点「开始跟读本句」才进录音态（DEC-069 之后底栏只负责开抽屉）。
  await page.getByRole("button", { name: "开始跟读本句" }).click();

  // ⑤ 计时：录制中必须把秒数画出来（现状缺口）。
  const timer = page.locator('[data-testid="recording-timer"]');
  await expect(timer).toBeVisible({ timeout: 5000 });
  await expect(timer).toHaveText(/^\d+:\d{2}$/);

  // 录音 → 回放态（#26 记的「e2e 从没跑到回放态」这一条）。
  await page.getByRole("button", { name: "停止录音" }).click();
  await expect(page.getByRole("button", { name: "重录" })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("button", { name: "满意" })).toBeVisible();
  // 用抽屉内的动作行定位：底栏也有一个「下一句」，裸的 role 查询在 strict 模式下会撞两下。
  await expect(
    page.locator('[data-testid="drawer-actions"]').getByRole("button", { name: "下一句" })
  ).toBeVisible();

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
    const f = await boxOf(page, FRAME);
    const dd = await boxOf(page, '[data-testid="shadowing-drawer"]');
    const bar = await boxOf(page, '[data-testid="watch-bottom-bar"]');
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

/**
 * Destination §7 补测点 6：`WordCardSheet.tsx` 的落档公式
 * `top = max(8, min(画框下沿, 底栏顶 − 240))` 此前一条断言都没有 —— 812 档永远走
 * 「画框下沿」那一支，落档那一支从没被执行过。
 *
 * 实测（上一轮探针）：落档**只在视口高 < ~560px 时**才激活。DEC-069 把底栏从 56px 的
 * 5 Tab 换成 ~102px 的播放控件、画框顶下移（顶栏 64 → 44）之后，375×600 仍然在正支
 * 一侧，但余量只剩个位数 —— 所以这条先断言前提（`底栏顶 − 240 > 画框底`），
 * 前提一旦翻转就红在那里，而不是悄悄去量另一支。
 */
test("§7-6 短视口（375×600）下词卡仍走画框下沿那一支：顶边 = 画框下沿、卡底不越底栏", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 600 });
  const { frame, bottomBar } = await enterWatch(page, request);
  expect(bottomBar, "375 档壳底栏在").not.toBeNull();
  const frameBottom = frame.y + frame.height;
  // 前提：这一档还没进落档区（进了的话下面那条断言就成了在量另一支）。
  expect(
    bottomBar!.y - 240,
    "375×600 仍在落档阈值之上（底栏顶 − 240 > 画框底；这是边界守卫，翻转请改这条）"
  ).toBeGreaterThan(frameBottom);

  const { wordBox } = await tapWord(page, 0);
  const card = await boxOf(page, WORD_SHEET);

  console.log(
    `[#27] 375×600 画框底=${frameBottom.toFixed(1)} 底栏顶=${bottomBar!.y.toFixed(1)} ` +
      `词卡 top=${card.y.toFixed(1)} h=${card.height.toFixed(1)}`
  );
  expect(card.y, "词卡顶边 = 画框下沿（0 断层）").toBeCloseTo(frameBottom, 0);
  expect(card.y + card.height, "词卡底边不越过壳底栏上沿").toBeLessThanOrEqual(bottomBar!.y + 2);
  expect(wordBox.y, "被点的词在画框下沿之下（当前句卡里）").toBeGreaterThan(frameBottom - 1);
});

/**
 * 落档区（视口高 < ~560px，含**横屏**）的实测刻画 —— 这一档没有决议，只锁当前行为。
 * DEC-069 之后底栏更高（~102px），375×480 实测 `top = 379−240 = 139`（画框底 254.9），
 * 卡片从画面里 139 起、高 240 ⇒ **当前句卡被整块盖住**。
 *
 * 为什么不能简单按 INV-022 的「绝不压进画面」把顶边压回画框下沿：横屏下画框底
 * 本身就在底栏顶**之下**，压回去等于卡片高度 0 —— 词卡直接消失。
 * 也就是说 `min(...)` 这一支是「画框根本装不下时保住 240px 卡片」的兜底。
 * 这条冲突（永不盖住刚点的那句 ↔ 卡片始终可用）本就挂 #25；DEC-069 把当前句搬到
 * 画面下方之后，**812 档也开始盖住当前句卡**（见 §7-7）—— 那不是这条用例引入的，
 * 记在这里免得下一个人以为是落档区独有。
 */
test("§7-6b 落档区（375×480）实测刻画：卡片抬进画面 ~116px 以保住 240px 高（#25 待定）", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 480 });
  const { frame, bottomBar } = await enterWatch(page, request);
  expect(bottomBar, "375 档壳底栏在").not.toBeNull();
  const frameBottom = frame.y + frame.height;
  const sentenceCard = await boxOf(page, CARD);

  await tapWord(page, 0);
  const card = await boxOf(page, WORD_SHEET);
  console.log(
    `[#27] 375×480 画框底=${frameBottom.toFixed(1)} 底栏顶=${bottomBar!.y.toFixed(1)} ` +
      `词卡 top=${card.y.toFixed(1)} h=${card.height.toFixed(1)} 当前句卡顶=${sentenceCard.y.toFixed(1)}`
  );

  expect(card.y, "落档：顶边 = 底栏顶 − 240").toBeCloseTo(bottomBar!.y - 240, 0);
  expect(card.height, "落档：卡片仍保住 240px").toBeCloseTo(240, 0);
  expect(card.y + card.height, "底边仍贴底栏上沿").toBeLessThanOrEqual(bottomBar!.y + 2);
  // 代价照账：这一档卡片确实压进了画面（INV-022 的「绝不压进画面」在此让位给卡片可用性），
  // 而且连画面下方的当前句卡也一起盖住。
  expect(card.y, "落档区的代价：顶边已经高过画框下沿").toBeLessThan(frameBottom - 1);
  expect(card.y, "落档区的代价：当前句卡被盖住").toBeLessThan(sentenceCard.y);
});

/**
 * Destination §7 补测点 7：词卡压不到刚点的那**一个词** —— #27 的硬约束。
 *
 * ⚠️ DEC-069 之后这条**不再成立**：点词锚点从画框里的入画字幕搬到了画面正下方的
 * 当前句卡，而词卡顶边仍然钉在「画框下沿」（INV-022 的顶边那一半没改），
 * 于是词卡一定盖住当前句卡（`画框底 + mt-3` 就在它下面 12px）。这条用例因此改成断言
 * **点中的是哪个词**（词卡自己的 `aria-label`）—— 热区仍然准，只是上面压着词卡。
 * 要恢复「压不到」得让 `WordCardSheet` 的锚点改成当前句卡下沿（或把卡口下移 12px+卡高），
 * 那是决议，不是把这条改绿。
 */
test("§7-7 点词命中准确：词卡标题就是被点的那个词（DEC-069 后词卡会盖住当前句卡）", async ({
  page,
  request,
}) => {
  const { frame } = await enterWatch(page, request);
  const frameBottom = frame.y + frame.height;

  const { wordBox, text } = await tapWord(page, 2);
  const card = await boxOf(page, WORD_SHEET);
  const label = (await page.locator(WORD_SHEET).getAttribute("aria-label")) ?? "";
  // 词卡标题用的是页面清洗过的 token（去标点、保留大小写），span 文本可能带标点 → 两边都洗一遍。
  const clean = (s: string) => s.replace(/\s+/g, "").replace(/[.,!?;:'"]/g, "");

  // 被点的词在画面**下方**的当前句卡里（画面内零文字）。
  expect(wordBox.y, "被点的词在画框下沿之下").toBeGreaterThan(frameBottom - 1);
  expect(clean(label), `词卡标题「${label}」= 被点的那个词「${text}」`).toContain(clean(text));
  // 卡口仍是画框下沿：它现在盖在「画框底 + mt-3」的当前句卡之上。
  expect(card.y, "词卡顶边 = 画框下沿（#27 的卡口没变）").toBeCloseTo(frameBottom, 0);
  expect(card.y, "代价照账：词卡盖住了当前句卡（INV-022 顶边未随锚点下移）").toBeLessThanOrEqual(
    wordBox.y
  );
});

/**
 * Destination §7 补测点 8：计时**在走**。此前只断言格式 `^\d+:\d{2}$` —— 一个恒为
 * `0:00` 的僵尸计时器也能过，而「seconds 从来没画出来」正是本轮点名的旧缺口。
 */
test("§7-8 跟读计时真的在走：1.3s 后读数前进", async ({ page, request }) => {
  await mockMic(page);
  await enterWatch(page, request);
  await page.locator('[data-testid="watch-shadowing"]').click();
  await expect(page.locator('[data-testid="shadowing-drawer"]')).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "开始跟读本句" }).click();
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
 * 常驻形态本身，但没覆盖常驻态里的抽屉 —— 而 `useSheetGeometry` 的锚点是画框 rect，
 * 常驻时它就是「贴顶那一版」，最容易漏。
 *
 * 词卡那半边 DEC-069 之后测不了：当前句卡不是 sticky，滚下去会被钉在顶上的画框盖住，
 * 点不到它的词（点词锚点因此只在首屏可达，由 §7-7 覆盖）。抽屉那半边反而变好了 ——
 * 入口在壳底栏上，常驻态照样点得到。
 */
test("§7-10 常驻态下的跟读抽屉：贴着**常驻**画框的下沿，底边贴壳底栏", async ({
  page,
  request,
}) => {
  await mockMic(page);
  const { bottomBar } = await enterWatch(page, request);
  expect(bottomBar, "375 档壳底栏在").not.toBeNull();

  await page.evaluate(() => {
    const main = document.querySelector("main#main-scroll");
    if (main) main.scrollTop = 700;
  });
  await page.waitForTimeout(600);

  const stuck = await boxOf(page, FRAME);
  const position = await page.evaluate(
    (sel) => getComputedStyle(document.querySelector(sel) as HTMLElement).position,
    FRAME
  );
  expect(position, "前提：画框已贴顶常驻").toBe("sticky");

  // 入口在壳底栏（常驻态下仍可点），不用滚回顶部。
  await page.locator('[data-testid="watch-shadowing"]').click();
  await expect(page.locator('[data-testid="shadowing-drawer"]')).toBeVisible({ timeout: 5000 });

  const drawer = await boxOf(page, '[data-testid="shadowing-drawer"]');
  const barNow = await boxOf(page, '[data-testid="watch-bottom-bar"]');
  console.log(
    `[#26] 常驻态 画框底=${(stuck.y + stuck.height).toFixed(1)} ` +
      `抽屉 top=${drawer.y.toFixed(1)} 底=${(drawer.y + drawer.height).toFixed(1)} 底栏顶=${barNow.y.toFixed(1)}`
  );
  expect(drawer.y, "常驻态抽屉顶边不越过常驻画框下沿").toBeGreaterThanOrEqual(
    stuck.y + stuck.height - 1.5
  );
  expect(
    Math.abs(drawer.y + drawer.height - barNow.y),
    "常驻态抽屉底边仍贴壳底栏上沿"
  ).toBeLessThanOrEqual(2);
  // 常驻之后画框没缩、没跑：否则上面那条「不越画框下沿」就成了一句空话。
  const stuck2 = await boxOf(page, FRAME);
  expect(stuck2.y, "常驻态画框仍贴壳顶").toBeLessThanOrEqual(stuck.y + 2);
  expect(stuck2.height, "常驻态画框高不变").toBeCloseTo(stuck.height, 0);
  // 底栏没被抽屉推走（它是壳的常规流收尾行，抽屉是 fixed）。
  expect(Math.abs(barNow.y - bottomBar!.y), "底栏位置不受抽屉影响").toBeLessThanOrEqual(2);
});

/**
 * Destination §7 补测点 11：词卡把手下拉。抽屉那条已经有（见上一条 spec 的 ⑥），
 * 但 `word-card-grab` 这个 testId **没有任何用例引用** —— 两条把手走的是同一份
 * `SheetHandle`，漏测了一半：>64px 关、<64px 不关。
 */
test("§7-11 词卡把手：下拉 >64px 关掉，<64px 不关", async ({ page, request }) => {
  await enterWatch(page, request);
  const card = () => page.locator(WORD_SHEET);
  const dragHandle = async (dy: number) => {
    const grab = (await boxOf(page, '[data-testid="word-card-grab"]'))!;
    await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
    await page.mouse.down();
    await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2 + dy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  };

  await tapWord(page, 0);

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

    // 桌面端当前句在画面正下方的当前句卡里（INV-021：两端同一份），点词出的是浮动卡。
    await page.locator(`${CARD} .now-sub-word`).first().click();
    await expect(page.locator('[data-testid="word-tooltip"][data-variant="floating"]')).toBeVisible(
      {
        timeout: 10000,
      }
    );
    await expect(page.locator(WORD_SHEET)).toHaveCount(0);

    // 桌面端没有跟读抽屉（入口在字幕卡的「录音」按钮里）。
    await expect(page.locator('[data-testid="shadowing-drawer"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="watch-bottom-bar"]')).toHaveCount(0);
  });
});
