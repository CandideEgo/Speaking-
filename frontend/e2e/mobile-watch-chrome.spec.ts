/**
 * 移动端播放页重构的**三条判据** —— DEC-069 / issue #31 的毕业物验收（414×896，真机档）。
 *
 * 判据（§7，真机与 e2e 各验一遍）：
 *   1. `[data-testid="video-frame"]` 内**无任何文字**；
 *   2. 首屏**不滚动**可见：完整底栏 + 完整当前句卡 + **≥3 条文稿**；
 *   3. 从进页面到开始播放 = **1 次点击**。
 *
 * 另加桌面端守卫：1280 下观看页两栏（`watch-top-bar` / `watch-bottom-bar`）不渲染，
 * 全局 `TopBar`（h-16 = 64px）与 5 Tab 的行为一个字没变（`MobileTabBar` 仍是 `md:hidden`）。
 *
 * 这条文件是「判据本身」，不是「零件」：零件分别在 mobile-player-shell（版式）、
 * mobile-inline-subtitle（当前句卡）、mobile-pip-scroll（贴顶滚动）、
 * mobile-wordcard-drawer（词卡/抽屉）里验。
 *
 * 需要本地库里有**真能播**的视频：CI seed 的 `/media/<id>.mp4` 是占位 URL（404）→ skip。
 *
 * 运行：npx playwright test e2e/mobile-watch-chrome.spec.ts --project=chromium
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { registerUserViaApi, loginViaToken, uniquePhone } from "./helpers";

// 串行 + 一次注册：/auth/sms/register 是 3/minute（按 IP），每个用例各注册一个用户会 429。
test.describe.configure({ mode: "serial" });
let token = "";
test.beforeAll(async ({ request }) => {
  ({ token } = await registerUserViaApi(request, uniquePhone()));
});

const FRAME = '[data-testid="video-frame"]';
const CARD = '[data-testid="current-sentence-card"]';
const BAR = '[data-testid="watch-bottom-bar"]';
const TOP_BAR = '[data-testid="watch-top-bar"]';

/** 登录 → 打开第一条 ready 视频 → 跳过教程浮层 → 等到真能播。 */
async function enterWatch(page: Page, request: APIRequestContext, { mobile = true } = {}) {
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

  await expect(page.locator(FRAME)).toBeVisible({ timeout: 5000 });
  await expect(page.locator(CARD)).toBeVisible({ timeout: 5000 });
  if (mobile) {
    await expect(page.locator(BAR)).toBeVisible({ timeout: 5000 });
    await expect(page.locator(TOP_BAR)).toBeVisible({ timeout: 5000 });
  }
}

test.use({ viewport: { width: 414, height: 896 } });

