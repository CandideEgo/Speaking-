/**
 * 移动端当前句 —— 从「入画字幕」搬到「画面正下方的当前句卡」（DEC-069 / #31）的毕业物验收。
 *
 * 推翻的是 wayfinder #28 的「乙 · 字幕入画」：真机上入画字幕（EN 2 行 + ZH 1 行 = 82px）
 * 压在画框下沿，盖住人物下半张脸（`docs/design/mobile/app-shots/12-device-414-scrolled-sticky.jpg`）。
 * 现在断言的是新形态里写死的那几条，不是「看起来差不多」：
 *   ① `[data-testid="video-frame"]` 内**零文字**（判据 1，反转旧的「贴画框下沿」断言）；
 *   ② 当前句在画面正下方的当前句卡里：`[data-testid="current-sentence-en"]`，
 *      点词唯一锚点 = 卡里的 `.now-sub-word`（INV-021 的理由列一字不改，只换了锚点）；
 *   ③ 1280 桌面端不变：当前句同样只在卡里渲染一份。
 *
 * 需要本地库里有**真能播**的视频：CI seed 的 `/media/<id>.mp4` 是占位 URL（404），
 * 这种情况下和 mobile-d1-d10.spec.ts 一样 skip，而不是在几何断言上失败。
 *
 * 运行：npx playwright test e2e/mobile-inline-subtitle.spec.ts --project=chromium
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { registerUserViaApi, loginViaToken, uniquePhone } from "./helpers";

// 串行 + 一次注册：/auth/sms/register 是 3/minute（按 IP），每个用例各注册一个用户
// 会在第 4 条上 429（本文件现在 6 条）。
test.describe.configure({ mode: "serial" });
let token = "";
test.beforeAll(async ({ request }) => {
  ({ token } = await registerUserViaApi(request, uniquePhone()));
});

/** 画框（`<video>` 的外壳）—— 判据 1 的对象，也是贴顶常驻与浮层锚点量的那个盒子。 */
const FRAME = '[data-testid="video-frame"]';
const CARD = '[data-testid="current-sentence-card"]';

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

/**
 * 登录 → 打开第一条 ready 视频 → 跳过教程浮层 → 等到真能播。返回画框几何。
 *
 * 旧的 `dismissPip`（点「关闭小窗播放」的 X）随 X 一起删了 —— 那层 workaround 不再有对象；
 * 首屏本来就不该有跟随态，这里改成正面断言（见第一条用例）。
 * `mobile=false`（桌面 describe）时不等壳底栏：`WatchBottomBar` 在 ≥1024px 自己渲染 null。
 */
async function enterWatch(page: Page, request: APIRequestContext, { mobile = true } = {}) {
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

  // 就绪门：当前句卡（两端都渲染）+ 移动端壳底栏。
  // 旧的 `[data-testid="controls-bar"]` 就绪门随移动端控制条一起删了（VideoControls 现在桌面专属）。
  await expect(page.locator(CARD)).toBeVisible({ timeout: 5000 });
  if (mobile) {
    await expect(page.locator('[data-testid="watch-bottom-bar"]')).toBeVisible({ timeout: 5000 });
  }

  return boxOf(page, FRAME);
}

test.use({ viewport: { width: 375, height: 812 } });

