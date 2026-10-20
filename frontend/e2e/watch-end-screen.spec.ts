/**
 * 观看页结束态（audit D-watch P0 #1）。
 *
 * 旧实现把 EndScreen 覆盖在 16:9 画框里：1280×720 画框只有 299px、375×812 只有
 * 193px，而卡片固定 455px 高 —— 标题被裁、`返回首页` 整体在画框外，用户点不到。
 * 现在改成页面级覆盖（`fixed inset-0`），这两档都必须完整可见可点，且「再看一遍」
 * 能把覆盖层收掉并继续播放。
 *
 * 需要本地库里有**真能播**的视频：CI seed 的 `/media/<id>.mp4` 是占位 URL（404）→ skip。
 * 运行：npx playwright test e2e/watch-end-screen.spec.ts --project=chromium
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { registerUserViaApi, loginViaToken, uniquePhone } from "./helpers";

test.describe.configure({ mode: "serial" });

let token = "";
test.beforeAll(async ({ request }) => {
  token = process.env.DESIGN_E2E_TOKEN || (await registerUserViaApi(request, uniquePhone())).token;
});

/** 登录 → 打开第一条 ready 视频 → seek 到片尾 → 等结束页出现。 */
async function enterEndedWatch(
  page: Page,
  request: APIRequestContext,
  width: number,
  height: number
) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => window.localStorage.setItem("seeword_coach_done", "true"));
  await loginViaToken(page, token);

  const res = await request.get("/api/v1/videos/public?page=1&page_size=1");
  const videoId = (await res.json())?.items?.[0]?.id ?? null;
  test.skip(!videoId, "no ready video in local DB; seed first");

  await page.goto(`/watch/${videoId}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2200);

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

  await page.evaluate(async () => {
    const v = document.querySelector("video") as HTMLVideoElement | null;
    if (!v) return;
    v.muted = true;
    v.currentTime = Math.max(0, (v.duration || 0) - 0.15);
    await v.play().catch(() => {});
  });

  const end = page.getByTestId("end-screen");
  await expect(end).toBeVisible({ timeout: 15000 });
  return end;
}

const VIEWPORTS: Array<[number, number]> = [
  [1280, 720],
  [375, 812],
];

for (const [width, height] of VIEWPORTS) {
  test(`${width}×${height}：结束页标题与出口完整可见可点，「再看一遍」能回收`, async ({
    page,
    request,
  }) => {
    const end = await enterEndedWatch(page, request, width, height);
    const viewport = page.viewportSize()!;

    // 标题在视口内（旧版 375 档标题被裁到画框上方）。
    const title = end.getByRole("heading", { name: "本节已看完" });
    await expect(title).toBeVisible();
    const tb = (await title.boundingBox())!;
    expect(tb.y, "标题顶边在视口内").toBeGreaterThanOrEqual(0);
    expect(tb.y + tb.height, "标题底边在视口内").toBeLessThanOrEqual(viewport.height + 1);

    // 两个无条件出口：完整在视口内 + 中心点命中自己（不被底栏 / dev 浮层盖住）。
    for (const name of ["再看一遍", "返回首页"]) {
      const btn = end.getByRole("button", { name });
      await expect(btn, `「${name}」可见`).toBeVisible();
      const box = (await btn.boundingBox())!;
      expect(box.x, `「${name}」左边在视口内`).toBeGreaterThanOrEqual(0);
      expect(box.y, `「${name}」顶边在视口内`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `「${name}」右边在视口内`).toBeLessThanOrEqual(width + 1);
      expect(box.y + box.height, `「${name}」底边在视口内`).toBeLessThanOrEqual(height + 1);
      const hit = await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          return el ? (el.closest("button")?.textContent ?? "").trim() : "";
        },
        { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      );
      expect(hit, `「${name}」中心点命中自己`).toContain(name);
    }

    // 有数据才出现的出口：只要渲染了，也必须在视口内（旧版它们被裁在画框外）。
    for (const pattern of [/^复习本视频生词/, /^跟读重点句/]) {
      const btn = end.getByRole("button", { name: pattern });
      if ((await btn.count()) === 0) continue;
      const box = (await btn.first().boundingBox())!;
      expect(box.y, `${pattern} 顶边在视口内`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${pattern} 底边在视口内`).toBeLessThanOrEqual(height + 1);
    }

    // 主出口可用：点「再看一遍」→ 覆盖层卸载、视频继续播。
    await end.getByRole("button", { name: "再看一遍" }).click();
    await expect(page.getByTestId("end-screen")).toHaveCount(0, { timeout: 5000 });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const v = document.querySelector("video") as HTMLVideoElement | null;
            return v ? { paused: v.paused, time: v.currentTime } : null;
          }),
        { timeout: 6000 }
      )
      .not.toBeNull();
    const playback = await page.evaluate(() => {
      const v = document.querySelector("video") as HTMLVideoElement | null;
      return v ? { paused: v.paused, time: v.currentTime } : null;
    });
    expect(playback?.paused === false || (playback?.time ?? 99) < 5).toBe(true);
  });
}