test.describe("判据（414×896）：零文字画面 / 完整首屏 / 1 次点击（DEC-069 / #31）", () => {
  /** 判据 1：`video-frame` 内一个文字节点都不许有（入画字幕、标题卡、占位文案全删）。 */
  test("判据 1：video-frame 内无任何文字", async ({ page, request }) => {
    await enterWatch(page, request);

    const probe = await page.evaluate((sel) => {
      const frame = document.querySelector(sel) as HTMLElement;
      const offenders: string[] = [];
      const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const t = (node.textContent ?? "").trim();
          if (t) offenders.push(t.slice(0, 40));
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        node.childNodes.forEach(walk);
      };
      walk(frame);
      return {
        textContent: (frame.textContent ?? "").trim(),
        innerText: frame.innerText.trim(),
        offenders,
        frameTitle: frame.querySelectorAll('[data-testid="frame-title"]').length,
        frameBack: frame.querySelectorAll('[data-testid="frame-back"]').length,
        levelPill: frame.querySelectorAll('[data-testid="level-selector"]').length,
        controlsBar: frame.querySelectorAll('[data-testid="controls-bar"]').length,
        thinProgress: frame.querySelectorAll('[data-testid="thin-progress"]').length,
        burn: frame.querySelectorAll('[data-testid="burn-subtitle"]').length,
        burnWords: frame.querySelectorAll(".burn-sub-word").length,
      };
    }, FRAME);

    expect(probe.offenders, "画框内不许有文字节点").toEqual([]);
    expect(probe.textContent, "画框 textContent 为空").toBe("");
    expect(probe.innerText, "画框 innerText 为空").toBe("");
    expect(probe.frameTitle, "标题卡已删").toBe(0);
    expect(probe.frameBack, "画面内返回键已删（搬进壳顶栏）").toBe(0);
    expect(probe.levelPill, "画面内级别药丸已删（搬进壳顶栏）").toBe(0);
    expect(probe.controlsBar, "画面内控制条已删（移动端由壳底栏接管）").toBe(0);
    expect(probe.thinProgress, "画面内 3px 细进度已删").toBe(0);
    expect(probe.burn, "入画字幕已删").toBe(0);
    expect(probe.burnWords, "入画字幕的点词热区已删").toBe(0);
  });

  /**
   * 判据 2：**不滚动**的首屏里，底栏完整、当前句卡完整、文稿至少 3 条。
   *
   * 量法：全部走 `getBoundingClientRect()` 对 `window.innerHeight`；
   * 文稿是右侧面板（`[data-coach="subtitles"]`）里的 `#subtitle-0/1/…` 按钮，
   * 面板自己有 `max-height` + `overflow-y-auto`，所以「完整可见」= 按钮矩形整条落在
   * 「面板矩形 ∩ `main#main-scroll` 矩形 ∩ 视口」里 —— 被滚动区下沿切掉半条的**不算**。
   */
  test("判据 2：首屏不滚动可见完整底栏 + 完整当前句卡 + ≥3 条文稿", async ({ page, request }) => {
    await enterWatch(page, request);

    const m = await page.evaluate(
      ({ cardSel, barSel, topBarSel }) => {
        const rect = (el: Element | null) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
        };
        const main = document.querySelector("main#main-scroll") as HTMLElement | null;
        const list = document.querySelector('[data-coach="subtitles"]');
        const clipTop = Math.max(0, rect(list)?.top ?? 0, rect(main)?.top ?? 0);
        const clipBottom = Math.min(
          window.innerHeight,
          rect(list)?.bottom ?? window.innerHeight,
          rect(main)?.bottom ?? window.innerHeight
        );
        const lines = Array.from(
          document.querySelectorAll('[data-coach="subtitles"] button[id^="subtitle-"]')
        ).map((el) => {
          const r = el.getBoundingClientRect();
          return { id: el.id, top: r.top, bottom: r.bottom, height: r.height };
        });
        // 诊断：卡片内部那个 `max-h-[92px] overflow-hidden` 容器有没有把中文行切掉
        // （只打印，不做断言 —— 中文行是否必须在首屏完整可见是版式决议，见交付说明）。
        const en = document.querySelector('[data-testid="current-sentence-en"]');
        const zh = document.querySelector('[data-testid="current-sentence-zh"]');
        const clip = en?.parentElement ?? null;
        const inner = clip
          ? {
              scrollHeight: clip.scrollHeight,
              clientHeight: clip.clientHeight,
              zhBottom: zh ? zh.getBoundingClientRect().bottom : null,
              clipBottom: clip.getBoundingClientRect().bottom,
            }
          : null;
        return {
          innerHeight: window.innerHeight,
          scrollTop: main ? main.scrollTop : null,
          topBar: rect(document.querySelector(topBarSel)),
          bar: rect(document.querySelector(barSel)),
          card: rect(document.querySelector(cardSel)),
          sentenceEn: (
            document.querySelector('[data-testid="current-sentence-en"]')?.textContent ?? ""
          ).trim(),
          counter: (
            document.querySelector('[data-testid="subtitle-counter"]')?.textContent ?? ""
          ).trim(),
          inner,
          clipTop,
          clipBottom,
          lineCount: lines.length,
          fullyVisible: lines.filter(
            (l) => l.height > 0 && l.top >= clipTop - 0.5 && l.bottom <= clipBottom + 0.5
          ),
        };
      },
      { cardSel: CARD, barSel: BAR, topBarSel: TOP_BAR }
    );

    // 前提：这一屏**没滚过**（滚动容器是壳里的 main#main-scroll）。
    expect(m.scrollTop, "首屏没有滚动").toBe(0);
    expect(m.topBar, "观看页顶栏在").not.toBeNull();
    expect(m.bar, "观看页底栏在").not.toBeNull();
    expect(m.card, "当前句卡在").not.toBeNull();

    // 完整底栏：整块在可视区内，且底边贴住可视区底边。
    expect(m.bar!.top, "底栏上沿在可视区内").toBeGreaterThanOrEqual(0);
    expect(m.bar!.bottom, "底栏下沿不越可视区").toBeLessThanOrEqual(m.innerHeight + 1);
    expect(Math.abs(m.bar!.bottom - m.innerHeight), "底栏底边贴可视区底边").toBeLessThanOrEqual(1);

    // 完整当前句卡：整块在可视区内，且整个在底栏之上（不压底栏、不被底栏压）。
    expect(m.card!.top, "当前句卡上沿在可视区内").toBeGreaterThanOrEqual(0);
    expect(m.card!.bottom, "当前句卡下沿在可视区内").toBeLessThanOrEqual(m.innerHeight);
    expect(m.card!.bottom, "当前句卡在底栏之上").toBeLessThan(m.bar!.top);
    expect(m.card!.height, "当前句卡有实际高度（不是空壳）").toBeGreaterThan(40);
    expect(m.sentenceEn.length, "当前句卡里真的有那句英文").toBeGreaterThan(0);

    // 「完整当前句」的内容那一半：卡里的英文行 = 该视频第 n 句的**全文**（不是片段）。
    const videoId = new URL(page.url()).pathname.split("/").filter(Boolean).pop()!;
    const subRes = await request.get(`/api/v1/videos/${videoId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(subRes.ok(), `取字幕失败：${subRes.status()}`).toBe(true);
    const subs: { text_en: string }[] = (await subRes.json())?.subtitles ?? [];
    const idx = Number(/^(\d+)\s*\/\s*\d+$/.exec(m.counter)?.[1] ?? "0") - 1;
    expect(idx, `字幕计数「${m.counter}」读得出当前句序号`).toBeGreaterThanOrEqual(0);
    expect(subs[idx], `第 ${idx + 1} 句在字幕表里`).toBeTruthy();
    expect(m.sentenceEn.replace(/\s+/g, " "), "卡里是当前句全文").toBe(
      subs[idx].text_en.replace(/\s+/g, " ").trim()
    );

    // 诊断（不断言）：卡片内部 `max-h-[92px] overflow-hidden` 有没有切掉内容。
    if (m.inner) {
      const clipped = m.inner.scrollHeight > m.inner.clientHeight + 1;
      const zhCut = m.inner.zhBottom !== null && m.inner.zhBottom > m.inner.clipBottom + 1;
      console.log(
        `[#31 判据 2 诊断] 卡内滚动内容 ${m.inner.scrollHeight.toFixed(0)}px / 可见 ${m.inner.clientHeight.toFixed(0)}px ` +
          `⇒ ${clipped ? "有裁切" : "无裁切"}；中文行底 ${m.inner.zhBottom?.toFixed(0) ?? "--"} / 裁切底 ${m.inner.clipBottom.toFixed(0)} ` +
          `⇒ 中文行${zhCut ? "被切" : "完整"}`
      );
    }

    // ≥3 条文稿完整落在可视区里。
    console.log(
      `[#31 判据 2] 414×896 顶栏 ${m.topBar!.height.toFixed(0)}px 底栏 ${m.bar!.height.toFixed(0)}px ` +
        `当前句卡 ${m.card!.height.toFixed(0)}px 文稿可见区 ${m.clipTop.toFixed(0)}..${m.clipBottom.toFixed(0)} ` +
        `完整可见 ${m.fullyVisible.length}/${m.lineCount} 条`
    );
    expect(
      m.fullyVisible.length,
      `首屏不滚动可见的文稿条数（实测 ${m.fullyVisible.length}/${m.lineCount}）`
    ).toBeGreaterThanOrEqual(3);
  });

  /**
   * 判据 3：从进页面到开始播放 = **1 次点击**。
   *
   * 两件事都要成立：(a) 进页面时没有在播（不靠 autoplay 充数 —— 那样 0 次点击就"过"了）；
   * (b) 只点一次 `[data-testid="watch-toggle-play"]` 就真的在播。
   * 顺带数一遍点击：测量窗口里只允许 1 次 click 事件。
   */
  test("判据 3：从进页面到开始播放恰好 1 次点击", async ({ page, request }) => {
    await enterWatch(page, request);

    // (a) 进页面时是暂停的。
    expect(
      await page
        .locator("video")
        .first()
        .evaluate((v) => (v as HTMLVideoElement).paused),
      "进页面时没有在播（否则「1 次点击」没有意义）"
    ).toBe(true);

    // 开始数点击（捕获阶段，任何元素的点击都算）。
    await page.evaluate(() => {
      const w = window as unknown as { __watchClicks: number };
      w.__watchClicks = 0;
      document.addEventListener(
        "click",
        () => {
          w.__watchClicks += 1;
        },
        true
      );
    });

    // (b) 一次点击 = 开始播放。
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

    const clicks = await page.evaluate(
      () => (window as unknown as { __watchClicks: number }).__watchClicks
    );
    expect(clicks, "从进页面到播放只有 1 次点击").toBe(1);

    // 真的在走：时间前进。
    const t0 = await page
      .locator("video")
      .first()
      .evaluate((v) => (v as HTMLVideoElement).currentTime);
    await page.waitForTimeout(1200);
    const t1 = await page
      .locator("video")
      .first()
      .evaluate((v) => (v as HTMLVideoElement).currentTime);
    expect(t1, "播放中 currentTime 前进").toBeGreaterThan(t0);
  });
});

