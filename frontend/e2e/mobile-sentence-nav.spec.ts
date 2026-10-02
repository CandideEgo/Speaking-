/**
 * 句导航回归（DEC-070 / T2·T3）—— 「下一句」过期闭包 + 底栏命中 + 进度条时长。
 *
 * 三条用例各自钉一个**已修好的缺陷**，所以它们都是「改前必红」（DEC-070 已逐条验过红→绿）：
 *
 *   A. 「下一句」连点 3 次只能前进、不许回退。（INV-025）
 *      改前：`page.tsx` 的 chrome memo 依赖表里没有 `currentSubtitleIndex`，
 *      store 里驻留的是**过期闭包**，实测停在第 9 句点一次**往回跳到第 2 句**、再点点不动。
 *      判定力的边界（**独立复核者质疑过，这里按实测改正**）：点「下一句」自己会 `seekTo` ⇒
 *      **会起播**，`isPlaying` 于是翻转一次、memo 跟着重算一次。所以「中途不碰播放/暂停」
 *      这条纪律在当前实现下并不成立，也不能当成本用例的判别力来源。真正的判别力是
 *      **首次点击读的是挂载期那个闭包**（点前 `isPlaying` 与挂载时同为 false，没有依赖变化），
 *      改前代码在这一次就会回跳（上游诊断 §2 的 10/190 → 2/190）；之后 `isPlaying` 只翻转
 *      这一次、不再变化，所以第 2、3 次点击也不会被刷新掩盖。仍要避免的是**中途开 ⋯ 面板 /
 *      切级别 / 跟读**（它们会换掉闭包捕获的状态），那属于另一类干扰。
 *   B. 「上一句」连点 2 次只能后退（对照组：`navigateSubtitle` 一直是 ref 读值，不会过期）。
 *   C. 底栏四个键的中心点各自命中自己（浮层/Next dev 指示器复辟的哨兵，**不需要真媒体**）。
 *      改前 dev 下 `watch-prev` 的中心命中 `NEXTJS-PORTAL`（36×36 指示器默认压在左下角）。
 *   D. `watch-progress` 的 `aria-valuemax` == 媒体真实时长（本地 fixture DB 行 612 ≠ 文件 719.98）。
 *
 * 需要本地库里有**真能播**的视频：CI seed 的 `/media/<id>.mp4` 是占位 URL（404）→ skip。
 *
 * 运行：npx playwright test e2e/mobile-sentence-nav.spec.ts --project=chromium
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { registerUserViaApi, loginViaToken, uniquePhone } from "./helpers";

const CARD = '[data-testid="current-sentence-card"]';
const COUNTER = '[data-testid="subtitle-counter"]';
const PREV = '[data-testid="watch-prev"]';
const NEXT = '[data-testid="watch-next"]';
const PROGRESS = '[data-testid="watch-progress"]';
/** 底栏四个键：中心点必须各自命中自己（顺序 = 屏幕从左到右）。 */
const BOTTOM_KEYS = ["watch-prev", "watch-toggle-play", "watch-next", "watch-shadowing"] as const;

test.use({ viewport: { width: 414, height: 896 } });

/**
 * 「下一句」的观察间隔。
 *
 * 不能用 `locator.click()`：它点完会把鼠标留在按钮上，而 Next dev 的指示器会**从鼠标
 * 下方浮出来**（实测：指示器 `bottom-left` 时点完「上一句」它的 rect 正好压住同一个点），
 * 于是第二次点击被它吞掉 —— 那是另一个缺陷（C 用例在管），别让它污染 A/B 的读数。
 * 直接派发点击事件绕开指针，同时用真实时间等 ≥ 一次 250ms 的时间轮询，读数才稳。
 */
const CLICK_SETTLE_MS = 700;

async function tapByDispatch(page: Page, selector: string) {
  await page.locator(selector).first().dispatchEvent("click");
}

/** `n / total` → n。 */
async function counterValue(page: Page): Promise<number> {
  const text = ((await page.locator(COUNTER).first().textContent()) ?? "").trim();
  const n = Number(/^(\d+)\s*\/\s*\d+$/.exec(text)?.[1] ?? NaN);
  expect(Number.isFinite(n), `计数「${text}」读得出当前句序号`).toBe(true);
  return n;
}

