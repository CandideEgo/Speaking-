import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { registerUserViaApi, loginViaToken, uniquePhone } from "./helpers";

const PHONE = uniquePhone();
let token = "";

test.use({ viewport: { width: 375, height: 812 } });
// 串行：fullyParallel 会把同一文件的用例分到不同 worker，各自跑一遍 beforeAll，
// 而 dev 后端对短信发码/注册有按 IP 的限流。
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  token = process.env.DESIGN_E2E_TOKEN || (await registerUserViaApi(request, PHONE)).token;
});

const FRAME = '[data-testid="video-frame"]';
const CARD = '[data-testid="current-sentence-card"]';
const WORD_SHEET = '[data-testid="word-tooltip"][data-variant="sheet"]';

/** 使用浏览器真实 MediaRecorder 录制合成音频，验证可解码的回放文件。 */
async function mockMic(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const source = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      source.frequency.value = 220;
      source.connect(destination);
      source.start();
      await context.resume();
      const track = destination.stream.getAudioTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => {
        stop();
        source.stop();
        void context.close();
      };
      return destination.stream;
    };
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
  const barCount = await page.locator('[data-testid="mobile-tab-bar"]').count();
  const bottomBar =
    barCount > 0 ? await page.locator('[data-testid="mobile-tab-bar"]').boundingBox() : null;

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

async function assertSheetAboveNavigation(page: Page, selector: string) {
  const sheet = await boxOf(page, selector);
  const tabs = await boxOf(page, '[data-testid="mobile-tab-bar"]');
  expect(sheet.y).toBeGreaterThanOrEqual(0);
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(tabs.y + 2);
  expect(sheet.width).toBeCloseTo((await page.viewportSize())!.width, 0);
  expect(sheet.height).toBeGreaterThanOrEqual(239);
}

for (const height of [812, 600, 480]) {
  test(`375×${height}：词卡可读、点词准确且不遮挡全站导航`, async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height });
    await enterWatch(page, request);
    const word = page.locator(`${CARD} .now-sub-word`).first();
    const text = (await word.innerText()).trim();
    await word.click();
    await expect(page.locator(WORD_SHEET)).toBeVisible();
    await expect(page.locator(WORD_SHEET).getByRole("heading").first()).toHaveText(
      new RegExp(text, "i")
    );
    await assertSheetAboveNavigation(page, WORD_SHEET);
    const card = await boxOf(page, CARD);
    const tabs = await boxOf(page, '[data-testid="mobile-tab-bar"]');
    const sheet = await boxOf(page, WORD_SHEET);
    expect(sheet.y).toBeCloseTo(Math.max(8, Math.min(card.y + card.height, tabs.y - 240)), 0);
    await page.locator(WORD_SHEET).getByRole("button", { name: "关闭", exact: true }).click();
    await expect(page.locator(WORD_SHEET)).toHaveCount(0);
  });
}

test("加入词库保留词卡，短拉回弹、长拉关闭", async ({ page, request }) => {
  await enterWatch(page, request);
  await tapWord(page);
  await page.getByRole("button", { name: "加入词库", exact: true }).click();
  await expect(page.locator(WORD_SHEET)).toBeVisible();
  const drag = async (dy: number) => {
    const handle = await boxOf(page, '[data-testid="word-card-grab"]');
    const x = handle.x + handle.width / 2,
      y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + dy, { steps: 10 });
    await page.mouse.up();
  };
  await drag(40);
  await expect(page.locator(WORD_SHEET)).toBeVisible();
  await expect(page.locator(WORD_SHEET)).toHaveCSS("transform", "none");
  await drag(140);
  await expect(page.locator(WORD_SHEET)).toHaveCount(0);
});

test("跟读抽屉保持画面位置，真实录音计时、回放、重录和拖动关闭", async ({ page, request }) => {
  await mockMic(page);
  await enterWatch(page, request);
  const action = page.getByTestId("watch-shadowing");
  await action.scrollIntoViewIfNeeded();
  const frame = await boxOf(page, FRAME);
  const sentence = await page.getByTestId("current-sentence-en").innerText();
  await action.click();
  const drawer = page.getByTestId("shadowing-drawer");
  await expect(drawer).toBeVisible();
  await assertSheetAboveNavigation(page, '[data-testid="shadowing-drawer"]');
  const after = await boxOf(page, FRAME);
  expect(after.y).toBeCloseTo(frame.y, 0);
  expect(after.height).toBeCloseTo(frame.height, 0);
  await expect(page.getByTestId("drawer-sentence-en")).toHaveText(sentence);
  await expect(page.getByTestId("auto-advance")).toHaveAttribute("aria-checked", "false");
  await drawer.getByRole("button", { name: "开始跟读本句" }).click();
  await expect(page.getByTestId("recording-timer")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("recording-timer")).not.toHaveText("0:00", { timeout: 5000 });
  await drawer.getByRole("button", { name: "停止录音" }).click();
  const replay = drawer.getByRole("button", { name: "播放我的录音", exact: true });
  await expect(replay).toBeVisible({ timeout: 10000 });
  await replay.click();
  await expect(drawer.getByRole("button", { name: "暂停我的录音", exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "暂停我的录音", exact: true }).click();
  for (const button of await page.getByTestId("drawer-actions").getByRole("button").all())
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await drawer.getByRole("button", { name: "重录", exact: true }).click();
  await expect(drawer.getByRole("button", { name: "开始跟读本句" })).toBeVisible();
  const grab = await boxOf(page, '[data-testid="shadowing-drawer-grab"]');
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await page.mouse.down();
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2 + 140, { steps: 12 });
  await page.mouse.up();
  await expect(drawer).toHaveCount(0);
});

test("抽屉旋转后仍贴全站导航上沿", async ({ page, request }) => {
  await enterWatch(page, request);
  await page.getByTestId("watch-shadowing").click();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 414, height: 896 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => {
        const d = await boxOf(page, '[data-testid="shadowing-drawer"]'),
          tabs = await boxOf(page, '[data-testid="mobile-tab-bar"]');
        return Math.abs(d.y + d.height - tabs.y);
      })
      .toBeLessThanOrEqual(2);
    await assertSheetAboveNavigation(page, '[data-testid="shadowing-drawer"]');
  }
});

test.describe("桌面端", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test("词卡保留浮动形态，桌面播放没有手机抽屉", async ({ page, request }) => {
    await enterWatch(page, request);
    await page.locator(`${CARD} .now-sub-word`).first().click();
    await expect(
      page.locator('[data-testid="word-tooltip"][data-variant="floating"]')
    ).toBeVisible();
    await expect(page.locator(WORD_SHEET)).toHaveCount(0);
    await expect(page.getByTestId("shadowing-drawer")).toHaveCount(0);
    await expect(page.getByTestId("mobile-tab-bar")).toBeHidden();
  });
});