test.describe("移动端当前句卡（#31，375×812）", () => {
  // 375×812 是参考机型（iPhone X），而它的画框顶 y=166 落在 useStickyPip 观察带底
  // （812×20% = 162.4）之下 —— 只要把「带外」当成「滚走了」，这一档首屏就是跟随态，
  // 整条移动端重设计等于不可见。所以这条断言盯首屏。
  test("进入页面即内联播放器：375 首屏不收成跟随态；画面内零文字，当前句卡贴画面正下方", async ({
    page,
    request,
  }) => {
    const frame = await enterWatch(page, request);

    const position = await page.evaluate(
      (sel) => getComputedStyle(document.querySelector(sel) as HTMLElement).position,
      FRAME
    );
    expect(position, "首屏画框不贴顶常驻").not.toBe("sticky");

    // 判据 1：画框内无任何文字（入画字幕全删，画面里零可点覆盖物）。
    expect((await page.locator(FRAME).innerText()).trim(), "画框内零文字").toBe("");
    await expect(page.locator('[data-testid="burn-subtitle"]')).toHaveCount(0);

    // 当前句卡紧接着画框下沿：`mt-3` = 12px 的断层，不是压在画面里。
    const card = await boxOf(page, CARD);
    const frameBottom = frame.y + frame.height;
    expect(card.y, "当前句卡顶边在画框下沿之下").toBeGreaterThanOrEqual(frameBottom - 1);
    expect(card.y, "当前句卡只隔一个 mt-3（12px）").toBeLessThanOrEqual(frameBottom + 16);
    await expect(page.locator('[data-testid="current-sentence-en"]')).toBeVisible();

    // 旧形态的两个画面内锚点都不在了。
    await expect(page.locator('[data-testid="frame-title"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="frame-back"]')).toHaveCount(0);
  });

  // 上面那条修复必须只掐掉「首屏误判」：真滚走了**仍然要进跟随态**，否则等于把跟随关掉。
  // #30 定的跟随形态是「画面贴顶常驻」——不缩、不飞、不消失（旧的右下角 160×90 迷你窗已取消）；
  // DEC-069 只把钉住位置从壳顶（64）改成顶栏下沿（44）。所以这条量的是
  // 「仍满宽 + 贴 main 上沿 + 贴 44px 顶栏下沿」。
  // 滚动容器是壳里的 main#main-scroll（window.scrollY 恒 0）。
  test("向下滚动把画框滚出视口顶部 → 仍进跟随态（贴顶常驻，钉在 44px 顶栏下沿）", async ({
    page,
    request,
  }) => {
    const first = await enterWatch(page, request);

    await page.evaluate(() => {
      const main = document.querySelector("main#main-scroll");
      if (main) main.scrollTop = 700;
      else window.scrollTo(0, 700);
    });
    await page.waitForTimeout(600);

    const stuck = await boxOf(page, FRAME);
    expect(stuck.width, "画面一个像素没缩（贴顶常驻，不是迷你窗）").toBeCloseTo(first.width, 0);
    expect(stuck.height, "画面高不变").toBeCloseTo(first.height, 0);

    const { shellTop, topBarBottom } = await page.evaluate(() => ({
      shellTop: document.querySelector("main#main-scroll")!.getBoundingClientRect().top,
      topBarBottom: document.querySelector('[data-testid="watch-top-bar"]')!.getBoundingClientRect()
        .bottom,
    }));
    expect(topBarBottom, "壳顶栏下沿 = 44px（#31：64 → 44）").toBeCloseTo(44, 0);
    expect(shellTop, "滚动容器上沿 = 顶栏下沿").toBeCloseTo(topBarBottom, 0);
    expect(stuck.y, "画面贴住壳顶（= 顶栏下沿）").toBeCloseTo(shellTop, 0);
    // 常驻时画面里也不许冒出文字。
    expect((await page.locator(FRAME).innerText()).trim(), "常驻态画框内零文字").toBe("");
  });

  test("画面内零文字、当前句卡显示当前句与计数；底栏四键常驻；点词开词卡、点卡空白切播放", async ({
    page,
    request,
  }) => {
    await enterWatch(page, request);

    // ① 画框内无文字（判据 1）。
    expect((await page.locator(FRAME).innerText()).trim(), "画框内零文字").toBe("");

    // ② 当前句卡：当前句 + `n / 总数` + 点词热区。
    const en = (await page.locator('[data-testid="current-sentence-en"]').innerText())
      .replace(/\s+/g, " ")
      .trim();
    expect(en.length, "当前句卡里有当前句的英文").toBeGreaterThan(0);
    await expect(page.locator('[data-testid="subtitle-counter"]')).toHaveText(/^\d+ \/ \d+$/);
    expect(
      await page.locator(`${CARD} .now-sub-word`).count(),
      "点词热区在卡里（唯一锚点）"
    ).toBeGreaterThan(0);

    // ③ 壳底栏：贴可视区底边；进度 44px 热区；四键各 ≥44×44。
    const bar = await boxOf(page, '[data-testid="watch-bottom-bar"]');
    const innerHeight = await page.evaluate(() => window.innerHeight);
    expect(Math.abs(bar.y + bar.height - innerHeight), "底栏贴可视区底边").toBeLessThanOrEqual(1);
    const progress = await boxOf(page, '[data-testid="watch-progress"]');
    expect(Math.round(progress.height), "进度热区高 44px").toBe(44);
    for (const [id, label] of [
      ["watch-prev", "上一句"],
      ["watch-toggle-play", "播放/暂停"],
      ["watch-next", "下一句"],
      ["watch-shadowing", "跟读"],
    ] as const) {
      const b = await boxOf(page, `[data-testid="${id}"]`);
      expect(b.height, `${label} 触控目标高`).toBeGreaterThanOrEqual(44);
      expect(b.width, `${label} 触控目标宽`).toBeGreaterThanOrEqual(44);
    }

    // ④ 底栏播放键 = 起播；进度条宽度由 rAF 直写 `style`（不进 React state，§5）。
    await page.locator('[data-testid="watch-toggle-play"]').click();
    await expect
      .poll(
        () =>
          page
            .locator("video")
            .first()
            .evaluate((v) => (v as HTMLVideoElement).paused),
        {
          timeout: 5000,
        }
      )
      .toBe(false);
    await page.waitForTimeout(1200);
    const style =
      (await page.locator('[data-testid="watch-progress-fill"]').getAttribute("style")) ?? "";
    expect(style, "进度条宽度由 rAF 直写 style").toMatch(/width:\s*[\d.]+%/);
    expect(parseFloat(/([\d.]+)%/.exec(style)?.[1] ?? "0"), "播放 1.2s 后进度前进").toBeGreaterThan(
      0
    );

    // ⑤ 点词开词卡，并且**不**顺带把整卡当成播放/暂停的面（词自己吞掉点击）。
    await page.locator(`${CARD} .now-sub-word`).first().click();
    const sheet = page.locator('[data-testid="word-tooltip"][data-variant="sheet"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    expect(
      await page
        .locator("video")
        .first()
        .evaluate((v) => (v as HTMLVideoElement).paused),
      "点词不该顺带切换播放/暂停"
    ).toBe(false);
    await sheet.locator('[aria-label="关闭"]').click();
    await expect(page.locator('[data-testid="word-tooltip"]')).toHaveCount(0);

    // ⑥ 点卡片空白 = 播放/暂停（卡内不放按钮）。先把播放头停住：不然句子可能在
    // 「量点」与「点下去」之间翻页，卡高一变那个相对坐标就落到别的行上。
    await page
      .locator("video")
      .first()
      .evaluate((v) => (v as HTMLVideoElement).pause());
    await expect
      .poll(
        () =>
          page
            .locator("video")
            .first()
            .evaluate((v) => (v as HTMLVideoElement).paused),
        {
          timeout: 5000,
        }
      )
      .toBe(true);
    // 取一个在卡内、两行文字之外的点：先用中文行右侧的空白带，没有中文行就退到英文行下方。
    const clickAt = await page.evaluate((sel) => {
      const card = document.querySelector(sel) as HTMLElement;
      const r = card.getBoundingClientRect();
      const zh = document.querySelector(
        '[data-testid="current-sentence-zh"]'
      ) as HTMLElement | null;
      if (zh) {
        const zr = zh.getBoundingClientRect();
        const x = zr.right + 16;
        const y = (zr.top + zr.bottom) / 2;
        if (x < r.right - 4) return { x: x - r.left, y: y - r.top };
      }
      const en = document.querySelector('[data-testid="current-sentence-en"]') as HTMLElement;
      const er = en.getBoundingClientRect();
      return { x: r.width / 2, y: er.bottom - r.top + 6 };
    }, CARD);
    await page.locator(CARD).click({ position: clickAt });
    await expect
      .poll(
        () =>
          page
            .locator("video")
            .first()
            .evaluate((v) => (v as HTMLVideoElement).paused),
        {
          timeout: 5000,
        }
      )
      .toBe(false);

    // ⑦ 不引入横向溢出。
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  /**
   * INV-021 的「当前句恰好渲染一次」：移动端此前是「入画一份 + 卡片一份 = 点词热区分裂成两半」，
   * 正是 #27 词卡没有唯一锚点的原因。现在移动端只剩卡里那一份，画面里一份都没有。
   */
  test("375 下当前句只渲染一次：卡里一份，画面里零份", async ({ page, request }) => {
    await enterWatch(page, request);

    await expect(page.locator(CARD)).toHaveCount(1);
    await expect(page.locator('[data-testid="current-sentence-en"]')).toHaveCount(1);
    // 入画那份（含英文行与点词热区）在移动端必须一个都不渲染。
    await expect(page.locator('[data-testid="burn-subtitle"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="burn-subtitle-en"]')).toHaveCount(0);
    expect(await page.locator(".burn-sub-word").count(), "画面内点词热区").toBe(0);
    // 反向：卡里那句的点词热区必须真的在（否则「恰好一次」是靠两边都没有达成的）。
    expect(await page.locator(`${CARD} .now-sub-word`).count()).toBeGreaterThan(0);
  });

  /**
   * 字幕同步回归（`state.md` 的「iPhone 真机待办：字幕同步」需要一条本地可复现的回归；
   * 真机只补「音频对齐」那一层）。
   *
   * 做法：把播放头设到第 N 句 `start_time + 0.2s`（HTML5 那条路每 250ms 轮询一次
   * `currentTime` 并重算当前句，所以**暂停状态也能触发**，不依赖播放漂移），
   * 断言当前句卡的那行字与计数都换成第 N 句。选一句时长 >3s 的，避开跳过去就翻页的短句。
   */
  test("字幕同步：跳到第 N 句 start+0.2s，当前句卡与计数立刻换成那一句", async ({
    page,
    request,
  }) => {
    await enterWatch(page, request);

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
    const shown = (await page.locator('[data-testid="current-sentence-en"]').innerText())
      .replace(/\s+/g, " ")
      .trim();
    expect(shown, `第 ${index + 1} 句当前句卡`).toBe(
      subs[index].text_en.replace(/\s+/g, " ").trim()
    );
  });
});

test.describe("桌面端不受影响（#31 只动 ≤1023px）", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("1280 宽：不入画字幕、也没有壳观看页两栏；当前句卡里仍有当前句", async ({
    page,
    request,
  }) => {
    await enterWatch(page, request, { mobile: false });

    await expect(page.locator('[data-testid="burn-subtitle"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="watch-top-bar"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="watch-bottom-bar"]')).toHaveCount(0);
    // 桌面端当前句也只有卡里那一份，点词热区仍可点。
    await expect(page.locator(`${CARD} [data-testid="current-sentence-en"]`)).toBeVisible();
    await expect(page.locator(`${CARD} .now-sub-word`).first()).toBeVisible();
  });
});