/**
 * 登录 → 打开第一条 ready 视频 → 跳过教程浮层 → 等到真能播。
 * 与 `mobile-watch-chrome.spec.ts` 的 `enterWatch` 同骨架（同一档 414×896）。
 */
async function enterWatch(
  page: Page,
  request: APIRequestContext,
  opts: { requirePlayable?: boolean } = {}
) {
  const { requirePlayable = true } = opts;
  await page.addInitScript(() => window.localStorage.setItem("seeword_coach_done", "true"));
  await loginViaToken(page, token);

  const res = await request.get("/api/v1/videos/public?page=1&page_size=1");
  const videoId = (await res.json())?.items?.[0]?.id ?? null;
  test.skip(!videoId, "no ready video in local DB; seed first");

  await page.goto(`/watch/${videoId}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);

  if (requirePlayable) {
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

  await expect(page.locator(CARD)).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="watch-bottom-bar"]')).toBeVisible({ timeout: 5000 });
  return videoId as string;
}

/**
 * 暂停 + seek 到**目标句内部**（`start + 0.2s`），等计数稳定。
 *
 * 为什么不能图省事直接 seek 到某个绝对秒数：高亮索引的**唯一写入者**是播放 tick
 * （`<video onTimeUpdate>` + 250ms 轮询），它按 `video.currentTime` 反推 index。
 * 直接跳到 t=30 并把页面 index 设成 1 是一次**自相矛盾**的状态：下一次轮询立刻把
 * index 按 t=30 改回 9/10 —— 实测「上一句」于是从 9 往后退，读数 1 → 10。
 * 所以先把视频放到第 `index` 句的起点之后一点点，让页面与视频对同一句话达成一致。
 */
async function steadyAtSentence(page: Page, index: number, expectCount: number) {
  const videoId = new URL(page.url()).pathname.split("/").filter(Boolean).pop()!;
  const res = await page.request.get(`/api/v1/videos/${videoId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const subs: { start_time: number }[] = (await res.json())?.subtitles ?? [];
  expect(subs[index], `第 ${index + 1} 句在字幕表里`).toBeTruthy();

  await page
    .locator("video")
    .first()
    .evaluate((v, t) => {
      const el = v as HTMLVideoElement;
      el.pause();
      el.currentTime = t;
    }, subs[index].start_time + 0.2);

  await expect.poll(() => counterValue(page), { timeout: 8000 }).toBe(expectCount);
}

let token = "";

// 整个文件一次注册（`/auth/sms/register` 是 3/minute 按 IP）；两个 describe 共用同一个用户。
// A/B/D 需要真媒体，C 不需要（CI 上也跑）—— 所以这里不能按 describe 各注册一个。
test.beforeAll(async ({ request }) => {
  ({ token } = await registerUserViaApi(request, uniquePhone()));
});

test.describe("句导航（真媒体，414×896）", () => {
  test.describe.configure({ mode: "serial" });

  test("用例 A：「下一句」连点 3 次只前进、不回退", async ({ page, request }) => {
    await enterWatch(page, request);

    // 停在第 9 句（0-based 8）内部。过期闭包冻结的是「memo 上次重算那一刻」的 index
    //（实测是最初的 0）⇒ 点下去会 seek 到第 2 句。这个起点离第 1 句足够远，回跳一眼可见。
    await steadyAtSentence(page, 8, 9);

    let prev = await counterValue(page);
    const seen: number[] = [prev];
    for (let i = 0; i < 3; i++) {
      await tapByDispatch(page, NEXT);
      await page.waitForTimeout(CLICK_SETTLE_MS);
      const after = await counterValue(page);
      expect(after, `第 ${i + 1} 次点「下一句」：${prev} → ${after}（只能前进）`).toBeGreaterThan(
        prev
      );
      seen.push(after);
      prev = after;
    }
    // 四次读数必须严格递增 —— 过期闭包的典型症状是「卡住」或「往回跳」。
    expect(seen, `计数序列 ${seen.join(" → ")} 严格递增`).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size, "计数序列里没有重复值（有没有卡住）").toBe(seen.length);
  });

  test("用例 B：「上一句」连点 2 次只后退", async ({ page, request }) => {
    await enterWatch(page, request);
    // 第 3 句（0-based 2）—— 前后都留出余量，两次「上一句」不会撞到 clamp。
    await steadyAtSentence(page, 2, 3);

    let prev = await counterValue(page);
    for (let i = 0; i < 2; i++) {
      await tapByDispatch(page, PREV);
      await page.waitForTimeout(CLICK_SETTLE_MS);
      const after = await counterValue(page);
      expect(after, `第 ${i + 1} 次点「上一句」：${prev} → ${after}（只能后退）`).toBeLessThan(
        prev
      );
      prev = after;
    }
  });

  test("用例 D：进度条 aria-valuemax = 媒体真实时长", async ({ page, request }) => {
    await enterWatch(page, request);

    // 媒体时长要读得到才算有读数（readyState ≥ 2 后 duration 一定有限）。
    const real = await page
      .locator("video")
      .first()
      .evaluate((v) => (v as HTMLVideoElement).duration);
    expect(Number.isFinite(real), `video.duration=${real} 应是有限值`).toBe(true);

    // DB 行 duration=612、文件 719.98 ⇒ 以媒体为准后应是 720，而不是 612。
    await expect
      .poll(
        async () => Number((await page.locator(PROGRESS).getAttribute("aria-valuemax")) ?? "-1"),
        { timeout: 8000 }
      )
      .toBe(Math.max(0, Math.round(real)));
  });
});

// C 不需要真媒体：只要底栏渲染出来就能做命中测试（CI 也跑）——它是浮层复辟的哨兵。
test.describe("底栏命中（不需要真媒体）", () => {
  test.describe.configure({ mode: "serial" });

  test("用例 C：底栏每个键的中心命中它自己", async ({ page, request }) => {
    await enterWatch(page, request, { requirePlayable: false });
    // 402–404 的暂停态没有 media，但底栏与画框都在；命中测试与播放无关。
    await page.waitForTimeout(300);

    const hits = await page.evaluate((keys: readonly string[]) => {
      return keys.map((key) => {
        const el = document.querySelector(`[data-testid="${key}"]`) as HTMLElement | null;
        if (!el) return { key, missing: true, self: false, got: "null", rect: null };
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        const chain: string[] = [];
        for (let n: Element | null = hit; n && chain.length < 4; n = n.parentElement) {
          chain.push(
            n.tagName.toLowerCase() + (n.className ? "." + String(n.className).split(" ")[0] : "")
          );
        }
        return {
          key,
          missing: false,
          self: !!hit && (hit === el || el.contains(hit)),
          got: chain.join(" < "),
          rect: [r.left, r.top, r.width, r.height].map((n) => Math.round(n)),
        };
      });
    }, BOTTOM_KEYS);

    for (const h of hits) {
      expect(h.missing, `${h.key} 在底栏里`).toBe(false);
      expect(
        h.self,
        `${h.key} 中心命中了自己（rect=${JSON.stringify(h.rect)}，链=${h.got}）—— ` +
          `命中的不是它，说明有浮层/指示器压在底栏上`
      ).toBe(true);
      expect(h.rect![3], `${h.key} 高 ≥44px（触控基线）`).toBeGreaterThanOrEqual(44);
    }

    // 硬事实：dev 指示器（`nextjs-portal`）在 dev 下就是那块会吞点击的浮层。
    // `devIndicators: false` 之后它**仍然在 DOM 里**（Next 只渲染一个空壳，实测
    // `children.length === 0`），所以判据不是「元素消失」而是「它不再有任何内容可吞点击」——
    // 真正作数的是上面那四条命中测试。这里只钉住「空壳」这个可观测事实，防止有人把指示器
    // 打开回来（那时 `children.length` 会 > 0，命中测试也会一起红）。
    const portal = await page.evaluate(() => {
      const p = document.querySelector("nextjs-portal");
      return p ? { display: getComputedStyle(p).display, children: p.children.length } : null;
    });
    if (portal) {
      expect(
        portal.children,
        `nextjs-portal 里又有东西了（${JSON.stringify(portal)}）—— dev 指示器被打开了？` +
          `它会盖住底栏键，见 next.config.js 的 devIndicators`
      ).toBe(0);
    }
  });
});