test.describe("桌面端守卫（DEC-069 不动 ≥1024px）", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("1280：观看页两栏不渲染，全局 TopBar（64px）与 5 Tab 行为不变", async ({
    page,
    request,
  }) => {
    await enterWatch(page, request, { mobile: false });

    // ① 桌面端不走观看页形态：两个栏都不在。
    await expect(page.locator(TOP_BAR)).toHaveCount(0);
    await expect(page.locator(BAR)).toHaveCount(0);
    await expect(page.locator(`${TOP_BAR} [data-testid="level-selector"]`)).toHaveCount(0);

    // ② 全局顶栏照旧：h-16 = 64px、可见。
    const header = page.locator("header.h-16").first();
    await expect(header, "桌面端仍是全局 TopBar").toBeVisible();
    expect(Math.round((await header.boundingBox())!.height), "桌面顶栏仍是 64px").toBe(64);

    // ③ 桌面端播放页的底栏槽位不渲染 5 Tab（`WatchBottomBar` 在 ≥1024px 返回 null，
    //    而壳已经不再渲染 `MobileTabBar`）—— 桌面控制条在画面里，由 VideoControls 负责。
    await expect(page.locator('[data-testid="mobile-tab-bar"]')).toHaveCount(0);

    // ④ `MobileTabBar` 本身的行为不变：非观看路由上照旧渲染，且仍是 `md:hidden`（桌面 display:none）。
    await page.goto("/");
    await expect(page.locator("div.h-dvh").first()).toBeVisible({ timeout: 15000 });
    const tabBar = page.locator('[data-testid="mobile-tab-bar"]');
    await expect(tabBar, "非观看路由上 5 Tab 仍在").toHaveCount(1);
    await expect(tabBar, "桌面端 5 Tab 仍不可见（md:hidden）").toBeHidden();
    expect(await tabBar.evaluate((el) => getComputedStyle(el).display), "md:hidden 的计算值").toBe(
      "none"
    );
    await expect(page.locator(TOP_BAR)).toHaveCount(0);
    await expect(page.locator(BAR)).toHaveCount(0);
  });
});
