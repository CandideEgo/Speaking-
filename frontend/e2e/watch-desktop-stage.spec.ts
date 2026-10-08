/**
 * S4 桌面播放页高度护栏 —— 1280×720 / 1366×768 / 2560×1440 / 2560×1080。
 *
 * 问题：画框是 `aspect-video` 且无高度上限。S2 把容器放宽到 2400 后，左列在宽屏
 * 可达 1500px+，16:9 就是 850px+ 高 —— 当前句卡被挤出首屏。
 *
 * 护栏：`.watch-stage-cap`（globals.css）把「画框 + 当前句卡」夹在
 * `(100dvh - --watch-stage-chrome) × 16/9`。本 spec 既验版式，也是那个常量的
 * **校准尺**：护栏生效档（1366×768 / 2560×1080）的 `slack = innerHeight - 卡底边`
 * 若明显偏离 0，按 `T = C - slack` 反推 `--watch-stage-chrome` 的真实值。
 *
 * 与 mobile-current-sentence-card.spec.ts 的分工：那边管「卡与点词」的桌面档
 * （只测默认视口），这边管「护栏在四档下都成立」。
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
const CARD = '[data-testid="current-sentence-card"]';

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

  // 就绪门：画框 + 当前句卡。
  await expect(page.locator(FRAME)).toBeVisible({ timeout: 5000 });
  await expect(page.locator(CARD)).toBeVisible({ timeout: 5000 });
}

const VIEWPORTS: Array<[number, number]> = [
  [1280, 720],
  [1366, 768],
  [2560, 1440],
  [2560, 1080],
];

test.describe("S4 桌面档：句卡整块在首屏内、卡与画框同宽左对齐", () => {
  for (const [w, h] of VIEWPORTS) {
    test(`${w}×${h}`, async ({ page, request }) => {
      await openWatch(page, request, w, h);
      const frame = (await page.locator(FRAME).boundingBox())!;
      const card = (await page.locator(CARD).boundingBox())!;
      const innerHeight = await page.evaluate(() => window.innerHeight);
      const cardBottom = card.y + card.height;

      // ① 句卡整块在首屏内（S4 护栏要保的就是这一条；mobile-player-shell.spec.ts:187 同口径）。
      expect(
        cardBottom,
        `句卡底边 ${cardBottom.toFixed(1)} 必须 ≤ innerHeight ${innerHeight}`
      ).toBeLessThanOrEqual(innerHeight);
      // ② 卡在画框下沿之下（移动档同口径）。
      expect(card.y, "卡在画框下沿之下").toBeGreaterThanOrEqual(frame.y + frame.height - 1.5);
      // ③ 同宽、左对齐（mobile-current-sentence-card.spec.ts:300-303 的桌面口径）。
      expect(Math.abs(card.x - frame.x), "卡与画框左对齐").toBeLessThanOrEqual(2);
      expect(Math.abs(card.width - frame.width), "卡与画框同宽").toBeLessThanOrEqual(2);

      // 校准日志：护栏生效档 slack≈0 时 --watch-stage-chrome 才是真值。
      const stageCap = await page.evaluate(() => {
        const cap = document.querySelector(".watch-stage-cap");
        return cap ? getComputedStyle(cap).maxWidth : null;
      });
      console.log(
        `[S4] ${w}×${h} 画框 x=${frame.x.toFixed(1)} y=${frame.y.toFixed(1)} ` +
          `w=${frame.width.toFixed(1)} h=${frame.height.toFixed(1)} | ` +
          `卡 y=${card.y.toFixed(1)} h=${card.height.toFixed(1)} 底边=${cardBottom.toFixed(1)} | ` +
          `slack=${(innerHeight - cardBottom).toFixed(1)} stage-cap max-width=${stageCap}`
      );
    });
  }
});
