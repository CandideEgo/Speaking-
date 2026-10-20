/**
 * 桌面观看页在四档尺寸下，当前句卡与播放器同宽并完整落在首屏。
 * useWatchStageWidth 读取实际非媒体高度，兼容换行、学习动作和已保存的跟读历史；
 * CSS 中的高度预算只负责测量前首绘。动作带、学习动作和词条都应被句卡包住。
 * 需要本地真实可播媒体；缺少媒体时明确跳过。
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { registerUserViaApi, loginViaToken, uniquePhone } from "./helpers";

test.describe.configure({ mode: "serial" });
let token = "";
test.beforeAll(async ({ request }) => {
  token = process.env.DESIGN_E2E_TOKEN || (await registerUserViaApi(request, uniquePhone())).token;
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

test.describe("S4/S5 桌面档：句卡整块在首屏内、动作带在卡内、卡与画框同宽左对齐", () => {
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

      // ④ S5：动作带住进句卡（原来「画面下的第二张卡」已删）。
      const practice = page.locator('[data-coach="practice"]');
      await expect(practice).toBeVisible();
      const pb = (await practice.boundingBox())!;
      expect(pb.y, "动作带在卡内（S5 合并）").toBeGreaterThan(card.y);
      expect(pb.y + pb.height, "动作带在卡内（S5 合并）").toBeLessThanOrEqual(
        card.y + card.height + 0.5
      );
      // 随根字号计算卡片内边距与边框，动作带应占满实际内容宽。
      const inset = await page.locator(CARD).evaluate((el) => {
        const style = getComputedStyle(el);
        return (
          parseFloat(style.paddingLeft) +
          parseFloat(style.paddingRight) +
          parseFloat(style.borderLeftWidth) +
          parseFloat(style.borderRightWidth)
        );
      });
      expect(Math.abs(card.width - inset - pb.width), "动作带占卡内容区整宽").toBeLessThanOrEqual(
        1
      );
      // 两段等宽（grid-cols-2）。
      const seg1 = (await practice.locator("> button").nth(0).boundingBox())!;
      const seg2 = (await practice.locator("> button").nth(1).boundingBox())!;
      expect(Math.abs(seg1.width - seg2.width), "动作带两段等宽").toBeLessThanOrEqual(1);
      // 空历史不留占位；已有录音时，历史应随真实数据展示并被卡片包住。
      const videoId = new URL(page.url()).pathname.split("/").pop();
      const attempts = await request.get(`/api/v1/shadowing/attempts?video_id=${videoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(attempts.ok()).toBe(true);
      await expect(page.getByText("最近跟读", { exact: true })).toHaveCount(
        (await attempts.json()).items.length ? 1 : 0
      );

      // ⑤ DEC-080：学习动作住在句卡内；本句词条有数据时也必须被卡包住。
      const learning = page.locator('[data-testid="learning-actions"]');
      await expect(learning).toBeVisible();
      const lb = (await learning.boundingBox())!;
      expect(lb.y, "学习动作在卡内（DEC-080）").toBeGreaterThan(card.y);
      expect(lb.y + lb.height, "学习动作在卡内（DEC-080）").toBeLessThanOrEqual(
        card.y + card.height + 0.5
      );

      const strip = page.locator('[data-testid="sentence-word-strip"]');
      if ((await strip.count()) > 0 && (await strip.isVisible())) {
        const sb = (await strip.boundingBox())!;
        expect(sb.y, "本句词条在卡内（DEC-080）").toBeGreaterThan(card.y);
        expect(sb.y + sb.height, "本句词条在卡内（DEC-080）").toBeLessThanOrEqual(
          card.y + card.height + 0.5
        );
      }

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
